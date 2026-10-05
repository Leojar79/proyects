"""Siigo error model: parsing of the error envelope, hint table and Spanish messages.

Siigo answers errors as ``{"Status": 400, "Errors": [{"Code", "Message", "Params",
"Detail"}]}``. Key casing varies between sources (PascalCase or lowercase), so every
key is lowercased before reading, and every entry of ``Errors`` is reported.
Messages produced here never contain the token, the access key or request headers.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx

_E = TypeVar("_E", bound=BaseException)


@dataclass(frozen=True)
class ErrorItem:
    code: str
    message: str
    params: tuple[str, ...] = ()
    detail: str | None = None


class SiigoError(Exception):
    """Base class for every error raised by this module."""

    # Extra sentence appended to the user-facing text (e.g. "this /auth failure was not
    # repeated"). Set on a copy, never on a shared instance.
    note: str = ""


def clone_error(err: _E) -> _E:
    """A copy of ``err`` with the same attributes, safe to mutate and raise independently.

    One stored /auth failure is re-raised to several concurrent callers, and each caller may
    mark its own copy (``may_have_executed``) without affecting the others.
    """
    new = type(err).__new__(type(err))
    new.__dict__.update(err.__dict__)
    new.args = err.args
    return new


class SiigoConfigError(SiigoError):
    def __init__(self, problems: Iterable[str]):
        self.problems = list(problems)
        super().__init__("; ".join(self.problems))


class SiigoAPIError(SiigoError):
    """Non-2xx answer from Siigo, with every entry of the ``Errors`` array."""

    def __init__(
        self,
        status: int,
        errors: Iterable[ErrorItem] = (),
        text: str = "",
        *,
        retry_after: float | None = None,
        method: str = "",
        path: str = "",
    ):
        self.status = status
        self.errors = list(errors)
        self.text = text
        self.retry_after = retry_after
        self.method = method
        self.path = path
        self.during_auth = False
        self.auth_failed = False
        # True when this was not a GET and Siigo may have carried it out anyway (an earlier
        # attempt timed out, or the answer was 408/5xx/2xx-unreadable): verify before repeating.
        self.may_have_executed = False
        summary = "; ".join(f"{e.code}: {e.message}" for e in self.errors) or text
        super().__init__(f"HTTP {status} {summary}".strip())

    @property
    def code(self) -> str:
        return self.errors[0].code if self.errors else ""

    @property
    def codes(self) -> set[str]:
        return {e.code.lower() for e in self.errors if e.code}


class SiigoNetworkError(SiigoError):
    """Timeout or transport failure (no HTTP answer)."""

    def __init__(self, message: str, *, timeout: bool, may_have_executed: bool, hint: str = ""):
        self.timeout = timeout
        self.may_have_executed = may_have_executed
        self.hint = hint  # e.g. which proxy variables the connection went through
        super().__init__(message)


def lower_keys(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {str(k).lower(): v for k, v in value.items()}
    return {}


_SECONDS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:sec|seg)", re.IGNORECASE)


def _retry_after(errors: list[ErrorItem], text: str, headers: httpx.Headers) -> float | None:
    for message in [e.message for e in errors] + [text]:
        match = _SECONDS_RE.search(message or "")
        if match:
            return float(match.group(1))
    header = headers.get("retry-after", "").strip()
    if header:
        try:
            return max(0.0, float(header))
        except ValueError:
            return None
    return None


def parse_error(
    resp: httpx.Response, *, redact: Callable[[str], str] = lambda s: s
) -> SiigoAPIError:
    """Parse Siigo's error envelope case-insensitively, keeping every entry."""
    try:
        text = resp.text or ""
    except Exception:  # undecodable body
        text = ""
    try:
        body = resp.json()
    except ValueError:
        body = None
    items: list[ErrorItem] = []
    low = lower_keys(body)
    raw_errors = low.get("errors")
    if isinstance(raw_errors, dict):
        raw_errors = [raw_errors]
    if isinstance(raw_errors, list):
        for raw in raw_errors:
            if isinstance(raw, str):
                items.append(ErrorItem(code="", message=redact(raw)))
                continue
            entry = lower_keys(raw)
            if not entry:
                continue
            params = entry.get("params") or []
            if isinstance(params, str):
                params = [params]
            if not isinstance(params, list):
                params = [params]
            detail = entry.get("detail")
            items.append(
                ErrorItem(
                    code=redact(str(entry.get("code") or "")),
                    message=redact(str(entry.get("message") or "")),
                    params=tuple(redact(str(p)) for p in params if p not in (None, "")),
                    detail=redact(str(detail))[:200] if detail else None,
                )
            )
    if not items and low:
        message = low.get("message") or low.get("error_description") or low.get("error")
        code = low.get("code")
        if message or code:
            items.append(
                ErrorItem(code=redact(str(code or "")), message=redact(str(message or "")))
            )
    clean_text = "" if items else redact(text.strip())[:300]
    try:
        method, path = resp.request.method, resp.request.url.path
    except RuntimeError:  # response built without a request (tests)
        method, path = "", ""
    return SiigoAPIError(
        resp.status_code,
        items,
        clean_text,
        retry_after=_retry_after(items, text, resp.headers),
        method=method,
        path=path,
    )


# --------------------------------------------------------------------------- user messages

_PARTNER_HINT = (
    "Configura SIIGO_PARTNER_ID con 3 a 100 letras o dígitos, sin espacios ni guiones "
    "(ej. MiEmpresaMCP). Si el formato ya es válido y el error persiste, Siigo puede exigir "
    "que el Partner-Id esté registrado: contacta a soporte de Siigo."
)
_CREDENTIALS_HINT = (
    "Revisa SIIGO_USERNAME (correo del usuario API) y SIIGO_ACCESS_KEY; el usuario API puede "
    "estar bloqueado (Siigo bloquea usuarios con más del 80% de solicitudes fallidas en 7 días "
    "y avisa por correo)."
)
_SIIGO_SIDE_HINT = "Falla del lado de Siigo; intenta de nuevo en unos minutos."
_NOT_FOUND_HINT = (
    "Revisa el ID (GUID); obténlo con la herramienta siigo_list_* correspondiente "
    "(p. ej. siigo_list_invoices o siigo_list_customers). Las compras no tienen listado: el ID "
    "de una factura de compra debe darlo el usuario."
)
# POST /auth takes no ID: a 404/405, a redirect or a 2xx without a token means the request
# did not reach Siigo's authentication service.
_BASE_URL_HINT = (
    "Revisa SIIGO_BASE_URL: debe ser solo la dirección de la API, sin rutas "
    "(https://api.siigo.com, sin /v1 ni rutas de otros gateways como /alliances/api); si usas un "
    "proxy (HTTPS_PROXY, ALL_PROXY), revisa también que no intercepte la conexión."
)

HINTS: dict[str, str] = {
    "header_required": _PARTNER_HINT,
    "invalid_partner_id": _PARTNER_HINT,
    "unauthorized": _CREDENTIALS_HINT,
    "not_found": _NOT_FOUND_HINT,
    "already_exists": (
        "El tercero ya existe; búscalo con siigo_list_customers(identification=...)."
    ),
    "customer_settings": "El cliente no tiene contactos; agrégale al menos uno en Siigo.",
    "document_settings": (
        "El tipo de comprobante no tiene una resolución DIAN vigente. Para pruebas usa un tipo "
        "FV con electronic_type=NoElectronic (consulta siigo_list_document_types(type='FV'))."
    ),
    "invalid_total_payments": (
        "La suma de payments[].value debe ser igual al total de la factura. Por ítem: base = "
        "cantidad×precio − descuento; impuesto = base×%/100; ambos redondeados a 2 decimales."
    ),
    "parameter_inactive": (
        "Un producto, impuesto, forma de pago, vendedor o centro de costo referenciado está "
        "inactivo."
    ),
    "duplicated_document": (
        "El número de documento ya existe; omite `number` cuando el tipo de comprobante tiene "
        "numeración automática."
    ),
    "disabled_functionality": (
        "Funcionalidad no habilitada para esta empresa o para el ambiente de pruebas (sandbox)."
    ),
    "unhandled_error": _SIIGO_SIDE_HINT,
    "service_unavailable": _SIIGO_SIDE_HINT,
    "request_timeout": _SIIGO_SIDE_HINT,
    "invalid_idempotency-key": "La Idempotency-Key debe tener de 1 a 30 letras o dígitos.",
    "invalid_date": "Usa fechas yyyy-MM-dd o yyyy-MM-ddTHH:mm:ssZ.",
    "invalid_date_range": "Revisa el rango de fechas: el inicio debe ser anterior al fin.",
    "parameter_not_allowed": "Uno de los parámetros enviados no es aceptado por este endpoint.",
    "delete_not_allowed": (
        "Siigo no permite eliminar este documento (p. ej. ya fue enviado a la DIAN o tiene "
        "documentos relacionados); evalúa anularlo o emitir una nota crédito."
    ),
    "update_not_allowed": "Siigo no permite modificar este documento en su estado actual.",
}
HINTS["invalid_dian_resolution"] = HINTS["document_settings"]

_STATUS_HINTS: dict[int, str] = {
    400: (
        "Revisa los datos enviados. No repitas la misma solicitud sin corregirla: cada solicitud "
        "fallida cuenta para la regla de bloqueo del 80%."
    ),
    401: _CREDENTIALS_HINT,
    403: (
        "Acceso denegado: la funcionalidad puede no estar habilitada para esta empresa o el "
        "usuario API no tiene permisos."
    ),
    404: _NOT_FOUND_HINT,
    408: _SIIGO_SIDE_HINT,
    409: "El documento está en un estado que no permite esta operación.",
}


_MISSING_CODES = {"parameter_required", "parameter_empty"}


def _wait_hint(err: SiigoAPIError) -> str:
    wait = f"{err.retry_after:.0f} s" if err.retry_after is not None else "unos 20 s"
    return (
        f"Límite de solicitudes de Siigo alcanzado: espera {wait} y vuelve a intentar. "
        "La empresa de pruebas solo permite 10 solicitudes por minuto "
        "(configura SIIGO_RATE_LIMIT_PER_MINUTE=10)."
    )


def hints_for(err: SiigoAPIError) -> list[str]:
    hints: list[str] = []

    def add(text: str) -> None:
        if text and text not in hints:
            hints.append(text)

    if err.during_auth and (err.status < 400 or err.status in (404, 405)):
        add(_BASE_URL_HINT)
    missing = [p for e in err.errors if e.code.lower() in _MISSING_CODES for p in e.params]
    for code in dict.fromkeys(e.code.lower() for e in err.errors if e.code):
        if err.during_auth and code == "not_found":
            continue
        if code == "requests_limit":
            add(_wait_hint(err))
        elif code in _MISSING_CODES:
            if missing:
                add("Falta(n) el/los campo(s): " + ", ".join(dict.fromkeys(missing)) + ".")
            else:
                add("Falta un campo obligatorio; revisa el mensaje de Siigo.")
        elif code in HINTS:
            add(HINTS[code])
    if err.status == 429 and not hints:
        add(_wait_hint(err))
    credential_failure = err.auth_failed or (err.during_auth and err.status in (400, 401, 403))
    if credential_failure and _PARTNER_HINT not in hints:
        add(_CREDENTIALS_HINT)
    if not hints:
        if err.status in _STATUS_HINTS:
            add(_STATUS_HINTS[err.status])
        elif err.status >= 500:
            add(_SIIGO_SIDE_HINT)
    return hints


def format_api_error(err: SiigoAPIError, *, execution_note: bool = True) -> str:
    """User-facing text. ``execution_note=False`` lets a caller word that warning itself."""
    lines: list[str] = []
    for e in err.errors:
        line = f"Siigo {err.status} {e.code or 'error'}: {e.message or '(sin mensaje)'}"
        if e.params:
            line += f" (params: {', '.join(e.params)})"
        if e.detail:
            line += f" [detalle: {e.detail}]"
        lines.append(line)
    if not lines:
        lines.append(f"Siigo HTTP {err.status}: {err.text or '(respuesta sin cuerpo)'}")
    success = 200 <= err.status < 300  # 2xx whose body could not be read
    if err.during_auth:
        header = "Falló la autenticación con Siigo (POST /auth)."
    elif err.auth_failed:
        header = "Siigo rechazó el token incluso después de renovarlo."
    elif success and err.method and err.path:
        header = (
            f"Siigo respondió {err.status} a {err.method} {err.path}, pero la respuesta no se "
            "pudo leer."
        )
    elif err.method and err.path:
        header = f"Siigo rechazó {err.method} {err.path}."
    else:
        header = ""
    if err.may_have_executed and execution_note:
        outcome = "probablemente SÍ se ejecutó" if success else "pudo haberse ejecutado"
        lines.append(
            f"La operación {outcome} en Siigo: verifícalo con la herramienta siigo_list_* o "
            "siigo_get_* correspondiente antes de repetirla."
        )
    message = "\n".join(([header] if header else []) + lines)
    hints = hints_for(err)
    if hints:
        message += "\nQué hacer: " + " ".join(hints)
    if err.note:
        message += "\n" + err.note
    return message


def format_network_error(err: SiigoNetworkError, *, execution_note: bool = True) -> str:
    """User-facing text. ``execution_note=False`` lets a caller word that warning itself."""
    if err.timeout:
        message = f"Siigo no respondió a tiempo ({err}). "
    else:
        message = (
            f"No se pudo conectar con Siigo ({err}). Verifica la conexión a internet, el proxy o "
            "firewall y SIIGO_BASE_URL. "
        )
    if err.may_have_executed:
        if execution_note:
            message += (
                "La operación pudo haberse ejecutado en Siigo: verifica con la herramienta "
                "siigo_list_* o siigo_get_* correspondiente antes de repetirla."
            )
    else:
        message += "Intenta de nuevo en unos minutos."
    if err.hint:
        message += " " + err.hint
    if err.note:
        message += " " + err.note
    return message


def format_config_error(err: SiigoConfigError) -> str:
    items = "\n".join(f"- {p}" for p in err.problems)
    return (
        "La configuración de Siigo está incompleta o es inválida:\n"
        f"{items}\n"
        "Corrige estas variables en el entorno del servidor MCP, reinicia el cliente y prueba "
        "siigo_check_connection. Claude Code no permite cambiar las variables de un servidor ya "
        "registrado (repetir claude mcp add responde 'already exists'): quítalo con "
        "claude mcp remove siigo_mcp -s <alcance> (claude mcp get siigo_mcp muestra el alcance) "
        "y regístralo de nuevo con claude mcp add y todas sus -e VARIABLE=valor; si lo "
        "registraste con --env-file, basta con editar ese archivo .env. En Claude Desktop, "
        "edita el bloque env de claude_desktop_config.json."
    )


def format_error(exc: SiigoError) -> str:
    if isinstance(exc, SiigoAPIError):
        return format_api_error(exc)
    if isinstance(exc, SiigoNetworkError):
        return format_network_error(exc)
    if isinstance(exc, SiigoConfigError):
        return format_config_error(exc)
    return str(exc)
