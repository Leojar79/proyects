"""Unit tests for the HTTP layer: settings, auth cache, limiter, retry matrix, errors."""

from __future__ import annotations

import os
import re
from dataclasses import replace
from pathlib import Path

import anyio
import httpx
import pytest
from conftest import ACCESS_KEY, FakeClock, FakeSiigo, envelope, siigo_error

from siigo_mcp.client import (
    COMPACT_ROW_CHARS,
    IDEMPOTENT_POST_PATHS,
    MAX_OUTPUT_CHARS,
    RateLimiter,
    Settings,
    SiigoClient,
    active_positions,
    body_fingerprint,
    compact_row,
    filter_active,
    http_env_vars,
    http_init_problem,
    normalize_list,
    render_json,
    truncate_output,
)
from siigo_mcp.errors import (
    SiigoAPIError,
    SiigoConfigError,
    SiigoNetworkError,
    format_api_error,
    format_config_error,
    format_network_error,
    hints_for,
    parse_error,
)

pytestmark = pytest.mark.anyio

CUSTOMERS = envelope([{"id": "c1"}])


def retry_waits(clock: FakeClock) -> list[float]:
    """Sleeps longer than the limiter spacing (0.6 s at 100/min)."""
    return [s for s in clock.sleeps if s > 1]


def make_client(fake: FakeSiigo, clock: FakeClock, settings: Settings) -> SiigoClient:
    http = httpx.AsyncClient(base_url=settings.base_url, transport=fake.transport)
    return SiigoClient(settings, http, sleep=clock.sleep, clock=clock)


# --------------------------------------------------------------------------- settings


def test_settings_defaults_and_parsing():
    s = Settings.from_env(
        {
            "SIIGO_USERNAME": " api@x.com ",
            "SIIGO_ACCESS_KEY": "k",
            "SIIGO_PARTNER_ID": "MiEmpresaMCP",
            "SIIGO_BASE_URL": "https://sandbox.example.com/",
            "SIIGO_RATE_LIMIT_PER_MINUTE": "10",
            "SIIGO_TIMEOUT_SECONDS": "90",
            "SIIGO_DOWNLOAD_DIR": "~/siigo-files",
            "SIIGO_LOG_LEVEL": "debug",
        }
    )
    assert s.username == "api@x.com"
    assert s.base_url == "https://sandbox.example.com"
    assert s.rate_limit_per_minute == 10
    assert s.timeout_seconds == 90
    assert "~" not in str(s.download_dir) and s.download_dir.name == "siigo-files"
    assert s.log_level == "DEBUG"
    assert s.enable_write is False
    assert s.config_problems() == []

    d = Settings.from_env({})
    assert d.base_url == "https://api.siigo.com"
    assert d.rate_limit_per_minute == 100 and d.timeout_seconds == 120
    assert d.download_dir.parts[-2:] == ("Downloads", "siigo")
    assert Settings.from_env({"SIIGO_LOG_LEVEL": "verbose"}).log_level == "INFO"


@pytest.mark.parametrize(
    ("value", "expected", "reported"),
    [
        ("true", True, False),
        ("TRUE", True, False),
        ("1", True, False),
        ("yes", True, False),
        ("Yes", True, False),
        (" true ", True, False),
        ("false", False, False),
        ("0", False, False),
        ("no", False, False),
        ("off", False, False),
        ("", False, False),
        # Unrecognised values keep writes off but are reported, never silently ignored.
        ("on", False, True),
        ("si", False, True),
        ("sí", False, True),
        ("verdadero", False, True),
    ],
)
def test_enable_write_flag(value, expected, reported):
    s = Settings.from_env({"SIIGO_ENABLE_WRITE": value})
    assert s.enable_write is expected
    flagged = [p for p in s.env_problems if p.startswith("SIIGO_ENABLE_WRITE")]
    assert bool(flagged) is reported, s.env_problems
    if reported:
        assert "true" in flagged[0] and "1" in flagged[0] and "yes" in flagged[0]


def test_invalid_log_level_is_reported():
    s = Settings.from_env({"SIIGO_LOG_LEVEL": "verbose"})
    assert s.log_level == "INFO"
    assert any(p.startswith("SIIGO_LOG_LEVEL") for p in s.config_problems())
    warn = Settings.from_env({"SIIGO_LOG_LEVEL": "warn"})
    assert warn.log_level == "WARNING" and warn.env_problems == ()


NO_SUCH_USER = "siigo_no_such_user_zz9"


@pytest.fixture
def unexpandable_home(monkeypatch):
    """Make ``~siigo_no_such_user_zz9`` unexpandable on every OS (as on POSIX)."""
    real = Path.expanduser

    def expanduser(self):
        if str(self).startswith("~" + NO_SUCH_USER):
            raise RuntimeError("Could not determine home directory.")
        return real(self)

    monkeypatch.setattr(Path, "expanduser", expanduser)


def test_unexpandable_download_dir_is_a_config_problem_not_a_crash(unexpandable_home):
    raw = f"~{NO_SUCH_USER}/descargas"
    s = Settings.from_env(
        {
            "SIIGO_USERNAME": "api@x.com",
            "SIIGO_ACCESS_KEY": "k1234",
            "SIIGO_PARTNER_ID": "MiEmpresaMCP",
            "SIIGO_DOWNLOAD_DIR": raw,
        }
    )
    problems = s.config_problems()
    assert len(problems) == 1 and problems[0].startswith("SIIGO_DOWNLOAD_DIR"), problems
    assert raw in problems[0]
    assert "~" not in str(s.download_dir)  # falls back to the default folder


@pytest.mark.skipif(os.name == "nt", reason="~user expansion only fails on POSIX")
def test_download_dir_with_unknown_user_does_not_raise():
    pwd = pytest.importorskip("pwd")
    try:
        pwd.getpwnam(NO_SUCH_USER)
        pytest.skip("the test user unexpectedly exists")
    except KeyError:
        pass
    s = Settings.from_env({"SIIGO_DOWNLOAD_DIR": f"~{NO_SUCH_USER}/x"})
    assert any(p.startswith("SIIGO_DOWNLOAD_DIR") for p in s.config_problems())


def test_every_documented_variable_reports_invalid_values(unexpandable_home):
    """README: an invalid value of ANY variable is named in the tool errors."""
    readme = (Path(__file__).parent.parent / "README.md").read_text(encoding="utf-8")
    documented = set(re.findall(r"^\| `(SIIGO_[A-Z_]+)` \|", readme, re.MULTILINE))
    valid = {
        "SIIGO_USERNAME": "api@x.com",
        "SIIGO_ACCESS_KEY": "k1234",
        "SIIGO_PARTNER_ID": "MiEmpresaMCP",
    }
    invalid = {
        "SIIGO_USERNAME": "",
        "SIIGO_ACCESS_KEY": "",
        "SIIGO_PARTNER_ID": "mi-app",
        "SIIGO_BASE_URL": "ftp://api.siigo.com",
        "SIIGO_RATE_LIMIT_PER_MINUTE": "0",
        "SIIGO_TIMEOUT_SECONDS": "abc",
        "SIIGO_DOWNLOAD_DIR": f"~{NO_SUCH_USER}/x",
        "SIIGO_LOG_LEVEL": "verbose",
        "SIIGO_ENABLE_WRITE": "sí",
    }
    assert documented == set(invalid)
    assert Settings.from_env(valid).config_problems() == []
    for name, bad in invalid.items():
        problems = Settings.from_env(valid | {name: bad}).config_problems()
        assert [p.split()[0] for p in problems] == [name], (name, problems)


@pytest.mark.parametrize(
    ("url", "ok"),
    [
        ("https://api.siigo.com", True),
        ("http://127.0.0.1:8080", True),
        ("http://localhost:9000", True),
        ("http://[::1]:8080", True),
        ("http://api.siigo.com", False),
        ("http://192.168.1.10", False),
    ],
)
def test_base_url_requires_https_outside_localhost(url, ok):
    s = Settings.from_env({"SIIGO_BASE_URL": url})
    flagged = [p for p in s.env_problems if p.startswith("SIIGO_BASE_URL")]
    assert (not flagged) is ok, flagged
    if not ok:
        assert "https" in flagged[0] and s.base_url == "https://api.siigo.com"


def test_config_problems_name_every_variable():
    s = Settings.from_env(
        {
            "SIIGO_PARTNER_ID": "my-app",
            "SIIGO_RATE_LIMIT_PER_MINUTE": "abc",
            "SIIGO_TIMEOUT_SECONDS": "-1",
            "SIIGO_BASE_URL": "https://api.siigo.com/v1",
        }
    )
    text = " ".join(s.config_problems())
    for name in (
        "SIIGO_USERNAME",
        "SIIGO_ACCESS_KEY",
        "SIIGO_PARTNER_ID",
        "SIIGO_RATE_LIMIT_PER_MINUTE",
        "SIIGO_TIMEOUT_SECONDS",
        "SIIGO_BASE_URL",
    ):
        assert name in text
    assert s.base_url == "https://api.siigo.com"  # invalid value falls back
    assert "SIIGO_BASE_URL" in " ".join(
        Settings.from_env({"SIIGO_BASE_URL": "ftp://x"}).env_problems
    )
    assert "SIIGO_BASE_URL" in " ".join(Settings.from_env({"SIIGO_BASE_URL": "nourl"}).env_problems)


@pytest.mark.parametrize("pid", ["ab", "my app", "my-app", "x" * 101, "ñandú123"])
def test_partner_id_invalid(pid):
    s = Settings(username="u", access_key="k", partner_id=pid)
    assert any("SIIGO_PARTNER_ID" in p for p in s.config_problems())


def test_access_key_not_in_repr():
    s = Settings(username="u", access_key=ACCESS_KEY, partner_id="TestApp")
    assert ACCESS_KEY not in repr(s)


# --------------------------------------------------------------------------- error parsing


def _resp(status: int, **kwargs) -> httpx.Response:
    return httpx.Response(status, request=httpx.Request("GET", "https://x/v1/a"), **kwargs)


def test_parse_error_reports_all_entries_case_insensitively():
    resp = _resp(
        400,
        json={
            "Status": 400,
            "Errors": [
                {"Code": "parameter_required", "Message": "The field code is required",
                 "Params": ["code"], "Detail": None},
                {"code": "invalid_email", "message": "bad email", "params": [], "detail": "see"},
            ],
        },
    )  # fmt: skip
    err = parse_error(resp)
    assert err.status == 400 and err.code == "parameter_required"
    assert err.codes == {"parameter_required", "invalid_email"}
    assert err.errors[0].params == ("code",) and err.errors[0].detail is None
    assert err.errors[1].detail == "see"
    text = format_api_error(err)
    assert "Siigo 400 parameter_required: The field code is required (params: code)" in text
    assert "Siigo 400 invalid_email: bad email" in text
    assert "Falta(n) el/los campo(s): code." in text
    assert "GET /v1/a" in text


def test_parse_error_variants():
    err = parse_error(_resp(502, text="<html>Bad gateway from KrakenD</html>" + "x" * 500))
    assert err.errors == [] and err.text.startswith("<html>") and len(err.text) == 300
    assert "Siigo HTTP 502" in format_api_error(err)
    assert "Falla del lado de Siigo" in format_api_error(err)

    err = parse_error(_resp(400, json={"errors": {"CODE": "X_Code", "MESSAGE": "m"}}))
    assert err.code == "X_Code" and err.codes == {"x_code"}

    err = parse_error(_resp(403, json={"message": "Forbidden"}))
    assert err.errors[0].message == "Forbidden"
    assert "Acceso denegado" in format_api_error(err)

    err = parse_error(_resp(400, json={"Errors": ["plain string error"]}))
    assert err.errors[0].message == "plain string error"

    err = parse_error(_resp(404, json=[1, 2]))
    assert err.errors == [] and "not_found" not in format_api_error(err)
    assert "Revisa el ID" in format_api_error(err)

    err = parse_error(httpx.Response(500, content=b""))
    assert err.method == "" and "(respuesta sin cuerpo)" in format_api_error(err)


def test_parse_error_redacts_secrets():
    resp = _resp(400, json={"Errors": [{"Code": "x", "Message": f"key {ACCESS_KEY} bad"}]})
    err = parse_error(resp, redact=lambda s: s.replace(ACCESS_KEY, "***"))
    assert ACCESS_KEY not in format_api_error(err)


@pytest.mark.parametrize(
    ("code", "fragment"),
    [
        ("header_required", "SIIGO_PARTNER_ID"),
        ("invalid_partner_id", "SIIGO_PARTNER_ID"),
        ("Invalid_Partner_Id", "SIIGO_PARTNER_ID"),
        ("unauthorized", "SIIGO_ACCESS_KEY"),
        ("not_found", "siigo_list_"),
        ("already_exists", "siigo_list_customers(identification"),
        ("customer_settings", "contactos"),
        ("document_settings", "NoElectronic"),
        ("invalid_dian_resolution", "NoElectronic"),
        ("invalid_total_payments", "payments[].value"),
        ("parameter_inactive", "inactivo"),
        ("duplicated_document", "omite `number`"),
        ("disabled_functionality", "sandbox"),
        ("unhandled_error", "intenta de nuevo"),
        ("service_unavailable", "intenta de nuevo"),
        ("request_timeout", "intenta de nuevo"),
        ("parameter_empty", "Falta"),
    ],
)
def test_hint_table(code, fragment):
    err = parse_error(_resp(400, json={"Errors": [{"Code": code, "Message": "m"}]}))
    assert fragment in " ".join(hints_for(err))


def test_requests_limit_hint_includes_wait():
    err = parse_error(
        _resp(
            429, json={"Errors": [{"Code": "requests_limit", "Message": "Try again in 17 seconds"}]}
        )
    )
    assert err.retry_after == 17
    assert "espera 17 s" in format_api_error(err)
    err = parse_error(_resp(429, headers={"Retry-After": "9"}, json={}))
    assert err.retry_after == 9 and "espera 9 s" in format_api_error(err)
    err = parse_error(_resp(429, headers={"Retry-After": "soon"}, text="slow down"))
    assert err.retry_after is None and "unos 20 s" in format_api_error(err)


def test_format_other_errors():
    text = format_config_error(SiigoConfigError(["SIIGO_USERNAME (falta)"]))
    assert "SIIGO_USERNAME" in text and "siigo_check_connection" in text
    net = SiigoNetworkError("POST /v1/customers: x", timeout=True, may_have_executed=True)
    assert "pudo haberse ejecutado" in format_network_error(net)
    net = SiigoNetworkError(
        "GET /v1/customers: ConnectError", timeout=False, may_have_executed=False
    )
    assert "No se pudo conectar" in format_network_error(net)


# --------------------------------------------------------------------------- limiter


async def test_rate_limiter_spaces_requests_evenly(clock: FakeClock):
    limiter = RateLimiter(100, clock=clock, sleep=clock.sleep)
    assert await limiter.acquire() == 0
    await limiter.acquire()
    await limiter.acquire()
    assert clock.sleeps == pytest.approx([0.6, 0.6])
    clock.now += 10  # long idle: no wait
    assert await limiter.acquire() == 0
    slow = RateLimiter(10, clock=clock, sleep=clock.sleep)
    await slow.acquire()
    clock.now += 1
    assert await slow.acquire() == pytest.approx(5.0)


async def test_every_request_is_rate_limited_including_auth(fake, clock, settings):
    fake.on("GET", "/v1/customers", CUSTOMERS)
    client = make_client(fake, clock, replace(settings, rate_limit_per_minute=10))
    await client.get("/v1/customers")
    await client.get("/v1/customers")
    assert fake.paths() == ["/auth", "/v1/customers", "/v1/customers"]
    assert clock.sleeps == pytest.approx([6.0, 6.0])


# --------------------------------------------------------------------------- auth


async def test_auth_headers_and_token_cache(fake, clock, settings):
    fake.on("GET", "/v1/customers", CUSTOMERS)
    client = make_client(fake, clock, settings)
    await client.get("/v1/customers", {"page": 1, "identification": None, "active": True})
    await client.get("/v1/customers")
    assert fake.paths() == ["/auth", "/v1/customers", "/v1/customers"]
    auth = fake.calls[0]
    assert auth.method == "POST"
    assert auth.body == {"username": "api@empresa.com", "access_key": ACCESS_KEY}
    assert auth.headers["partner-id"] == "TestApp"
    assert "authorization" not in auth.headers
    for call in fake.calls:
        assert call.headers["partner-id"] == "TestApp"
        assert call.headers["accept"] == "application/json"
    data = fake.calls[1]
    assert data.headers["authorization"] == "Bearer jwt-token-1"
    assert data.params == {"page": "1", "active": "true"}
    assert "idempotency-key" not in data.headers


async def test_token_refreshed_after_expiry_with_300s_margin(fake, clock, settings):
    fake.on(
        "POST",
        "/auth",
        {"access_token": "t1", "expires_in": 1000},
        {"access_token": "t2", "expires_in": 1000},
    )
    fake.on("GET", "/v1/taxes", [])
    client = make_client(fake, clock, settings)
    await client.get("/v1/taxes")
    clock.now += 650  # 1000 - 300 = 700 s lifetime: still valid
    await client.get("/v1/taxes")
    assert fake.paths().count("/auth") == 1
    clock.now += 100  # now past 700 s
    await client.get("/v1/taxes")
    assert fake.paths().count("/auth") == 2
    assert fake.calls[-1].headers["authorization"] == "Bearer t2"


async def test_auth_accepts_201_and_lowercase_keys(fake, clock, settings):
    fake.on(
        "POST", "/auth", httpx.Response(201, json={"Access_Token": "abc", "Expires_In": "86400"})
    )
    fake.on("GET", "/v1/taxes", [])
    client = make_client(fake, clock, settings)
    await client.get("/v1/taxes")
    assert fake.calls[-1].headers["authorization"] == "Bearer abc"
    assert client.token_expires_in == pytest.approx(86100, abs=1)


async def test_auth_failure_is_not_retried(fake, clock, settings):
    fake.on("POST", "/auth", siigo_error(401, "invalid_credentials", "bad user"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/taxes")
    assert fake.paths() == ["/auth"]
    assert info.value.during_auth
    text = format_api_error(info.value)
    assert "autenticación" in text and "SIIGO_USERNAME" in text and "80%" in text


async def test_auth_response_without_token(fake, clock, settings):
    fake.on("POST", "/auth", {"token": "x"})
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.authenticate()
    assert info.value.code == "invalid_response"


@pytest.mark.parametrize("token", [None, "", "   ", 123])
async def test_auth_rejects_null_or_empty_token(fake, clock, settings, token):
    fake.on("POST", "/auth", {"access_token": token, "expires_in": 86400})
    fake.on("GET", "/v1/taxes", [])
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/taxes")
    assert info.value.code == "invalid_response" and info.value.during_auth
    assert fake.paths() == ["/auth"]  # no doomed "Bearer None" data request
    assert "access_token" in format_api_error(info.value)


async def test_auth_network_error(fake, clock, settings):
    def boom(request):
        raise httpx.ConnectError("refused", request=request)

    fake.on("POST", "/auth", boom)
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoNetworkError) as info:
        await client.get("/v1/taxes")
    assert not info.value.may_have_executed and not info.value.timeout


async def test_reauth_on_401_then_retry_once(fake, clock, settings):
    fake.on("GET", "/v1/customers", siigo_error(401, "unauthorized", "expired"), CUSTOMERS)
    client = make_client(fake, clock, settings)
    assert (await client.get("/v1/customers"))["results"] == [{"id": "c1"}]
    assert fake.paths() == ["/auth", "/v1/customers", "/auth", "/v1/customers"]
    assert fake.calls[-1].headers["authorization"] == "Bearer jwt-token-2"
    assert clock.sleeps == pytest.approx([0.6, 0.6, 0.6])  # only limiter spacing


async def test_second_401_raises_with_lockout_hint(fake, clock, settings):
    fake.on("GET", "/v1/customers", siigo_error(401, "unauthorized", "nope"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/customers")
    assert fake.paths() == ["/auth", "/v1/customers", "/auth", "/v1/customers"]
    assert info.value.auth_failed
    assert "80%" in format_api_error(info.value)
    # The rejected token is dropped: the next call authenticates again.
    fake.on("GET", "/v1/customers", CUSTOMERS)
    await client.get("/v1/customers")
    assert fake.paths()[-2:] == ["/auth", "/v1/customers"]


async def test_unauthorized_code_with_other_status_triggers_reauth(fake, clock, settings):
    fake.on("GET", "/v1/customers", siigo_error(403, "Unauthorized", "x"), CUSTOMERS)
    client = make_client(fake, clock, settings)
    await client.get("/v1/customers")
    assert fake.paths().count("/auth") == 2


async def test_check_connection_forces_new_token(fake, clock, settings):
    client = make_client(fake, clock, settings)
    await client.authenticate()
    await client.authenticate()
    await client.authenticate(force=True)
    assert fake.paths() == ["/auth", "/auth"]


async def test_failed_auth_is_not_repeated_by_the_next_calls(fake, clock, settings):
    """Regression: every call after a 401 from /auth sent another doomed POST /auth (each one
    a failed request toward the 80% lockout); only siigo_check_connection retries now."""
    fake.on(
        "POST",
        "/auth",
        siigo_error(401, "unauthorized", "Invalid credentials"),
        {"access_token": "token-after-fix", "expires_in": 86400},
    )
    fake.on("GET", "/v1/taxes", [])
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError):
        await client.get("/v1/taxes")
    clock.now += 3600
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/taxes")
    assert fake.paths() == ["/auth"]
    assert info.value.during_auth and not info.value.may_have_executed
    text = format_api_error(info.value)
    assert "no se repitió" in text and "siigo_check_connection" in text and "80%" in text
    await client.authenticate(force=True)  # what siigo_check_connection does
    await client.get("/v1/taxes")
    assert fake.paths() == ["/auth", "/auth", "/v1/taxes"]


async def test_rate_limited_auth_is_retried_only_after_the_wait(fake, clock, settings):
    fake.on(
        "POST",
        "/auth",
        siigo_error(429, "requests_limit", "Try again in 20 seconds"),
        {"access_token": "token-after-wait", "expires_in": 86400},
    )
    fake.on("GET", "/v1/taxes", [])
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError):
        await client.get("/v1/taxes")
    clock.now += 5
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/taxes")
    assert fake.paths() == ["/auth"]
    assert "espera 15 s" in format_api_error(info.value)
    clock.now += 16
    await client.get("/v1/taxes")
    assert fake.paths() == ["/auth", "/auth", "/v1/taxes"]


async def test_transient_auth_failure_pauses_new_calls_briefly(fake, clock, settings):
    def refused(request):
        raise httpx.ConnectError("refused", request=request)

    fake.on("POST", "/auth", refused, {"access_token": "token-later", "expires_in": 86400})
    fake.on("GET", "/v1/taxes", [])
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoNetworkError):
        await client.get("/v1/taxes")
    with pytest.raises(SiigoNetworkError) as info:
        await client.get("/v1/taxes")
    assert fake.paths() == ["/auth"]
    assert "se podrá reintentar en 5 s" in format_network_error(info.value)
    clock.now += 6
    await client.get("/v1/taxes")
    assert fake.paths() == ["/auth", "/auth", "/v1/taxes"]


async def test_shared_auth_failure_is_a_separate_copy_per_caller(fake, clock, settings):
    """A write marks its own copy as possibly executed; a later read must not inherit it."""

    def lost(request):
        raise httpx.ReadTimeout("slow", request=request)

    fake.on("POST", "/v1/invoices", lost, siigo_error(401, "unauthorized", "expired"))
    fake.on(
        "POST",
        "/auth",
        {"access_token": "token-one", "expires_in": 86400},
        siigo_error(401, "unauthorized", "blocked"),
    )
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as write:
        await client.post("/v1/invoices", {}, idempotency_key="K1")
    assert write.value.may_have_executed and write.value.during_auth
    with pytest.raises(SiigoAPIError) as read:
        await client.get("/v1/taxes")
    assert not read.value.may_have_executed and read.value is not write.value
    assert fake.paths().count("/auth") == 2


async def test_error_echoing_an_earlier_token_is_redacted(settings):
    """Regression: redact() masked only the current token. A request sent with token T1 that
    failed after a concurrent call renewed it to T2 leaked T1 (still valid) in the error."""
    tokens = iter(["eyJFirstTokenAAAA1111", "eyJSecondTokenBBBB2222"])
    renewed = anyio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth":
            return httpx.Response(200, json={"access_token": next(tokens), "expires_in": 86400})
        auth = request.headers["authorization"]
        if request.url.params.get("identification") == "A":
            await renewed.wait()  # A's answer arrives after B renewed the token
            return httpx.Response(
                403,
                json={"Errors": [{"Code": "forbidden", "Message": f"token rejected: {auth}",
                                  "Params": [auth]}]},
            )  # fmt: skip
        if "First" in auth:
            return siigo_error(401, "unauthorized", "expired")
        renewed.set()
        return httpx.Response(200, json=envelope([]))

    async def no_wait(seconds: float) -> None:
        await anyio.sleep(0)

    http = httpx.AsyncClient(base_url=settings.base_url, transport=httpx.MockTransport(handler))
    client = SiigoClient(settings, http, sleep=no_wait)
    errors: list[str] = []

    async def call_a() -> None:
        with pytest.raises(SiigoAPIError) as info:
            await client.get("/v1/customers", {"identification": "A"})
        errors.append(format_api_error(info.value) + str(info.value))

    async with anyio.create_task_group() as tg:
        tg.start_soon(call_a)
        await anyio.wait_all_tasks_blocked()
        await client.get("/v1/customers", {"identification": "B"})
    assert len(errors) == 1 and "token rejected: Bearer ***" in errors[0]
    assert "eyJFirstTokenAAAA1111" not in errors[0] and "eyJSecond" not in errors[0]
    assert "(params: Bearer ***)" in errors[0]


async def test_config_error_before_any_request(fake, clock):
    client = make_client(fake, clock, Settings(partner_id="bad id"))
    with pytest.raises(SiigoConfigError) as info:
        await client.get("/v1/customers")
    assert fake.calls == []
    assert {p.split()[0] for p in info.value.problems} >= {
        "SIIGO_USERNAME",
        "SIIGO_ACCESS_KEY",
        "SIIGO_PARTNER_ID",
    }


# --------------------------------------------------------------------------- retry matrix


async def test_429_waits_for_seconds_in_message(fake, clock, settings):
    fake.on(
        "GET",
        "/v1/customers",
        siigo_error(429, "requests_limit", "Too many requests. Try again in 3 seconds"),
        CUSTOMERS,
    )
    client = make_client(fake, clock, settings)
    await client.get("/v1/customers")
    assert 3.0 in clock.sleeps
    assert fake.paths() == ["/auth", "/v1/customers", "/v1/customers"]


async def test_429_uses_retry_after_header_then_backoff(fake, clock, settings):
    fake.on(
        "GET",
        "/v1/customers",
        httpx.Response(429, headers={"Retry-After": "7"}, json={}),
        httpx.Response(429, json={"Errors": [{"Code": "requests_limit", "Message": "slow"}]}),
        CUSTOMERS,
    )
    client = make_client(fake, clock, settings)
    await client.get("/v1/customers")
    assert retry_waits(clock) == [7.0, 10.0]  # header, then 5 * 2**1


async def test_429_gives_up_after_two_retries(fake, clock, settings):
    fake.on("GET", "/v1/customers", siigo_error(429, "requests_limit", "Try again in 2 seconds"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/customers")
    assert fake.paths().count("/v1/customers") == 3
    assert "espera 2 s" in format_api_error(info.value)


async def test_429_wait_over_budget_is_not_retried(fake, clock, settings):
    fake.on("GET", "/v1/customers", siigo_error(429, "requests_limit", "Try again in 90 seconds"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/customers")
    assert fake.paths().count("/v1/customers") == 1
    assert info.value.retry_after == 90


async def test_total_retry_wait_is_capped_at_60s(fake, clock, settings):
    fake.on(
        "GET",
        "/v1/customers",
        siigo_error(429, "requests_limit", "Try again in 40 seconds"),
        siigo_error(429, "requests_limit", "Try again in 40 seconds"),
        CUSTOMERS,
    )
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError):
        await client.get("/v1/customers")
    assert fake.paths().count("/v1/customers") == 2  # 40 + 40 > 60


async def test_post_without_key_is_never_retried_on_429(fake, clock, settings):
    fake.on("POST", "/v1/customers", siigo_error(429, "requests_limit", "Try again in 1 seconds"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError):
        await client.post("/v1/customers", {"a": 1})
    assert fake.paths().count("/v1/customers") == 1
    assert "idempotency-key" not in fake.calls[-1].headers


async def test_keyed_post_retries_with_same_key(fake, clock, settings):
    fake.on(
        "POST",
        "/v1/invoices",
        siigo_error(429, "requests_limit", "Try again in 1 seconds"),
        httpx.Response(503, text="unavailable"),
        httpx.Response(201, json={"id": "inv"}),
    )
    client = make_client(fake, clock, settings)
    assert await client.post("/v1/invoices", {"x": 1}) == {"id": "inv"}
    keys = [c.headers["idempotency-key"] for c in fake.data_calls()]
    assert len(keys) == 3 and len(set(keys)) == 1
    assert re.fullmatch(r"[A-Za-z0-9]{1,30}", keys[0])


@pytest.mark.parametrize(
    ("method", "path", "status", "attempts"),
    [
        ("GET", "/v1/customers", 500, 3),
        ("POST", "/v1/invoices", 500, 1),
        ("DELETE", "/v1/invoices/abc", 500, 1),
        ("PUT", "/v1/customers/abc", 500, 1),
        ("GET", "/v1/customers", 503, 3),
        ("GET", "/v1/customers", 504, 3),
        ("POST", "/v1/invoices", 503, 3),
        ("POST", "/v1/invoices", 504, 3),
        ("POST", "/v1/customers", 503, 1),
        ("PUT", "/v1/customers/abc", 503, 1),
        ("DELETE", "/v1/invoices/abc", 504, 1),
        ("PUT", "/v1/customers/abc", 429, 3),
        ("DELETE", "/v1/invoices/abc", 429, 3),
        ("GET", "/v1/customers", 400, 1),
        ("GET", "/v1/customers", 404, 1),
        ("POST", "/v1/invoices", 409, 1),
    ],
)
async def test_retry_matrix(fake, clock, settings, method, path, status, attempts):
    fake.on(method, path, siigo_error(status, "some_code", "fail"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError):
        await client.request(method, path)
    assert fake.paths().count(path) == attempts


@pytest.mark.parametrize(
    ("method", "path", "response", "wait"),
    [
        ("GET", "/v1/customers", httpx.Response(503, headers={"Retry-After": "30"}, text="x"), 30),
        ("GET", "/v1/customers", httpx.Response(504, headers={"Retry-After": "30"}, text="x"), 30),
        ("GET", "/v1/customers", siigo_error(500, "unhandled_error", "Try again in 3 seconds"), 3),
        ("POST", "/v1/invoices", httpx.Response(503, headers={"Retry-After": "20"}, text="x"), 20),
    ],
)
async def test_5xx_retry_waits_what_siigo_asks(fake, clock, settings, method, path, response, wait):
    """Spec B.4 wait order (message, Retry-After, backoff) applies to every retryable status."""
    fake.on(method, path, response, httpx.Response(200, json={"id": "ok"}))
    client = make_client(fake, clock, settings)
    assert await client.request(method, path) == {"id": "ok"}
    assert retry_waits(clock) == [float(wait)]


async def test_5xx_retry_after_over_budget_is_not_retried(fake, clock, settings):
    fake.on("GET", "/v1/customers", httpx.Response(503, headers={"Retry-After": "120"}, text="x"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/customers")
    assert fake.paths().count("/v1/customers") == 1 and retry_waits(clock) == []
    assert info.value.retry_after == 120


async def test_500_unhandled_error_get_then_success(fake, clock, settings):
    fake.on("GET", "/v1/taxes", siigo_error(500, "unhandled_error", "boom"), [{"id": 1}])
    client = make_client(fake, clock, settings)
    assert await client.get("/v1/taxes") == [{"id": 1}]
    assert 5.0 in clock.sleeps


async def test_timeout_get_retried_then_succeeds(fake, clock, settings):
    state = {"n": 0}

    def flaky(request):
        state["n"] += 1
        if state["n"] == 1:
            raise httpx.ReadTimeout("slow", request=request)
        return httpx.Response(200, json=CUSTOMERS)

    fake.on("GET", "/v1/customers", flaky)
    client = make_client(fake, clock, settings)
    await client.get("/v1/customers")
    assert state["n"] == 2


async def test_timeout_post_without_key_not_retried(fake, clock, settings):
    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)

    fake.on("POST", "/v1/customers", slow)
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoNetworkError) as info:
        await client.post("/v1/customers", {})
    assert fake.paths().count("/v1/customers") == 1
    assert info.value.timeout and info.value.may_have_executed
    assert "pudo haberse ejecutado" in format_network_error(info.value)


async def test_transport_error_keyed_post_retried(fake, clock, settings):
    def down(request):
        raise httpx.ConnectError("down", request=request)

    fake.on("POST", "/v1/journals", down)
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoNetworkError):
        await client.post("/v1/journals", {})
    calls = [c for c in fake.calls if c.path == "/v1/journals"]
    assert len(calls) == 3
    assert len({c.headers["idempotency-key"] for c in calls}) == 1


async def test_keyed_post_error_after_a_timeout_is_marked_uncertain(fake, clock, settings):
    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)

    fake.on("POST", "/v1/invoices", slow, siigo_error(409, "duplicated_document", "dup"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.post("/v1/invoices", {"x": 1})
    assert info.value.status == 409 and info.value.may_have_executed is True

    fresh = FakeSiigo().on("POST", "/v1/invoices", siigo_error(409, "duplicated_document", "d"))
    client = make_client(fresh, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.post("/v1/invoices", {"x": 1})
    assert info.value.may_have_executed is False


def _auth_ok(expires_in: int = 86400) -> httpx.Response:
    return httpx.Response(200, json={"access_token": "jwt-1", "expires_in": expires_in})


@pytest.mark.parametrize(
    ("first_attempt", "auth_failure"),
    [
        ("timeout", siigo_error(503, "service_unavailable", "auth down")),
        ("timeout", siigo_error(400, "invalid_partner_id", "bad")),
        ("503", siigo_error(500, "unhandled_error", "boom")),
    ],
)
async def test_keyed_post_reauth_failure_after_uncertain_attempt_is_uncertain(
    fake, clock, settings, first_attempt, auth_failure
):
    """Regression: an /auth error on the 401 path lost may_have_executed."""

    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)

    first = slow if first_attempt == "timeout" else siigo_error(503, "service_unavailable", "x")
    fake.on("POST", "/v1/invoices", first, siigo_error(401, "unauthorized", "expired"))
    fake.on("POST", "/auth", _auth_ok(), auth_failure)
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.post("/v1/invoices", {"x": 1})
    assert info.value.during_auth and info.value.may_have_executed is True
    assert fake.paths() == ["/auth", "/v1/invoices", "/v1/invoices", "/auth"]


async def test_keyed_post_token_renewal_failure_after_uncertain_attempt_is_uncertain(
    fake, clock, settings
):
    """Regression: the token expired during the retry wait and its renewal failed."""
    fake.on("POST", "/v1/invoices", httpx.Response(503, headers={"Retry-After": "20"}))
    fake.on("POST", "/auth", _auth_ok(expires_in=310), siigo_error(500, "unhandled_error", "x"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.post("/v1/invoices", {"x": 1})
    assert info.value.during_auth and info.value.may_have_executed is True
    assert fake.paths() == ["/auth", "/v1/invoices", "/auth"]


async def test_keyed_post_renewal_network_error_after_uncertain_attempt(fake, clock, settings):
    def down(request):
        raise httpx.ConnectError("down", request=request)

    fake.on("POST", "/v1/invoices", siigo_error(504, "gateway", "x"), siigo_error(401, "u", "x"))
    fake.on("POST", "/auth", _auth_ok(), down)
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoNetworkError) as info:
        await client.post("/v1/invoices", {"x": 1})
    assert info.value.may_have_executed is True
    assert "pudo haberse ejecutado" in format_network_error(info.value)


async def test_reauth_failure_on_a_get_or_a_first_attempt_is_not_uncertain(fake, clock, settings):
    fake.on("POST", "/v1/invoices", siigo_error(401, "unauthorized", "expired"))
    fake.on("GET", "/v1/customers", siigo_error(401, "unauthorized", "expired"))
    fake.on("POST", "/auth", _auth_ok(), siigo_error(503, "service_unavailable", "down"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.post("/v1/invoices", {"x": 1})  # Siigo rejected the only attempt
    assert info.value.may_have_executed is False
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/customers")
    assert info.value.during_auth and info.value.may_have_executed is False


class _BadGzip(httpx.AsyncByteStream):
    async def __aiter__(self):
        yield b"this is not gzip"

    async def aclose(self) -> None:
        pass


def _undecodable(status: int) -> httpx.Response:
    headers = {"Content-Encoding": "gzip", "Content-Type": "application/json"}
    return httpx.Response(status, headers=headers, stream=_BadGzip())


@pytest.mark.parametrize(
    ("method", "path", "status", "maybe_done"),
    [
        ("POST", "/v1/invoices", 201, True),
        ("POST", "/v1/invoices/abc/mail", 200, True),
        ("DELETE", "/v1/invoices/abc", 200, True),
        ("POST", "/v1/customers", 400, False),
        ("GET", "/v1/customers", 200, False),
    ],
)
async def test_undecodable_body_is_an_invalid_response_with_its_status(
    fake, clock, settings, method, path, status, maybe_done
):
    """Regression: httpx.DecodingError (not a TransportError) escaped as a generic error."""
    fake.on(method, path, lambda request: _undecodable(status))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.request(method, path)
    err = info.value
    assert err.code == "invalid_response" and err.status == status
    assert err.may_have_executed is maybe_done
    assert len(fake.data_calls()) == 1  # never retried
    if status < 300 and method != "GET":
        assert "probablemente SÍ se ejecutó" in format_api_error(err)


async def test_undecodable_auth_answer_is_an_auth_error(fake, clock, settings):
    fake.on("POST", "/auth", lambda request: _undecodable(200))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.authenticate()
    assert info.value.during_auth and info.value.code == "invalid_response"


async def test_get_network_error_after_retries(fake, clock, settings):
    def down(request):
        raise httpx.ConnectError("down", request=request)

    fake.on("GET", "/v1/customers", down)
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoNetworkError) as info:
        await client.get("/v1/customers")
    assert not info.value.may_have_executed
    assert retry_waits(clock) == [5.0, 10.0]


# --------------------------------------------------------------------------- idempotency


@pytest.mark.parametrize("path", sorted(IDEMPOTENT_POST_PATHS))
async def test_idempotency_key_on_the_four_post_endpoints(fake, clock, settings, path):
    fake.on("POST", path, {"id": "x"})
    client = make_client(fake, clock, settings)
    await client.post(path, {})
    assert re.fullmatch(r"[A-Za-z0-9]{1,30}", fake.calls[-1].headers["idempotency-key"])


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/v1/customers"),
        ("POST", "/v1/invoices/abc/mail"),
        ("POST", "/v1/invoices/abc/annul"),
        ("POST", "/v1/test-balance-report"),
        ("GET", "/v1/invoices"),
        ("DELETE", "/v1/invoices/abc"),
        ("PUT", "/v1/invoices/abc"),
    ],
)
async def test_no_idempotency_key_elsewhere(fake, clock, settings, method, path):
    fake.on(method, path, {"ok": True})
    client = make_client(fake, clock, settings)
    await client.request(method, path)
    assert "idempotency-key" not in fake.calls[-1].headers


def test_body_fingerprint_is_stable():
    body = {"date": "2026-10-05", "items": [{"code": "A", "price": 1.5}], "seller": 1}
    fingerprint = body_fingerprint(body)
    assert re.fullmatch(r"[0-9a-f]{30}", fingerprint)
    assert body_fingerprint(dict(reversed(body.items()))) == fingerprint  # key order irrelevant
    assert body_fingerprint(body | {"date": "2026-10-06"}) != fingerprint


async def test_explicit_idempotency_key_and_validation(fake, clock, settings):
    fake.on("POST", "/v1/invoices", {"id": "x"})
    client = make_client(fake, clock, settings)
    await client.post("/v1/invoices", {}, idempotency_key="Abc123")
    assert fake.calls[-1].headers["idempotency-key"] == "Abc123"
    with pytest.raises(ValueError):
        await client.post("/v1/invoices", {}, idempotency_key="has-hyphen")
    with pytest.raises(ValueError):
        await client.post("/v1/invoices", {}, idempotency_key="a" * 31)
    with pytest.raises(ValueError):
        await client.post("/v1/customers", {}, idempotency_key="abc")


# --------------------------------------------------------------------------- responses


async def test_empty_and_non_json_success(fake, clock, settings):
    fake.on("DELETE", "/v1/invoices/a", httpx.Response(204))
    fake.on("GET", "/v1/taxes", httpx.Response(200, text="<html>oops</html>"))
    client = make_client(fake, clock, settings)
    assert await client.delete("/v1/invoices/a") == {}
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/taxes")
    assert info.value.code == "invalid_response"
    assert (info.value.method, info.value.path) == ("GET", "/v1/taxes")
    assert "rechazó" not in format_api_error(info.value)


async def test_non_json_2xx_on_post_says_it_probably_executed(fake, clock, settings):
    fake.on("POST", "/v1/customers", httpx.Response(201, text="<html>created</html>"))
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.post("/v1/customers", {"a": 1})
    text = format_api_error(info.value)
    assert "POST /v1/customers" in text and "probablemente" in text and "rechazó" not in text


async def test_secrets_never_in_error_text(fake, clock, settings):
    fake.on(
        "GET",
        "/v1/customers",
        siigo_error(400, "x", f"echo {ACCESS_KEY} and jwt-token-1"),
    )
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.get("/v1/customers")
    text = format_api_error(info.value) + str(info.value)
    assert ACCESS_KEY not in text and "jwt-token-1" not in text and "***" in text


async def test_error_params_and_code_are_redacted(fake, clock, settings):
    fake.on(
        "POST",
        "/auth",
        httpx.Response(
            400,
            json={
                "Errors": [
                    {
                        "Code": f"bad_{ACCESS_KEY}",
                        "Message": "Invalid credentials",
                        "Params": ["access_key", ACCESS_KEY],
                    }
                ]
            },
        ),
    )
    client = make_client(fake, clock, settings)
    with pytest.raises(SiigoAPIError) as info:
        await client.authenticate()
    text = format_api_error(info.value) + str(info.value)
    assert ACCESS_KEY not in text and "(params: access_key, ***)" in text


# --------------------------------------------------------------------------- list helpers


def test_normalize_envelope_uses_response_page_size():
    out = normalize_list(
        envelope([{"id": i} for i in range(25)], page=2, page_size=25, total=253), 2
    )
    assert out["page"] == 2 and out["page_size"] == 25 and out["total_results"] == 253
    assert out["count"] == 25 and out["has_more"] is True and out["next_page"] == 3
    last = normalize_list(envelope([{"id": 1}], page=11, page_size=25, total=251), 11)
    assert last["has_more"] is False and last["next_page"] is None
    # Siigo ignored the requested page_size: paging follows the response.
    ignored = normalize_list(envelope([{"id": 1}] * 25, page=1, page_size=25, total=30), 1)
    assert ignored["page_size"] == 25 and ignored["has_more"] is True


def test_normalize_array_value_wrapper_and_garbage():
    arr = normalize_list([{"id": 1}, {"id": 2}])
    assert arr == {
        "page": 1,
        "page_size": 2,
        "total_results": 2,
        "count": 2,
        "has_more": False,
        "next_page": None,
        "results": [{"id": 1}, {"id": 2}],
    }
    wrapped = normalize_list({"value": envelope([{"id": 1}], total=40, page_size=1)}, 1)
    assert wrapped["total_results"] == 40 and wrapped["has_more"] is True
    empty = normalize_list({"pagination": {"page": 1, "page_size": 25, "total_results": 0}})
    assert empty["count"] == 0 and empty["has_more"] is False
    assert normalize_list(None)["results"] == []
    assert normalize_list({"results": [{"id": 1}]})["total_results"] == 1


def test_truncate_output():
    small = {"results": [{"id": 1}], "count": 1}
    assert truncate_output(small) is small
    big = normalize_list([{"id": i, "blob": "x" * 1000} for i in range(100)])
    out = truncate_output(big, paginated=False)
    assert len(render_json(out)) <= MAX_OUTPUT_CHARS
    assert out["truncated"] is True and out["resume"] is None
    assert "page_size" not in out["truncation_message"]  # catalogs have no paging
    assert out["count"] == len(out["results"]) and out["count"] + out["omitted"] == 100
    # Rows that do not fit complete are summarised instead of dropped: all 100 are listed.
    assert out["omitted"] == 0 and out["compacted"] > 0
    assert [r["id"] for r in out["results"]] == list(range(100))
    assert all(len(r["blob"]) <= 120 for r in out["results"] if r.get("_compact"))


def test_truncation_is_measured_on_the_delivered_text():
    """Regression: the cap was measured with json.dumps, not with the text that is sent."""
    rows = [{"id": i, "nombre": "Ñandú " * 150, "nested": {"a": [1, 2, {"b": "é" * 50}]}}
            for i in range(60)]  # fmt: skip
    out = truncate_output(normalize_list(envelope(rows, page_size=60, total=60), 1))
    assert out["truncated"] is True
    assert len(render_json(out)) <= MAX_OUTPUT_CHARS < len(render_json(rows))


def test_compact_row_is_bounded_and_keeps_identifiers():
    row = {
        "id": "g-1", "name": ["Marcos", "Castillo"], "date": "2026-10-01", "total": 7.5,
        "customer": {"id": "c-1", "identification": "13832081", "address": {"x": 1}},
        "items": [{"code": "A"}] * 50, "observations": "x" * 5000,
        "stamp": {"status": "Accepted", "cufe": "c" * 96},
    }  # fmt: skip
    small = compact_row(row)
    assert small["_compact"] is True and "items" not in small
    assert small["customer"] == {"id": "c-1", "identification": "13832081"}
    assert small["name"] == ["Marcos", "Castillo"] and small["stamp"]["cufe"] == "c" * 96
    assert len(small["observations"]) == 120
    wide = {f"field{i}": "y" * 200 for i in range(200)} | {"id": "g-2", "total": 3}
    assert compact_row(wide) == {"id": "g-2", "total": 3, "_compact": True}
    assert compact_row({f"k{i}": "z" * 200 for i in range(200)}) == {"_compact": True}
    assert len(render_json(compact_row("x" * 9000))) <= COMPACT_ROW_CHARS


@pytest.mark.parametrize(("page", "page_size"), [(1, 100), (3, 25), (2, 30), (7, 100)])
def test_truncated_page_points_at_first_omitted_row(page, page_size):
    """next_page must not skip the rows dropped by truncation (resume points at them)."""
    rows = [{"id": i, "blob": "x" * 1100} for i in range(page_size)]
    data = envelope(rows, page=page, page_size=page_size, total=page * page_size + 500)
    out = truncate_output(normalize_list(data, page))
    assert len(render_json(out)) <= MAX_OUTPUT_CHARS
    assert out["truncated"] is True and out["omitted"] > 0
    assert out["next_page"] is None and out["has_more"] is True
    assert not any(r.get("_compact") for r in out["results"])  # paged rows stay complete
    assert out["resume"] == {"page": page, "page_size": page_size, "skip": out["count"]}
    assert "resume" in out["truncation_message"]
    # The same page asked again with that skip starts exactly at the first omitted row.
    again = truncate_output(normalize_list(data, page), skip=out["resume"]["skip"])
    assert again["results"][0]["id"] == out["count"] and again["skip"] == out["count"]


@pytest.mark.parametrize("row_chars", [2_600, 3_300, 24_500, 60_000])
def test_resume_always_makes_progress(row_chars):
    """Regression: with fewer than 10 rows fitting, resume repeated itself forever."""
    rows = [{"id": i, "blob": "x" * row_chars} for i in range(25)]
    data = envelope(rows, page=1, page_size=25, total=25)
    seen: list[int] = []
    skip = 0
    for _ in range(30):
        out = truncate_output(normalize_list(data, 1), skip=skip)
        assert len(render_json(out)) <= MAX_OUTPUT_CHARS and out["count"] >= 1
        seen += [r["id"] for r in out["results"]]
        if not out.get("resume"):
            break
        assert out["resume"]["skip"] > skip
        skip = out["resume"]["skip"]
    assert seen == list(range(25))


def test_skip_and_positions_for_filtered_rows():
    rows = [{"id": i, "active": i % 3 != 0, "blob": "x" * 3000} for i in range(30)]
    data = normalize_list(envelope(rows, page=2, page_size=30, total=90), 2)
    positions = active_positions(data["results"], False)
    data["results"] = [data["results"][i] for i in positions]
    out = truncate_output(data, positions=positions)
    last = out["results"][-1]["id"]
    assert out["resume"]["skip"] == positions[out["count"]] > last
    data_again = normalize_list(envelope(rows, page=2, page_size=30, total=90), 2)
    positions = active_positions(data_again["results"], False)
    data_again["results"] = [data_again["results"][i] for i in positions]
    again = truncate_output(data_again, positions=positions, skip=out["resume"]["skip"])
    assert again["results"][0]["id"] == positions[out["count"]]


def test_skip_without_truncation_and_beyond_the_page():
    data = normalize_list(envelope([{"id": i} for i in range(25)], page_size=25, total=60), 1)
    out = truncate_output(dict(data), skip=20)
    assert [r["id"] for r in out["results"]] == [20, 21, 22, 23, 24]
    assert out["count"] == 5 and out["skip"] == 20 and out["next_page"] == 2
    assert truncate_output(dict(data), skip=99)["results"] == []


def test_truncated_last_page_still_has_more():
    rows = [{"id": i, "blob": "x" * 1100} for i in range(25)]
    out = truncate_output(normalize_list(envelope(rows, page=4, page_size=25, total=100), 4))
    assert out["omitted"] > 0 and out["has_more"] is True and out["next_page"] is None


def test_http_env_vars_names_only_what_is_set():
    env = {"all_proxy": "socks5://h:1", "HTTPS_PROXY": " ", "SSL_CERT_FILE": "/x.pem"}
    assert http_env_vars(env) == ["all_proxy", "SSL_CERT_FILE"]
    assert http_env_vars({}) == []


def test_http_init_problem_is_actionable_and_hides_credentials():
    env = {"HTTPS_PROXY": "ftp://usuario:clave@proxy:21"}
    problem = http_init_problem(ValueError("bad proxy ftp://usuario:clave@proxy:21"), env)
    assert "HTTPS_PROXY" in problem and "ValueError" in problem and "clave" not in problem
    assert "socks5://" in problem and "SSL_CERT_FILE" in problem
    generic = http_init_problem(OSError("x"), {})
    assert "ALL_PROXY" in generic and "SSL_CERT_DIR" in generic


def test_filter_active():
    rows = [{"id": 1, "active": True}, {"id": 2, "active": False}, {"id": 3}]
    assert [r["id"] for r in filter_active(rows, False)] == [1, 3]
    assert len(filter_active(rows, True)) == 3
