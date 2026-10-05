"""HTTP layer for the Siigo Nube API.

Contains the configuration (``Settings.from_env``), the error model and parser,
the client-side rate limiter, the token cache with lazy refresh, the retry
matrix and the helpers that normalise list responses.

Secrets (access key and bearer token) are never logged and are redacted from
every error text that leaves this module.
"""

from __future__ import annotations

import logging
import os
import re
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import anyio
import httpx
import pydantic_core

from .errors import (
    ErrorItem,
    SiigoAPIError,
    SiigoConfigError,
    SiigoError,
    SiigoNetworkError,
    clone_error,
    lower_keys,
    parse_error,
    without_lone_surrogates,
)

__all__ = [
    "ErrorItem",
    "active_positions",
    "RateLimiter",
    "Settings",
    "SiigoAPIError",
    "SiigoClient",
    "SiigoConfigError",
    "SiigoError",
    "SiigoNetworkError",
    "compact_row",
    "filter_active",
    "http_env_vars",
    "http_init_problem",
    "normalize_list",
    "parse_error",
    "redact_secrets",
    "register_secret",
    "render_json",
    "truncate_output",
]

log = logging.getLogger("siigo_mcp")

DEFAULT_BASE_URL = "https://api.siigo.com"
DEFAULT_RATE_LIMIT = 100
DEFAULT_TIMEOUT = 120.0
CONNECT_TIMEOUT = 15.0
TOKEN_REFRESH_MARGIN = 300  # seconds before expiry at which the token is renewed
MAX_RETRIES = 2
MAX_RETRY_WAIT = 60.0  # total seconds of added waiting per request
# After a failed POST /auth, new calls fail fast (without contacting Siigo) for a while:
AUTH_TRANSIENT_PAUSE = 5.0  # network error, 408, 5xx or unreadable answer
AUTH_RATE_LIMIT_PAUSE = 20.0  # 429 without "Try again in N seconds"; otherwise N
# Any other 4xx (credentials, Partner-Id, URL) holds until siigo_check_connection forces a new
# attempt: the configuration cannot change while the server runs.
MAX_OUTPUT_CHARS = 25_000  # measured on the exact text the client receives (render_json)
COMPACT_STRING_CHARS = 120  # longest string kept in a compact (summarised) row
COMPACT_ROW_CHARS = 1_500  # a compact row never exceeds this, so one always fits
COMPACT_KEY_FIELDS = (
    "id",
    "name",
    "code",
    "identification",
    "branch_office",
    "document",
    "prefix",
    "number",
    "date",
    "customer",
    "provider",
    "due",
    "total",
    "balance",
    "stamp",
    "active",
)
# Proxy and CA variables httpx reads from the environment (trust_env). Proxy names are
# honoured in both cases (lowercase wins); the SSL ones only in uppercase.
PROXY_ENV_VARS = ("ALL_PROXY", "HTTPS_PROXY", "HTTP_PROXY")
CA_ENV_VARS = ("SSL_CERT_FILE", "SSL_CERT_DIR")

PARTNER_ID_RE = re.compile(r"^[A-Za-z0-9]{3,100}$")
IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9]{1,30}$")
DATE_FILTER_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$")
IDEMPOTENT_POST_PATHS = frozenset(
    {"/v1/invoices", "/v1/credit-notes", "/v1/journals", "/v1/vouchers"}
)
TRUTHY = frozenset({"true", "1", "yes"})
FALSY = frozenset({"", "false", "0", "no", "off"})
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
# Answers after which a write may still have been carried out by Siigo.
UNCERTAIN_CODES = frozenset({"request_timeout", "unhandled_error", "service_unavailable"})

SleepFn = Callable[[float], Awaitable[Any]]
ClockFn = Callable[[], float]


# --------------------------------------------------------------------------- secrets

_SECRETS: set[str] = set()


def register_secret(value: str | None) -> None:
    """Remember a secret (access key, token) so ``redact_secrets`` can mask it in logs."""
    if value and len(value) >= 4:
        _SECRETS.add(value)


def redact_secrets(text: str) -> str:
    for secret in sorted(_SECRETS, key=len, reverse=True):
        if secret in text:
            text = text.replace(secret, "***")
    return text


# --------------------------------------------------------------------------- settings


def _default_download_dir() -> Path:
    try:
        return Path.home() / "Downloads" / "siigo"
    except RuntimeError:  # no HOME could be determined (folder listed in .gitignore)
        return Path.cwd() / "siigo-downloads"


@dataclass(frozen=True)
class Settings:
    """Runtime configuration, normally read from environment variables."""

    username: str = ""
    access_key: str = field(default="", repr=False)
    partner_id: str = ""
    base_url: str = DEFAULT_BASE_URL
    rate_limit_per_minute: int = DEFAULT_RATE_LIMIT
    timeout_seconds: float = DEFAULT_TIMEOUT
    download_dir: Path = field(default_factory=_default_download_dir)
    log_level: str = "INFO"
    enable_write: bool = False
    env_problems: tuple[str, ...] = ()

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        """Build settings from the environment. Never raises: problems are recorded."""
        env = os.environ if environ is None else environ
        problems: list[str] = []

        def get(name: str) -> str:
            return (env.get(name) or "").strip()

        rate = DEFAULT_RATE_LIMIT
        raw = get("SIIGO_RATE_LIMIT_PER_MINUTE")
        if raw:
            try:
                rate = int(raw)
                if not 1 <= rate <= 1000:
                    raise ValueError
            except ValueError:
                rate = DEFAULT_RATE_LIMIT
                problems.append(
                    "SIIGO_RATE_LIMIT_PER_MINUTE (inválido: debe ser un entero entre 1 y 1000; "
                    "usa 100 en producción y 10 en la empresa de pruebas)"
                )

        timeout = DEFAULT_TIMEOUT
        raw = get("SIIGO_TIMEOUT_SECONDS")
        if raw:
            try:
                timeout = float(raw)
                if not 1 <= timeout <= 600:
                    raise ValueError
            except ValueError:
                timeout = DEFAULT_TIMEOUT
                problems.append(
                    "SIIGO_TIMEOUT_SECONDS (inválido: debe ser un número entre 1 y 600; "
                    "se recomienda 120)"
                )

        base_url = (get("SIIGO_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        url_problem = _base_url_problem(base_url)
        if url_problem:
            problems.append(f"SIIGO_BASE_URL ({url_problem})")
            base_url = DEFAULT_BASE_URL

        raw = get("SIIGO_DOWNLOAD_DIR")
        download_dir = _default_download_dir()
        if raw:
            try:
                download_dir = Path(raw).expanduser()
            except (RuntimeError, OSError):  # "~usuario_inexistente/...", or no home at all
                problems.append(
                    f"SIIGO_DOWNLOAD_DIR (inválido: no se pudo expandir '~' en {raw!r}; "
                    "usa una ruta absoluta)"
                )

        raw = get("SIIGO_LOG_LEVEL").upper()
        log_level = {"WARN": "WARNING"}.get(raw, raw) or "INFO"
        if log_level not in LOG_LEVELS:
            log_level = "INFO"
            problems.append(
                "SIIGO_LOG_LEVEL (inválido: usa DEBUG, INFO, WARNING, ERROR o CRITICAL)"
            )

        raw = get("SIIGO_ENABLE_WRITE").lower()
        enable_write = raw in TRUTHY
        if not enable_write and raw not in FALSY:
            problems.append(
                f"SIIGO_ENABLE_WRITE (inválido: {raw!r} no se reconoce; usa true, 1 o yes para "
                "habilitar la escritura, o false para dejarla desactivada)"
            )

        return cls(
            username=get("SIIGO_USERNAME"),
            access_key=get("SIIGO_ACCESS_KEY"),
            partner_id=get("SIIGO_PARTNER_ID"),
            base_url=base_url,
            rate_limit_per_minute=rate,
            timeout_seconds=timeout,
            download_dir=download_dir,
            log_level=log_level,
            enable_write=enable_write,
            env_problems=tuple(problems),
        )

    def config_problems(self) -> list[str]:
        """Missing or invalid variables, phrased for the end user (no secret values)."""
        problems: list[str] = []
        if not self.username:
            problems.append("SIIGO_USERNAME (falta: correo del usuario API de Siigo)")
        if not self.access_key:
            problems.append("SIIGO_ACCESS_KEY (falta: access key del usuario API)")
        if not self.partner_id:
            problems.append("SIIGO_PARTNER_ID (falta: nombre de tu aplicación, ej. MiEmpresaMCP)")
        elif not PARTNER_ID_RE.fullmatch(self.partner_id):
            problems.append(
                "SIIGO_PARTNER_ID (inválido: 3 a 100 letras o dígitos, sin espacios, guiones ni "
                "caracteres especiales; ej. MiEmpresaMCP)"
            )
        problems.extend(self.env_problems)
        return problems


def _base_url_problem(url: str) -> str | None:
    try:
        parsed = httpx.URL(url)
    except Exception:  # httpx.InvalidURL and friends
        return "inválido: no es una URL"
    if parsed.scheme not in ("http", "https") or not parsed.host:
        return "inválido: debe ser una URL http(s), ej. https://api.siigo.com"
    if parsed.scheme == "http" and parsed.host not in LOCAL_HOSTS:
        # The access key and the bearer token would travel unencrypted.
        return "inválido: usa https://; http sin cifrar solo se permite para localhost"
    if parsed.path.rstrip("/").lower().endswith("/v1"):
        return "inválido: no incluyas /v1; usa solo el host, ej. https://api.siigo.com"
    return None


def http_env_vars(environ: Mapping[str, str] | None = None) -> list[str]:
    """Names (never values) of the proxy and CA variables httpx will read, as they are set."""
    env = os.environ if environ is None else environ
    names: list[str] = []
    for name in PROXY_ENV_VARS:
        names += [n for n in (name.lower(), name) if (env.get(n) or "").strip()]
    names += [n for n in CA_ENV_VARS if (env.get(n) or "").strip()]
    return names


_USERINFO_RE = re.compile(r"(?<=//)[^/@\s'\"]+@")


def http_init_problem(exc: Exception, environ: Mapping[str, str] | None = None) -> str:
    """Config problem for an HTTP client that could not be built (bad proxy or CA settings)."""
    detail = _USERINFO_RE.sub("***@", redact_secrets(str(exc)))[:300]
    names = http_env_vars(environ)
    where = (
        "Revisa estas variables del entorno con el que se inicia el servidor: " + ", ".join(names)
        if names
        else "Revisa ALL_PROXY, HTTPS_PROXY, HTTP_PROXY, SSL_CERT_FILE y SSL_CERT_DIR (también la "
        "configuración de proxy del sistema)"
    )
    return (
        f"Proxy/certificados HTTP (no se pudo inicializar el cliente HTTP: "
        f"{type(exc).__name__}: {detail}). {where}: corrígelas (proxy http://, https:// o "
        "socks5://; SSL_CERT_FILE debe ser un archivo PEM existente) o defínelas vacías en el "
        "env del servidor MCP, y reinicia el cliente"
    )


# --------------------------------------------------------------------------- limiter


class RateLimiter:
    """Spaces requests evenly: at most one every ``60 / per_minute`` seconds."""

    def __init__(self, per_minute: int, *, clock: ClockFn, sleep: SleepFn):
        self.interval = 60.0 / max(1, per_minute)
        self._clock = clock
        self._sleep = sleep
        self._last: float | None = None
        self._lock = anyio.Lock()

    async def acquire(self) -> float:
        """Wait for the next slot; returns the seconds waited."""
        async with self._lock:
            waited = 0.0
            if self._last is not None:
                wait = self._last + self.interval - self._clock()
                if wait > 0:
                    await self._sleep(wait)
                    waited = wait
            self._last = self._clock()
            return waited


# --------------------------------------------------------------------------- client


def backoff_seconds(attempt: int) -> float:
    return float(min(60, 5 * 2**attempt))


def outcome_unknown(status: int, err: SiigoAPIError) -> bool:
    """A write answered like this may still have been carried out by Siigo."""
    return status == 408 or status >= 500 or bool(err.codes & UNCERTAIN_CODES)


def _clean_params(params: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if not params:
        return None
    out: dict[str, Any] = {}
    for key, value in params.items():
        if value is None or value == "":
            continue
        out[key] = str(value).lower() if isinstance(value, bool) else value
    return out or None


@dataclass
class _AuthFailure:
    """The last failed POST /auth: re-raised (as a copy) instead of being repeated."""

    error: SiigoAPIError | SiigoNetworkError  # pristine copy, never raised itself
    at: float  # clock() when the attempt failed
    until: float  # new calls fail fast until clock() reaches this (inf: until forced)


def _auth_pause(err: SiigoAPIError | SiigoNetworkError) -> float:
    """Seconds during which a new call reuses this /auth failure instead of a new attempt."""
    if isinstance(err, SiigoNetworkError):
        return AUTH_TRANSIENT_PAUSE
    if err.status == 429 or "requests_limit" in err.codes:
        return err.retry_after if err.retry_after is not None else AUTH_RATE_LIMIT_PAUSE
    if err.status == 408 or err.status >= 500 or err.status < 400:
        return AUTH_TRANSIENT_PAUSE  # Siigo-side failure or a 2xx without a usable token
    return float("inf")  # credentials, Partner-Id, URL: repeating cannot succeed


class SiigoClient:
    """Async Siigo client: one per server process (created in the lifespan)."""

    def __init__(
        self,
        settings: Settings,
        http: httpx.AsyncClient,
        *,
        sleep: SleepFn | None = None,
        clock: ClockFn | None = None,
        env_vars: tuple[str, ...] = (),
    ):
        self.settings = settings
        self.http = http
        # Proxy/CA variables the HTTP client honours: named in connection errors.
        self.env_vars = env_vars
        self._sleep: SleepFn = sleep or anyio.sleep
        self._clock: ClockFn = clock or time.monotonic
        self.limiter = RateLimiter(
            settings.rate_limit_per_minute, clock=self._clock, sleep=self._sleep
        )
        self._token: str | None = None
        self._expires_at = 0.0
        self._auth_lock = anyio.Lock()
        # Single-flight /auth, failures included (spec A.4): every completed attempt bumps the
        # counter, and the last failure is kept so callers that queued behind it share it.
        self._auth_attempts = 0
        self._auth_failure: _AuthFailure | None = None
        register_secret(settings.access_key)

    # -- helpers -------------------------------------------------------------

    def redact(self, text: str) -> str:
        """Mask the access key and every token this process has received.

        Not only the current token: a request sent with an earlier token can fail after a
        concurrent call renewed it, and Siigo may echo the old (possibly still valid) token.
        """
        for secret in (self.settings.access_key, self._token):
            if secret and len(secret) >= 4:
                text = text.replace(secret, "***")
        return redact_secrets(text)

    def _check_config(self) -> None:
        problems = self.settings.config_problems()
        if problems:
            raise SiigoConfigError(problems)

    async def _send(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str],
        params: dict[str, Any] | None = None,
        json_body: Any = None,
    ) -> httpx.Response:
        """Send one request and read its body.

        A body that cannot be decoded (corrupt gzip/deflate from a gateway) raises
        SiigoAPIError ``invalid_response`` with the real status, so a write Siigo answered 2xx
        is reported as probably done instead of as a generic failure.
        """
        await self.limiter.acquire()
        request = self.http.build_request(
            method, path, headers=headers, params=params, json=json_body
        )
        response = await self.http.send(request, stream=True)
        try:
            await response.aread()
        except httpx.DecodingError:
            status = response.status_code
            err = SiigoAPIError(
                status,
                [ErrorItem("invalid_response", "La respuesta de Siigo no se pudo decodificar")],
                method=method,
                path=path,
            )
            err.may_have_executed = method != "GET" and (
                200 <= status < 300 or status == 408 or status >= 500
            )
            raise err from None
        finally:
            await response.aclose()
        return response

    def _network_error(
        self, exc: httpx.TransportError, method: str, path: str, *, may_have_executed: bool
    ) -> SiigoNetworkError:
        is_timeout = isinstance(exc, httpx.TimeoutException)
        kind = "tiempo de espera agotado" if is_timeout else type(exc).__name__
        hint = ""
        if self.env_vars:
            hint = (
                "El servidor usa proxy/certificados del entorno ("
                + ", ".join(self.env_vars)
                + "): revisa que esas variables sean correctas y que el proxy esté activo, o "
                "defínelas vacías en el env del servidor MCP si no lo necesitas."
            )
        return SiigoNetworkError(
            self.redact(f"{method} {path}: {kind}"),
            timeout=is_timeout,
            may_have_executed=may_have_executed,
            hint=hint,
        )

    # -- auth ----------------------------------------------------------------

    @property
    def token_expires_in(self) -> float:
        return max(0.0, self._expires_at - self._clock()) if self._token else 0.0

    async def authenticate(self, *, force: bool = False, stale: str | None = None) -> str:
        """Return a valid token, calling ``POST /auth`` only when needed.

        ``force`` always renews. ``stale`` is a token Siigo just rejected (401): it is
        dropped if it is still the cached one, so concurrent 401s share a single renewal.

        A still-valid cached token is always used, whatever happened to a later attempt: a
        failed forced renewal (siigo_check_connection) neither discards it nor blocks calls.
        Without one, failures are shared (spec A.4: concurrent calls share one /auth): a
        caller that was waiting while an attempt failed gets that same error instead of
        sending another POST /auth, and new calls reuse it for a while (``_auth_pause``)
        without contacting Siigo, since every failed request counts toward the 80% lockout.
        ``force`` ignores that pause and always tries again.
        """
        self._check_config()
        attempts_seen = self._auth_attempts
        async with self._auth_lock:
            if stale is not None and self._token == stale:
                self._token = None
            if not force and self._token is not None and self._clock() < self._expires_at:
                return self._token
            failure = self._auth_failure
            if failure is not None:
                now = self._clock()
                if self._auth_attempts != attempts_seen or (not force and now < failure.until):
                    raise self._shared_auth_failure(failure, now)
            # A cancelled attempt records nothing: a waiting caller makes its own.
            try:
                token = await self._request_token()
            except (SiigoAPIError, SiigoNetworkError) as err:
                now = self._clock()
                self._auth_failure = _AuthFailure(clone_error(err), now, now + _auth_pause(err))
                self._auth_attempts += 1
                raise
            self._auth_failure = None
            self._auth_attempts += 1
            return token

    def _shared_auth_failure(
        self, failure: _AuthFailure, now: float
    ) -> SiigoAPIError | SiigoNetworkError:
        """A fresh copy of the last /auth failure, saying it was not repeated and until when."""
        err = clone_error(failure.error)
        ago = max(0.0, now - failure.at)
        left = failure.until - now
        if isinstance(err, SiigoAPIError) and err.retry_after is not None:
            err.retry_after = max(0.0, err.retry_after - ago)
        if left == float("inf"):
            when = (
                "no se volverá a intentar hasta que llames a siigo_check_connection, una vez "
                "corregida la causa (si cambias variables de entorno, reinicia el cliente)"
            )
        elif left > 0:
            when = f"se podrá reintentar en {max(1, round(left))} s"
        else:
            when = "ya puedes volver a intentarlo"
        err.note = (
            f"(Es el mismo error del último POST /auth, de hace {ago:.0f} s: no se repitió para "
            f"no sumar solicitudes fallidas a la regla del 80%; {when}.)"
        )
        return err

    async def _request_token(self) -> str:
        """One POST /auth (called with the auth lock held)."""
        settings = self.settings
        headers = {
            "Partner-Id": settings.partner_id,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        body = {"username": settings.username, "access_key": settings.access_key}
        try:
            resp = await self._send("POST", "/auth", headers=headers, json_body=body)
        except httpx.TransportError as exc:
            raise self._network_error(exc, "POST", "/auth", may_have_executed=False) from None
        except SiigoAPIError as err:  # unreadable body
            err.during_auth = True
            err.may_have_executed = False
            raise
        if not resp.is_success:
            err = parse_error(resp, redact=self.redact)
            err.during_auth = True
            raise err
        try:
            data = resp.json()
        except ValueError:
            data = None
        token = lower_keys(data).get("access_token")
        if not isinstance(token, str) or not token.strip():
            # null, "" or a non-string would be cached and sent as "Bearer None".
            err = SiigoAPIError(
                resp.status_code,
                [ErrorItem("invalid_response", "La respuesta de /auth no trae access_token")],
            )
            err.during_auth = True
            raise err
        token = token.strip()
        try:
            expires_in = float(lower_keys(data).get("expires_in") or 86400)
        except (TypeError, ValueError):
            expires_in = 86400.0
        lifetime = expires_in - TOKEN_REFRESH_MARGIN
        if lifetime <= 0:
            lifetime = expires_in / 2
        register_secret(token)
        self._token = token
        self._expires_at = self._clock() + lifetime
        log.info("Token de Siigo obtenido (vence en %.0f s)", expires_in)
        return token

    # -- requests ------------------------------------------------------------

    @staticmethod
    def _retryable(method: str, keyed: bool, status: int, err: SiigoAPIError) -> bool:
        if status == 429 or "requests_limit" in err.codes:
            return method != "POST" or keyed
        if status == 500:
            return method == "GET"
        if status in (502, 503, 504):
            return method == "GET" or (method == "POST" and keyed)
        return False

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json_body: Any = None,
        idempotency_key: str | None = None,
        response_info: dict[str, Any] | None = None,
    ) -> Any:
        """Call Siigo applying auth, rate limit and the retry matrix (spec B.4).

        ``response_info``, when given, receives on success the answer's ``status``, its
        ``Date`` header (``date``, Siigo's clock) and the seconds since this call started
        (``elapsed``, retries and waits included).
        """
        method = method.upper()
        self._check_config()
        started = self._clock()
        idem_path = method == "POST" and path in IDEMPOTENT_POST_PATHS
        if idempotency_key is not None:
            if not idem_path:
                raise ValueError(f"Idempotency-Key no aplica a {method} {path}")
            if not IDEMPOTENCY_KEY_RE.fullmatch(idempotency_key):
                raise ValueError("Idempotency-Key inválida: 1 a 30 letras o dígitos")
        elif idem_path:
            # The caller owns the key (it must reuse it to retry the same document safely).
            raise ValueError(f"POST {path} requiere una Idempotency-Key del llamador")
        keyed = idempotency_key is not None
        clean = _clean_params(params)

        retries = 0
        waited = 0.0
        reauthed = False
        uncertain = False  # an earlier attempt of this write may have reached Siigo

        def mark(err: SiigoAPIError | SiigoNetworkError) -> None:
            # Whatever fails after an attempt that may have reached Siigo (a renewal of the
            # token included) must still say the write may have been carried out.
            if method != "GET" and uncertain:
                err.may_have_executed = True

        while True:
            try:
                token = await self.authenticate()
            except (SiigoAPIError, SiigoNetworkError) as err:
                mark(err)
                raise
            headers = {
                "Authorization": f"Bearer {token}",
                "Partner-Id": self.settings.partner_id,
                "Accept": "application/json",
            }
            if keyed:
                headers["Idempotency-Key"] = idempotency_key  # type: ignore[assignment]
            try:
                resp = await self._send(
                    method, path, headers=headers, params=clean, json_body=json_body
                )
            except SiigoAPIError as err:  # body could not be decoded
                mark(err)
                raise
            except httpx.TransportError as exc:
                can_retry = method == "GET" or (method == "POST" and keyed)
                wait = backoff_seconds(retries)
                if can_retry and retries < MAX_RETRIES and waited + wait <= MAX_RETRY_WAIT:
                    uncertain = uncertain or method != "GET"
                    log.warning(
                        "Siigo %s %s: %s; reintento %d en %.0f s",
                        method,
                        path,
                        type(exc).__name__,
                        retries + 1,
                        wait,
                    )
                    await self._sleep(wait)
                    waited += wait
                    retries += 1
                    continue
                raise self._network_error(
                    exc, method, path, may_have_executed=method != "GET"
                ) from None

            if resp.is_success:
                if response_info is not None:
                    response_info.update(
                        status=resp.status_code,
                        date=resp.headers.get("date"),
                        elapsed=max(0.0, self._clock() - started),
                    )
                return self._decode(resp, method, path)

            err = parse_error(resp, redact=self.redact)
            if method != "GET":
                err.may_have_executed = uncertain or outcome_unknown(resp.status_code, err)
            if resp.status_code == 401 or "unauthorized" in err.codes:
                if not reauthed:
                    reauthed = True
                    log.info("Siigo respondió 401; renovando token y reintentando una vez")
                    try:
                        await self.authenticate(stale=token)
                    except (SiigoAPIError, SiigoNetworkError) as auth_err:
                        mark(auth_err)
                        raise
                    continue
                self._token = None
                err.auth_failed = True
                raise err

            if self._retryable(method, keyed, resp.status_code, err) and retries < MAX_RETRIES:
                # Spec B.4 wait order, for every retryable status: "N sec" in the message,
                # then Retry-After, then exponential backoff. A wait over budget gives up now.
                wait = err.retry_after if err.retry_after is not None else backoff_seconds(retries)
                if waited + wait <= MAX_RETRY_WAIT:
                    uncertain = err.may_have_executed
                    log.warning(
                        "Siigo %s %s: HTTP %s %s; reintento %d en %.0f s",
                        method,
                        path,
                        resp.status_code,
                        err.code,
                        retries + 1,
                        wait,
                    )
                    await self._sleep(wait)
                    waited += wait
                    retries += 1
                    continue
            raise err

    def _decode(self, resp: httpx.Response, method: str, path: str) -> Any:
        if resp.status_code == 204 or not resp.content:
            return {}
        try:
            return without_lone_surrogates(resp.json())
        except ValueError:
            err = SiigoAPIError(
                resp.status_code,
                [ErrorItem("invalid_response", "La respuesta de Siigo no es JSON válido")],
                self.redact(resp.text[:300]),
                method=method,
                path=path,
            )
            err.may_have_executed = method != "GET"  # Siigo answered 2xx: it probably did it
            raise err from None

    async def get(self, path: str, params: Mapping[str, Any] | None = None) -> Any:
        return await self.request("GET", path, params=params)

    async def post(
        self,
        path: str,
        json_body: Any = None,
        *,
        idempotency_key: str | None = None,
        response_info: dict[str, Any] | None = None,
    ) -> Any:
        return await self.request(
            "POST",
            path,
            json_body=json_body,
            idempotency_key=idempotency_key,
            response_info=response_info,
        )

    async def delete(self, path: str) -> Any:
        return await self.request("DELETE", path)


# --------------------------------------------------------------------------- list helpers


def _to_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_list(data: Any, page: int = 1) -> dict[str, Any]:
    """Turn a Siigo list answer (envelope, ``value`` wrapper or plain array) into one shape."""
    if isinstance(data, dict) and isinstance(data.get("value"), dict):
        data = data["value"]  # accounts-payable variant
    if isinstance(data, list):
        return {
            "page": 1,
            "page_size": len(data),
            "total_results": len(data),
            "count": len(data),
            "has_more": False,
            "next_page": None,
            "results": data,
        }
    if not isinstance(data, dict):
        data = {}
    pagination = lower_keys(data.get("pagination"))
    results = data.get("results") or []
    if not isinstance(results, list):
        results = [results]
    size = _to_int(pagination.get("page_size"), 0) or len(results) or 1
    total = _to_int(pagination.get("total_results"), len(results))
    current = _to_int(pagination.get("page"), page) or page
    more = bool(results) and current * size < total
    return {
        "page": current,
        "page_size": size,
        "total_results": total,
        "count": len(results),
        "has_more": more,
        "next_page": current + 1 if more else None,
        "results": results,
    }


def render_json(value: Any) -> str:
    """The text a tool result is delivered as: compact JSON with non-ASCII kept.

    The server sends exactly this string as the result's text block, so the output cap is
    measured on what the client (and the model) actually receives.
    """
    return pydantic_core.to_json(value, fallback=str).decode()


def _json_len(value: Any) -> int:
    return len(render_json(value))


_DROP = object()


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, str | int | float | bool)


def _clip(value: Any) -> Any:
    if isinstance(value, str) and len(value) > COMPACT_STRING_CHARS:
        return value[: COMPACT_STRING_CHARS - 1] + "…"
    return value


def _compact_value(value: Any) -> Any:
    if _is_scalar(value):
        return _clip(value)
    if isinstance(value, dict):
        inner = {str(k): _clip(v) for k, v in value.items() if _is_scalar(v)}
        return inner if inner or not value else _DROP
    if isinstance(value, list) and all(_is_scalar(v) for v in value):
        return [_clip(v) for v in value[:5]]
    return _DROP  # lists of objects (items, payments, contacts...) are left out


def compact_row(row: Any) -> dict[str, Any]:
    """Summary of a listing row: simple fields only (strings clipped), never over 1,500 chars.

    Used when a page does not fit: the row is still listed (its id, name, date, customer,
    totals, status...) instead of being dropped; the listing's siigo_get_* tool, when there
    is one, gives the full record.
    """
    if not isinstance(row, dict):
        return {"value": _clip(row if _is_scalar(row) else str(row)), "_compact": True}
    out: dict[str, Any] = {}
    for key, value in row.items():
        small = _compact_value(value)
        if small is not _DROP:
            out[str(key)] = small
    out["_compact"] = True
    if _json_len(out) > COMPACT_ROW_CHARS:
        out = {k: out[k] for k in COMPACT_KEY_FIELDS if k in out}
        out["_compact"] = True
    if _json_len(out) > COMPACT_ROW_CHARS:
        ident = row.get("id")
        out = {"id": _clip(ident if _is_scalar(ident) else str(ident)), "_compact": True}
    return out


_LIMIT_TEXT = f"Respuesta recortada para no exceder {MAX_OUTPUT_CHARS:,} caracteres".replace(
    ",", "."
)


def _truncated(
    base: dict[str, Any],
    positions: list[int],
    rows_out: list[Any],
    full: int,
    paginated: bool,
    detail_tool: str | None,
    filterable: bool,
) -> dict[str, Any]:
    """``base`` with only ``rows_out`` (its first ``full`` rows complete, the rest compact).

    The advice names only what exists for this listing: its siigo_get_* tool (``detail_tool``)
    and its filters (``filterable``).
    """
    total = len(base["results"])
    covered = len(rows_out)
    omitted = total - covered
    compacted = covered - full
    out = dict(base)
    out.update(
        truncated=True,
        results=rows_out,
        count=covered,
        compacted=compacted,
        omitted=omitted,
        resume=None,
    )
    notes = [_LIMIT_TEXT + "."]
    english = "rows with _compact are summaries" if compacted else "rows were left out"
    detail = (
        f"para ver el registro completo usa {detail_tool} con su id."
        if detail_tool
        else "ninguna herramienta devuelve el registro completo."
    )
    if compacted and paginated:
        notes.append(
            "La fila que viene resumida (`_compact: true`: solo campos simples, sin ítems, "
            f"pagos ni contactos) no cabe completa ni sola; {detail}"
        )
    elif compacted:
        notes.append(
            f"Las últimas {compacted} filas vienen resumidas (`_compact: true`: solo campos "
            f"simples, sin ítems, pagos ni contactos); {detail}"
        )
    if omitted and paginated:
        page = _to_int(base.get("page"), 1) or 1
        size = _to_int(base.get("page_size"), total) or total
        resume = {"page": page, "page_size": size, "skip": positions[covered]}
        out.update(resume=resume, has_more=True, next_page=None)
        notes.append(
            f"Faltan {omitted} filas de esta página: NO uses next_page (te las saltarías); "
            "llama de nuevo a esta herramienta con los mismos filtros y "
            f"page={resume['page']}, page_size={resume['page_size']}, skip={resume['skip']} "
            "(los valores de `resume`); cuando una respuesta no traiga `resume`, sigue con "
            "next_page, el mismo page_size y skip=0."
        )
        english += "; call again with the page, page_size and skip of `resume`, not next_page"
    elif omitted:
        ways = (["filtros más específicos"] if filterable else []) + (
            [f"{detail_tool} con el id"] if detail_tool else []
        )
        how = (
            "; para llegar a ellos usa " + " o ".join(ways)
            if ways
            else "; ninguna otra herramienta los devuelve"
        )
        notes.append(
            f"Se omitieron los últimos {omitted} registros (este listado no se pagina en "
            f"Siigo){how}."
        )
        english += "; this listing has no pages"
    elif paginated:
        notes.append("La página está completa: puedes seguir con next_page.")
    notes.append(f"(Output truncated: {english}.)")
    out["truncation_message"] = " ".join(notes)
    return out


def truncate_output(
    result: dict[str, Any],
    limit: int = MAX_OUTPUT_CHARS,
    *,
    paginated: bool = True,
    positions: list[int] | None = None,
    skip: int = 0,
    detail_tool: str | None = None,
    filterable: bool = False,
) -> dict[str, Any]:
    """Fit a normalised listing in ``limit`` characters of delivered text without losing rows.

    ``positions[i]`` is the index in the Siigo page of ``results[i]`` (rows filtered out
    locally, e.g. inactive users, leave gaps) and ``skip`` drops the rows before that index:
    it is the ``resume.skip`` of an earlier, truncated answer for the same page.

    When a paginated page does not fit, it keeps the complete rows that fit and gets
    ``resume`` (same page and page_size, a larger ``skip``) instead of ``next_page``, so paging
    never skips a row and every row arrives complete exactly once. A row that does not fit even
    alone arrives summarised (``compact_row``, at most 1,500 chars), so every answer carries
    at least one row and following ``resume`` always makes progress. A listing without pages
    (catalogs) cannot be resumed: the rows that do not fit complete are summarised instead.
    ``detail_tool`` and ``filterable`` say what the advice may point to (see ``_truncated``).
    """
    rows = list(result.get("results") or [])
    pos = list(positions) if positions is not None else list(range(len(rows)))
    base = result
    if skip:
        keep = [i for i, p in enumerate(pos) if p >= skip]
        rows = [rows[i] for i in keep]
        pos = [pos[i] for i in keep]
        base = dict(result, results=rows, count=len(rows), skip=skip)
    if _json_len(base) <= limit:
        return base
    hints = (detail_tool, filterable)
    skeleton = _truncated(base, pos, [], 0, paginated, *hints)
    budget = limit - _json_len(skeleton) - 600  # room for the longer message and resume
    full_sizes = [_json_len(row) + 1 for row in rows]  # +1: the comma
    rows_out: list[Any] = []
    full = 0
    if paginated:
        # Complete rows while they fit; the rest comes complete through `resume`.
        for row, size in zip(rows, full_sizes, strict=True):
            if size > budget:
                break
            rows_out.append(row)
            full += 1
            budget -= size
        if not rows_out and rows:  # one oversized row: summarised, `resume` starts after it
            rows_out = [compact_row(rows[0])]
    else:
        # No pages to resume from: list as many rows as possible, summarised, then give
        # complete rows back from the start while the budget allows.
        compacts = [compact_row(row) for row in rows]
        sizes = [_json_len(row) + 1 for row in compacts]
        used = covered = 0
        while covered < len(rows) and used + sizes[covered] <= budget:
            used += sizes[covered]
            covered += 1
        covered = max(covered, min(1, len(rows)))
        while full < covered and used - sizes[full] + full_sizes[full] <= budget:
            used += full_sizes[full] - sizes[full]
            full += 1
        rows_out = rows[:full] + compacts[full:covered]
    while True:
        out = _truncated(base, pos, rows_out, full, paginated, *hints)
        if _json_len(out) <= limit or not rows_out or (len(rows_out) == 1 and full == 0):
            return out
        if len(rows_out) > 1:
            rows_out.pop()
            full = min(full, len(rows_out))
        else:
            rows_out, full = [compact_row(rows[0])], 0


def active_positions(results: list[Any], include_inactive: bool) -> list[int]:
    """Indexes of the rows ``filter_active`` keeps."""
    return [
        i
        for i, r in enumerate(results)
        if include_inactive or not (isinstance(r, dict) and r.get("active") is False)
    ]


def filter_active(results: list[Any], include_inactive: bool) -> list[Any]:
    if include_inactive:
        return results
    return [results[i] for i in active_positions(results, include_inactive)]
