"""End-to-end tool tests through the MCP protocol (in-process ``Client``) with a fake Siigo."""

from __future__ import annotations

import base64
import datetime as dt
import json
import logging
import re
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

import anyio
import httpx
import pytest
from conftest import (
    ACCESS_KEY,
    CUSTOMER,
    GUID,
    GUID2,
    TAXES,
    FakeClock,
    FakeSiigo,
    InvoiceStore,
    envelope,
    invoice_payload,
    route_catalogs,
    siigo_error,
)
from mcp import Client

from siigo_mcp import server as srv
from siigo_mcp.client import Settings, redact_secrets, register_secret
from siigo_mcp.server import (
    LOG_FORMAT,
    WRITE_TOOL_NAMES,
    RedactingFormatter,
    configure_logging,
    create_server,
    safe_filename,
)

pytestmark = pytest.mark.anyio

READ_TOOLS = {
    "siigo_check_connection",
    "siigo_list_customers",
    "siigo_get_customer",
    "siigo_list_products",
    "siigo_get_product",
    "siigo_list_invoices",
    "siigo_get_invoice",
    "siigo_get_invoice_dian_errors",
    "siigo_get_invoice_pdf",
    "siigo_get_invoice_xml",
    "siigo_get_credit_note_pdf",
    "siigo_list_credit_notes",
    "siigo_get_credit_note",
    "siigo_list_vouchers",
    "siigo_get_voucher",
    "siigo_list_payment_receipts",
    "siigo_get_payment_receipt",
    "siigo_list_journals",
    "siigo_get_journal",
    "siigo_get_purchase",
    "siigo_list_quotations",
    "siigo_get_quotation",
    "siigo_list_document_types",
    "siigo_list_payment_types",
    "siigo_list_taxes",
    "siigo_list_users",
    "siigo_list_cost_centers",
    "siigo_list_warehouses",
    "siigo_list_price_lists",
    "siigo_list_account_groups",
    "siigo_list_fixed_assets",
    "siigo_list_accounts_payable",
    "siigo_trial_balance_report",
    "siigo_trial_balance_by_third_party",
}
DOWNLOAD_TOOLS = {"siigo_get_invoice_pdf", "siigo_get_invoice_xml", "siigo_get_credit_note_pdf"}
EXERCISED: set[str] = set()  # filled by `call`; checked by the last test in this module


async def call(server, name: str, args: dict[str, Any] | None = None):
    EXERCISED.add(name)
    async with Client(server) as client:
        return await client.call_tool(name, args or {})


def text_of(result) -> str:
    return "\n".join(getattr(c, "text", "") for c in result.content)


# =========================================================================== registration


async def test_read_only_registration_and_annotations(make_server):
    tools = {t.name: t for t in await make_server().list_tools()}
    assert set(tools) == READ_TOOLS
    for name, tool in tools.items():
        assert re.fullmatch(r"siigo_[a-z_]+", name)
        ann = tool.annotations
        assert None not in (
            ann.read_only_hint,
            ann.destructive_hint,
            ann.idempotent_hint,
            ann.open_world_hint,
        )
        assert ann.open_world_hint is True and ann.destructive_hint is False
        assert ann.read_only_hint is (name not in DOWNLOAD_TOOLS)
        assert ann.idempotent_hint is True
        assert tool.title and ann.title == tool.title
        assert tool.output_schema is not None
        assert tool.output_schema["type"] == "object"
        assert tool.output_schema["additionalProperties"] is True
        assert tool.description and len(tool.description) > 40
        assert "ctx" not in tool.input_schema.get("properties", {})


async def test_descriptions_use_spanish_business_terms(make_server):
    tools = {t.name: t.description for t in await make_server(enable_write=True).list_tools()}
    blob = " ".join(tools.values()).lower()
    for term in (
        "factura",
        "tercero",
        "cliente",
        "nota crédito",
        "recibo de caja",
        "comprobante",
        "cotizaci",
        "cartera",
        "cuentas por pagar",
        "balance de prueba",
        "úsala",
        "no la uses",
    ):
        assert term in blob, term
    assert (
        "DIAN" in tools["siigo_create_invoice"] and "IRREVERSIBLE" in tools["siigo_create_invoice"]
    )


async def test_every_parameter_is_described(make_server):
    for tool in await make_server(enable_write=True).list_tools():
        for name, prop in tool.input_schema.get("properties", {}).items():
            assert prop.get("description"), f"{tool.name}.{name}"


async def test_descriptions_fit_the_clients_length_cap(make_server):
    """Regression: siigo_create_invoice's description (2,069 chars with the docstring's
    indentation) was cut by Claude Code's 2,048-char cap for MCP descriptions."""
    tools = await make_server(enable_write=True).list_tools()
    for tool in tools:
        assert len(tool.description) <= 1900, (tool.name, len(tool.description))
        assert "\n    " not in tool.description, tool.name  # published without indentation
    assert len(srv.INSTRUCTIONS) <= 1900


async def test_purchase_id_does_not_point_to_a_listing_that_does_not_exist(make_server):
    """Regression: purchase_id said "obténlo con la herramienta siigo_list_*", but no tool
    lists purchases or returns their GUIDs."""
    tools = {t.name: t for t in await make_server(enable_write=True).list_tools()}
    assert not any("purchase" in name for name in tools if name.startswith("siigo_list_"))
    text = tools["siigo_get_purchase"].input_schema["properties"]["purchase_id"]["description"]
    assert "siigo_list_" not in text and "no tiene un listado de compras" in text


async def test_every_input_schema_forbids_unknown_arguments(make_server):
    for tool in await make_server(enable_write=True).list_tools():
        assert tool.input_schema.get("additionalProperties") is False, tool.name


@pytest.mark.parametrize(
    ("tool", "args"),
    [
        ("siigo_list_customers", {"identificacion": "900123456"}),
        ("siigo_list_customers", {"name": "ACME"}),
        ("siigo_list_customers", {"active": True, "person_type": "Company"}),
        ("siigo_list_invoices", {"status": "Rejected", "customer": "900"}),
        ("siigo_check_connection", {"force": True}),
    ],
)
async def test_unknown_arguments_are_rejected_not_ignored(make_server, fake, tool, args):
    """A misspelled filter must not return unfiltered data that looks filtered."""
    result = await call(make_server(), tool, args)
    assert result.is_error and "Extra inputs are not permitted" in text_of(result)
    assert fake.calls == []


async def test_create_invoice_misspelled_idempotency_key_is_rejected(make_server, fake):
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotencyKey": "K1"},
    )
    assert result.is_error and "idempotencyKey" in text_of(result)
    assert fake.calls == []


async def test_write_tools_registered_only_when_enabled(make_server):
    tools = {t.name: t for t in await make_server(enable_write=True).list_tools()}
    assert set(tools) == READ_TOOLS | WRITE_TOOL_NAMES
    expected = {
        "siigo_create_customer": (False, False, False),
        "siigo_create_invoice": (False, False, False),
        "siigo_send_invoice_email": (False, False, False),
        "siigo_annul_invoice": (False, True, True),
        "siigo_delete_invoice": (False, True, True),
    }
    for name, (ro, destructive, idem) in expected.items():
        ann = tools[name].annotations
        assert (ann.read_only_hint, ann.destructive_hint, ann.idempotent_hint) == (
            ro,
            destructive,
            idem,
        )
        assert ann.open_world_hint is True
    schema = tools["siigo_create_invoice"].input_schema
    assert "invoice" in schema["required"] and "$defs" in schema
    stamp = schema["$defs"]["InvoiceCreate"]["properties"]["stamp"]
    assert "DIAN" in stamp["description"]


async def test_write_tool_unknown_when_disabled(make_server, fake):
    result = await call(make_server(), "siigo_delete_invoice", {"invoice_id": GUID})
    assert result.is_error and "Unknown tool" in text_of(result)
    assert fake.calls == []


@pytest.mark.parametrize(("value", "count"), [("YES", 39), ("true", 39), ("0", 34), (None, 34)])
async def test_enable_write_from_environment(monkeypatch, value, count):
    if value is None:
        monkeypatch.delenv("SIIGO_ENABLE_WRITE", raising=False)
    else:
        monkeypatch.setenv("SIIGO_ENABLE_WRITE", value)
    assert len(await create_server().list_tools()) == count


def test_module_level_server_and_main_exist():
    assert srv.mcp.name == "siigo_mcp"
    assert callable(srv.main)


# =========================================================================== connection & config


async def test_check_connection_forces_auth(make_server, fake):
    server = make_server(enable_write=True)
    async with Client(server) as client:
        first = await client.call_tool("siigo_check_connection", {})
        second = await client.call_tool("siigo_check_connection", {})
    EXERCISED.add("siigo_check_connection")
    assert not first.is_error
    out = second.structured_content
    assert out["ok"] is True and out["partner_id"] == "TestApp"
    assert out["base_url"] == "https://api.siigo.com" and out["rate_limit_per_minute"] == 100
    assert out["write_enabled"] is True and out["token_expires_in_seconds"] > 80000
    assert fake.paths() == ["/auth", "/auth"]
    assert ACCESS_KEY not in json.dumps(out)


async def test_failed_check_connection_does_not_block_the_other_tools(make_server, fake):
    """Regression: a failed forced re-auth threw away the still-valid token, and every tool
    then failed with the stored /auth error (for good, after a 4xx) without trying."""
    fake.on(
        "POST",
        "/auth",
        {"access_token": "valid-token", "expires_in": 86400},
        siigo_error(401, "unauthorized", "Invalid credentials"),
    )
    fake.on("GET", "/v1/taxes", TAXES)
    async with Client(make_server()) as client:
        assert not (await client.call_tool("siigo_list_taxes", {})).is_error
        failed = await client.call_tool("siigo_check_connection", {})
        assert failed.is_error and "POST /auth" in text_of(failed)
        again = await client.call_tool("siigo_list_taxes", {"refresh": True})
    assert not again.is_error, text_of(again)
    assert fake.paths() == ["/auth", "/v1/taxes", "/auth", "/v1/taxes"]
    assert fake.calls[-1].headers["authorization"] == "Bearer valid-token"


@pytest.mark.parametrize(
    "answer",
    [httpx.Response(404, text="404 page not found"),
     siigo_error(404, "not_found", "Resource not found"),
     httpx.Response(405, text="Method Not Allowed")],
)  # fmt: skip
async def test_auth_404_points_to_the_base_url_not_to_a_guid(make_server, fake, answer):
    """Regression: SIIGO_BASE_URL with a gateway path (/alliances/api) gave a 404 on POST
    /auth and the hint "Revisa el ID (GUID)", which nothing could act on."""
    fake.on("POST", "/auth", answer)
    async with Client(make_server()) as client:
        check = text_of(await client.call_tool("siigo_check_connection", {}))
        stored = text_of(await client.call_tool("siigo_list_taxes", {}))
    for text in (check, stored):
        assert "POST /auth" in text and "SIIGO_BASE_URL" in text and "/alliances/api" in text
        assert "Revisa el ID" not in text and "obténlo con" not in text
    assert fake.paths() == ["/auth"]


async def test_missing_config_does_not_crash_and_is_actionable(fake, clock):
    server = create_server(
        Settings(partner_id="my-app"), fake.transport, sleep=clock.sleep, clock=clock
    )
    assert len(await server.list_tools()) == 34  # server starts anyway
    for tool in ("siigo_check_connection", "siigo_list_taxes"):
        result = await call(server, tool)
        text = text_of(result)
        assert result.is_error
        for name in ("SIIGO_USERNAME", "SIIGO_ACCESS_KEY", "SIIGO_PARTNER_ID"):
            assert name in text
    assert fake.calls == []


HTTP_ENV = [n for base in ("ALL_PROXY", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY")
            for n in (base, base.lower())] + ["SSL_CERT_FILE", "SSL_CERT_DIR"]  # fmt: skip


@pytest.fixture
def http_env(monkeypatch):
    """The real httpx transport reads these variables: start from none of them."""
    for name in HTTP_ENV:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


@pytest.mark.parametrize(
    ("var", "value", "error"),
    [
        ("HTTPS_PROXY", "ftp://proxy:21", "ValueError"),
        ("all_proxy", "http://proxy:not-a-port", "InvalidURL"),
        ("SSL_CERT_FILE", "/nonexistent/siigo-ca.pem", "FileNotFoundError"),
        ("SSL_CERT_FILE", "NOT_PEM", "SSLError"),
    ],
)
async def test_bad_proxy_or_ca_environment_is_reported_by_the_tools(
    http_env, settings, tmp_path, var, value, error
):
    """Regression: httpx raised while the lifespan built the client, so the server died
    before answering initialize (Claude showed only 'Connection closed')."""
    if value == "NOT_PEM":
        value = str(tmp_path / "hostname")
        Path(value).write_text("esto no es un certificado\n")
    http_env.setenv(var, value)
    server = create_server(settings)  # no injected transport: httpx reads the environment
    async with Client(server) as client:
        names = {t.name for t in (await client.list_tools()).tools}
        check = await client.call_tool("siigo_check_connection", {})
        taxes = await client.call_tool("siigo_list_taxes", {})
    assert len(names) == len(READ_TOOLS)
    for result in (check, taxes):
        text = text_of(result)
        assert result.is_error and var in text and error in text, text
        assert "no se pudo inicializar el cliente HTTP" in text


async def test_socks_proxy_is_supported_and_named_in_connection_errors(http_env, settings):
    """httpx[socks] is a dependency: a SOCKS proxy works; a dead one is named in the error."""
    http_env.setenv("ALL_PROXY", "socks5://127.0.0.1:1")
    async with Client(create_server(settings)) as client:
        result = await client.call_tool("siigo_check_connection", {})
    text = text_of(result)
    assert result.is_error and "No se pudo conectar con Siigo" in text
    assert "ALL_PROXY" in text and "socksio" not in text


async def test_bad_credentials(make_server, fake):
    fake.on("POST", "/auth", siigo_error(400, "invalid_credentials", "The credentials are invalid"))
    result = await call(make_server(), "siigo_check_connection")
    text = text_of(result)
    assert result.is_error and "invalid_credentials" in text and "SIIGO_ACCESS_KEY" in text
    assert ACCESS_KEY not in text


async def test_invalid_partner_id_hint(make_server, fake):
    fake.on("POST", "/auth", siigo_error(400, "invalid_partner_id", "Partner-Id invalid"))
    text = text_of(await call(make_server(), "siigo_check_connection"))
    assert "SIIGO_PARTNER_ID" in text and "registrado" in text


async def test_partner_id_on_every_request(make_server, fake):
    fake.on("GET", "/v1/customers", envelope([CUSTOMER]))
    fake.on("GET", "/v1/taxes", TAXES)
    server = make_server()
    async with Client(server) as client:
        await client.call_tool("siigo_list_customers", {})
        await client.call_tool("siigo_list_taxes", {})
    assert fake.paths() == ["/auth", "/v1/customers", "/v1/taxes"]
    assert all(c.headers["partner-id"] == "TestApp" for c in fake.calls)
    assert all(c.headers["authorization"] == "Bearer jwt-token-1" for c in fake.data_calls())
    assert all("idempotency-key" not in c.headers for c in fake.calls)


# =========================================================================== list tools

DATES = {"created_start": "2026-01-01", "created_end": "2026-01-31T23:59:59Z"}
UPDATED = {"updated_start": "2026-02-01", "updated_end": "2026-02-28"}

LIST_CASES = [
    (
        "siigo_list_customers",
        {"identification": "900123456", "branch_office": 1, **DATES, **UPDATED},
        "/v1/customers",
        {"identification": "900123456", "branch_office": "1", **DATES, **UPDATED},
    ),
    (
        "siigo_list_products",
        {"code": "SKU-1", "ids": [GUID, GUID2], **DATES, **UPDATED},
        "/v1/products",
        {"code": "SKU-1", "ids": f"{GUID},{GUID2}", **DATES, **UPDATED},
    ),
    (
        "siigo_list_invoices",
        {
            "document_id": 24446,
            "customer_identification": "13832081",
            "customer_branch_office": 0,
            "name": "FV-1-457",
            "date_start": "2026-01-01",
            "date_end": "2026-01-31",
            **DATES,
            **UPDATED,
        },
        "/v1/invoices",
        {
            "document_id": "24446",
            "customer_identification": "13832081",
            "customer_branch_office": "0",
            "name": "FV-1-457",
            "date_start": "2026-01-01",
            "date_end": "2026-01-31",
            **DATES,
            **UPDATED,
        },
    ),
    ("siigo_list_credit_notes", {**DATES, **UPDATED}, "/v1/credit-notes", {**DATES, **UPDATED}),
    ("siigo_list_vouchers", {**DATES, **UPDATED}, "/v1/vouchers", {**DATES, **UPDATED}),
    (
        "siigo_list_payment_receipts",
        {**DATES, **UPDATED},
        "/v1/payment-receipts",
        {**DATES, **UPDATED},
    ),
    ("siigo_list_journals", {"document_id": 5}, "/v1/journals", {"document_id": "5"}),
    (
        "siigo_list_quotations",
        {
            "name": "C-1-25",
            "customer_identification": "1020304",
            "customer_branch_office": 2,
            **DATES,
        },
        "/v1/quotations",
        {
            "name": "C-1-25",
            "customer_identification": "1020304",
            "customer_branch_office": "2",
            **DATES,
        },
    ),
    (
        "siigo_list_accounts_payable",
        {
            "due_date_start": "2026-01-01",
            "due_date_end": "2026-12-31",
            "provider_identification": "800100200",
            "provider_branch_office": 3,
        },
        "/v1/accounts-payable",
        {
            "due_date_start": "2026-01-01",
            "due_date_end": "2026-12-31",
            "provider_identification": "800100200",
            "provider_branch_office": "3",
        },
    ),
]


@pytest.mark.parametrize(("tool", "args", "path", "params"), LIST_CASES)
async def test_list_tools_send_filters_and_normalize(make_server, fake, tool, args, path, params):
    rows = [{"id": f"r{i}"} for i in range(10)]
    fake.on("GET", path, envelope(rows, page=2, page_size=10, total=35))
    result = await call(make_server(), tool, {"page": 2, "page_size": 10, **args})
    assert not result.is_error, text_of(result)
    out = result.structured_content
    assert out["page"] == 2 and out["total_results"] == 35 and out["count"] == 10
    assert out["has_more"] is True and out["next_page"] == 3 and out["results"] == rows
    call_ = fake.data_calls()[0]
    assert call_.path == path
    assert call_.params == {"page": "2", "page_size": "10", **params}


@pytest.mark.parametrize("tool", [c[0] for c in LIST_CASES])
async def test_list_tools_defaults(make_server, fake, tool):
    path = next(c[2] for c in LIST_CASES if c[0] == tool)
    fake.on("GET", path, envelope([]))
    result = await call(make_server(), tool)
    assert not result.is_error
    assert fake.data_calls()[0].params == {"page": "1", "page_size": "25"}
    assert result.structured_content["has_more"] is False


async def test_accounts_payable_value_wrapper(make_server, fake):
    fake.on("GET", "/v1/accounts-payable", {"value": envelope([{"due": {"balance": 10}}])})
    out = (await call(make_server(), "siigo_list_accounts_payable")).structured_content
    assert out["results"] == [{"due": {"balance": 10}}] and out["total_results"] == 1


async def test_accounts_payable_branch_requires_provider_identification(make_server, fake):
    """Regression: the Blueprint allows provider_branch_office only after
    provider_identification; sent alone it was forwarded (a 4xx toward the 80% rule, or
    every provider's payables looking filtered)."""
    result = await call(make_server(), "siigo_list_accounts_payable", {"provider_branch_office": 1})
    text = text_of(result)
    assert result.is_error and "provider_branch_office requiere provider_identification" in text
    assert fake.calls == []
    tool = {t.name: t for t in await make_server().list_tools()}["siigo_list_accounts_payable"]
    branch = tool.input_schema["properties"]["provider_branch_office"]
    assert "provider_identification" in branch["description"]


@pytest.mark.parametrize(
    "args",
    [
        {"page_size": 500},
        {"page_size": 0},
        {"page": 0},
        {"created_start": "2026/01/01"},
        {"created_start": "2026-13-01"},
        {"created_start": "2026-01-01T10:00:00"},
        {"identification": "900.123.456-7"},
        {"branch_office": 1000},
    ],
)
async def test_list_argument_validation_happens_before_any_request(make_server, fake, args):
    result = await call(make_server(), "siigo_list_customers", args)
    assert result.is_error
    assert fake.calls == []


async def test_inverted_date_range_rejected_locally(make_server, fake):
    result = await call(
        make_server(), "siigo_list_invoices", {"date_start": "2026-02-01", "date_end": "2026-01-01"}
    )
    assert result.is_error and "Rango de fechas" in text_of(result)
    assert fake.calls == []


async def test_large_list_is_truncated(make_server, fake):
    rows = [{"id": i, "observations": "x" * 2000} for i in range(100)]
    fake.on("GET", "/v1/invoices", envelope(rows, page_size=100, total=100))
    result = await call(make_server(), "siigo_list_invoices", {"page_size": 100})
    out = result.structured_content
    assert out["truncated"] is True and out["omitted"] > 0
    assert len(text_of(result)) <= 25_000
    assert out["resume"] == {"page": 1, "page_size": 100, "skip": out["count"]}
    assert "skip=" in out["truncation_message"]


async def test_text_block_the_model_reads_respects_the_cap(make_server, fake):
    """Regression: the cap was measured on compact JSON while the SDK sent indented JSON."""
    fake.on("GET", "/v1/invoices", _paged_invoices(40, _big_invoice_row))
    async with Client(make_server()) as client:
        result = await client.call_tool("siigo_list_invoices", {"page": 1, "page_size": 25})
    out = result.structured_content
    assert out["truncated"] is True and "25.000" in out["truncation_message"]
    texts = [c.text for c in result.content]
    assert len(texts) == 1 and len(texts[0]) <= 25_000
    assert json.loads(texts[0]) == out
    # Not much room is wasted either: the next row would not have fitted.
    assert len(texts[0]) + len(json.dumps(_big_invoice_row(99), ensure_ascii=False)) > 24_000


def _invoice_row(i: int) -> dict[str, Any]:
    """A realistic invoice row (about 1,150 JSON characters)."""
    return {
        "id": f"3fa85f64-5717-4562-b3fc-{i:012d}",
        "document": {"id": 24446},
        "prefix": "FV",
        "number": i,
        "name": f"FV-1-{i}",
        "date": "2026-09-01",
        "customer": {"id": GUID, "identification": "13832081", "branch_office": 0},
        "seller": 629,
        "total": 1000,
        "balance": 1000,
        "observations": "Pedido " + "x" * 300,
        "items": [{"code": "A1", "description": "Camiseta", "quantity": 1, "price": 840.34,
                   "taxes": [{"id": 13156, "name": "IVA 19%", "percentage": 19, "value": 159.66}],
                   "total": 1000}],
        "payments": [{"id": 5636, "name": "Efectivo", "value": 1000, "due_date": "2026-10-01"}],
        "stamp": {"status": "Accepted", "cufe": "c" * 96},
        "mail": {"status": "sent", "observations": ""},
        "metadata": {"created": "2026-09-01T10:00:00Z", "last_updated": None},
    }  # fmt: skip


def _paged_invoices(total: int, make_row: Any = None):
    """A fake GET /v1/invoices that pages like Siigo (sizes below 10 are raised to 10)."""
    make_row = make_row or _invoice_row

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        size = max(10, int(request.url.params["page_size"]))
        start = (page - 1) * size
        rows = [make_row(i) for i in range(start, min(start + size, total))]
        return httpx.Response(200, json=envelope(rows, page=page, page_size=size, total=total))

    return handler


async def _follow_pages(client, args: dict[str, Any], max_calls: int = 100):
    """Page like the server instructions say: `resume` when present, else next_page."""
    trail: list[dict[str, Any]] = []
    args = dict(args)
    for _ in range(max_calls):
        result = await client.call_tool("siigo_list_invoices", args)
        assert not result.is_error, text_of(result)
        out = result.structured_content
        text = text_of(result)
        assert len(text) <= 25_000  # what the model reads
        assert json.loads(text) == out
        trail.append(out)
        if out.get("resume"):
            assert out["next_page"] is None and out["has_more"] is True
            args = {**args, **out["resume"]}
        elif out["next_page"]:
            args = {**args, "page": out["next_page"], "page_size": out["page_size"], "skip": 0}
        else:
            return trail
    raise AssertionError(f"paging did not finish in {max_calls} calls")


@pytest.mark.parametrize(("total", "page_size"), [(200, 100), (120, 25)])
async def test_paging_through_truncated_pages_sees_every_row(make_server, fake, total, page_size):
    """Following next_page, or resume when a page is truncated, never skips a row."""
    fake.on("GET", "/v1/invoices", _paged_invoices(total))
    async with Client(make_server()) as client:
        trail = await _follow_pages(client, {"page": 1, "page_size": page_size})
    rows = [r for out in trail for r in out["results"]]
    assert any(out.get("truncated") for out in trail)
    assert not any(r.get("_compact") for r in rows)  # every row arrived complete
    assert [r["id"] for r in rows] == [_invoice_row(i)["id"] for i in range(total)]
    assert sum(r["balance"] for r in rows) == total * 1000
    for call in fake.data_calls():
        assert "skip" not in call.params  # local only: never sent to Siigo


def _big_invoice_row(i: int) -> dict[str, Any]:
    """An 8-item invoice of about 2,900 characters: fewer than 10 fit in 25,000."""
    row = _invoice_row(i)
    item = row["items"][0] | {"description": "Servicio de consultoría contable mensual " * 2}
    row["items"] = [item | {"code": f"P{j}"} for j in range(8)]
    return row


async def test_resume_makes_progress_when_fewer_than_ten_rows_fit(make_server, fake):
    """Regression: resume used to repeat {page 1, page_size 10, skip k} forever."""
    fake.on("GET", "/v1/invoices", _paged_invoices(40, _big_invoice_row))
    async with Client(make_server()) as client:
        trail = await _follow_pages(client, {"page": 1, "page_size": 25}, max_calls=12)
    rows = [r for out in trail for r in out["results"]]
    assert [r["id"] for r in rows] == [_big_invoice_row(i)["id"] for i in range(40)]
    assert all(0 < out["count"] < 10 for out in trail if out.get("truncated"))
    resumes = [out["resume"] for out in trail if out.get("resume")]
    assert len(resumes) == len({json.dumps(r, sort_keys=True) for r in resumes})  # no repeats


async def test_oversized_row_is_summarised_and_paging_continues(make_server, fake):
    """Regression: a row over 25,000 chars used to end the listing (count 0, no resume)."""

    def row(i: int) -> dict[str, Any]:
        return {"id": f"3fa85f64-5717-4562-b3fc-{i:012d}", "name": f"FV-1-{i}", "balance": 7,
                "observations": "x" * (30_000 if i == 15 else 300)}  # fmt: skip

    fake.on("GET", "/v1/invoices", _paged_invoices(60, row))
    async with Client(make_server()) as client:
        trail = await _follow_pages(client, {"page": 1, "page_size": 50}, max_calls=10)
    rows = [r for out in trail for r in out["results"]]
    assert [r["id"] for r in rows] == [row(i)["id"] for i in range(60)]
    huge = next(r for r in rows if r["id"] == row(15)["id"])
    assert huge["_compact"] is True and huge["name"] == "FV-1-15" and huge["balance"] == 7
    assert len(huge["observations"]) <= 120
    assert sum(bool(r.get("_compact")) for r in rows) == 1  # only the oversized one


# =========================================================================== get tools

GET_CASES = [
    ("siigo_get_customer", "customer_id", "/v1/customers/{}"),
    ("siigo_get_product", "product_id", "/v1/products/{}"),
    ("siigo_get_invoice", "invoice_id", "/v1/invoices/{}"),
    ("siigo_get_invoice_dian_errors", "invoice_id", "/v1/invoices/{}/stamp/errors"),
    ("siigo_get_credit_note", "credit_note_id", "/v1/credit-notes/{}"),
    ("siigo_get_voucher", "voucher_id", "/v1/vouchers/{}"),
    ("siigo_get_payment_receipt", "payment_receipt_id", "/v1/payment-receipts/{}"),
    ("siigo_get_journal", "journal_id", "/v1/journals/{}"),
    ("siigo_get_purchase", "purchase_id", "/v1/purchases/{}"),
    ("siigo_get_quotation", "quotation_id", "/v1/quotations/{}"),
]


@pytest.mark.parametrize(("tool", "arg", "path"), GET_CASES)
async def test_get_tools_return_raw_object(make_server, fake, tool, arg, path):
    payload = {"id": GUID, "name": "X-1", "stamp": {"status": "Accepted"}}
    fake.on("GET", path.format(GUID), payload)
    result = await call(make_server(), tool, {arg: GUID})
    assert not result.is_error, text_of(result)
    assert result.structured_content == payload
    assert fake.data_calls()[0].params == {}


@pytest.mark.parametrize("bad_id", ["123", "../customers", f"{GUID}/annul", f"{GUID}?x=1", ""])
async def test_get_tools_reject_non_guid_ids(make_server, fake, bad_id):
    result = await call(make_server(), "siigo_get_invoice", {"invoice_id": bad_id})
    assert result.is_error and fake.calls == []


async def test_get_not_found_hint(make_server, fake):
    fake.on("GET", f"/v1/invoices/{GUID}", siigo_error(404, "not_found", "Invoice not found"))
    text = text_of(await call(make_server(), "siigo_get_invoice", {"invoice_id": GUID}))
    assert "Siigo 404 not_found: Invoice not found" in text and "siigo_list_" in text


async def test_get_non_dict_response_is_wrapped(make_server, fake):
    fake.on("GET", f"/v1/invoices/{GUID}/stamp/errors", [{"message": "x"}])
    out = (
        await call(make_server(), "siigo_get_invoice_dian_errors", {"invoice_id": GUID})
    ).structured_content
    assert out == {"result": [{"message": "x"}]}


# =========================================================================== catalogs

CATALOG_CASES = [
    ("siigo_list_document_types", {"type": "NC"}, "/v1/document-types", {"type": "NC"}),
    (
        "siigo_list_payment_types",
        {"document_type": "RC"},
        "/v1/payment-types",
        {"document_type": "RC"},
    ),
    ("siigo_list_taxes", {}, "/v1/taxes", {}),
    ("siigo_list_cost_centers", {}, "/v1/cost-centers", {}),
    ("siigo_list_warehouses", {}, "/v1/warehouses", {}),
    ("siigo_list_price_lists", {}, "/v1/price-lists", {}),
    ("siigo_list_account_groups", {}, "/v1/account-groups", {}),
    ("siigo_list_fixed_assets", {}, "/v1/fixed-assets", {}),
]


@pytest.mark.parametrize(("tool", "args", "path", "params"), CATALOG_CASES)
async def test_catalog_tools_filter_inactive_and_cache(make_server, fake, tool, args, path, params):
    fake.on("GET", path, [{"id": 1, "active": True}, {"id": 2, "active": False}])
    EXERCISED.add(tool)
    async with Client(make_server()) as client:
        first = (await client.call_tool(tool, args)).structured_content
        second = (await client.call_tool(tool, args)).structured_content
        both = (await client.call_tool(tool, {**args, "include_inactive": True})).structured_content
        fresh = (await client.call_tool(tool, {**args, "refresh": True})).structured_content
    assert first["results"] == [{"id": 1, "active": True}]
    assert first["count"] == 1 and first["inactive_omitted"] == 1 and first["cached"] is False
    assert second["cached"] is True and both["count"] == 2 and both["inactive_omitted"] == 0
    assert fresh["cached"] is False
    calls = fake.data_calls()
    assert [c.path for c in calls] == [path, path]  # 4 tool calls, 2 HTTP requests
    assert calls[0].params == params


async def test_payment_types_default_fv_and_document_type_required(make_server, fake):
    fake.on("GET", "/v1/payment-types", [])
    fake.on("GET", "/v1/document-types", [])
    server = make_server()
    assert not (await call(server, "siigo_list_payment_types")).is_error
    assert fake.data_calls()[0].params == {"document_type": "FV"}
    result = await call(server, "siigo_list_document_types", {})
    assert result.is_error  # `type` is required
    result = await call(server, "siigo_list_document_types", {"type": "XX"})
    assert result.is_error


@pytest.mark.parametrize(
    "payload",
    [
        envelope([{"id": 629, "active": True}, {"id": 630, "active": False}], total=2),
        [{"id": 629, "active": True}, {"id": 630, "active": False}],
    ],
)
async def test_users_both_shapes(make_server, fake, payload):
    fake.on("GET", "/v1/users", payload)
    out = (await call(make_server(), "siigo_list_users", {"page_size": 50})).structured_content
    assert [u["id"] for u in out["results"]] == [629]
    assert out["inactive_omitted"] == 1 and out["total_results"] == 2
    assert fake.data_calls()[0].params == {"page": "1", "page_size": "50"}
    all_users = await call(make_server(), "siigo_list_users", {"include_inactive": True})
    assert all_users.structured_content["count"] == 2


async def test_users_resume_skip_counts_rows_of_the_siigo_page(make_server, fake):
    """`skip` refers to the Siigo page, inactive rows included (they are filtered locally)."""
    users = [{"id": i, "active": i != 1, "blob": "x" * 3000} for i in range(12)]
    fake.on("GET", "/v1/users", envelope(users, page_size=12, total=12))
    server = make_server()
    first = (await call(server, "siigo_list_users", {"page_size": 12})).structured_content
    assert first["truncated"] and 1 not in [u["id"] for u in first["results"]]
    rest = (
        await call(server, "siigo_list_users", {"page_size": 12, **first["resume"]})
    ).structured_content
    ids = [u["id"] for u in first["results"] + rest["results"]]
    assert ids == [0, *range(2, 12)] and not rest.get("resume")
    assert all("skip" not in c.params for c in fake.data_calls())


BIG = "x" * 30_000  # a row that does not fit even alone: it arrives summarised


@pytest.mark.parametrize(
    ("tool", "args", "path", "payload", "detail"),
    [
        ("siigo_list_users", {}, "/v1/users", envelope([{"id": 1, "b": BIG}]), None),
        ("siigo_list_accounts_payable", {}, "/v1/accounts-payable",
         {"value": envelope([{"due": {"balance": 1}, "b": BIG}])}, None),
        ("siigo_list_taxes", {}, "/v1/taxes",
         [{"id": i, "active": True, "b": "x" * 3000} for i in range(20)], None),
        ("siigo_list_document_types", {"type": "FV"}, "/v1/document-types",
         [{"id": i, "active": True, "b": "x" * 3000} for i in range(20)], None),
        ("siigo_list_invoices", {}, "/v1/invoices", envelope([{"id": GUID, "b": BIG}]),
         "siigo_get_invoice"),
        ("siigo_list_customers", {}, "/v1/customers", envelope([{"id": GUID, "b": BIG}]),
         "siigo_get_customer"),
    ],
)  # fmt: skip
async def test_truncation_advice_points_only_to_tools_that_exist(
    make_server, fake, tool, args, path, payload, detail
):
    """Regression: catalogs, users and accounts payable were told to use a siigo_get_* tool
    that does not exist for them."""
    fake.on("GET", path, payload)
    server = make_server()
    out = (await call(server, tool, args)).structured_content
    message = out["truncation_message"]
    assert out["truncated"] and out["compacted"] >= 1 and "siigo_get_*" not in message
    named = set(re.findall(r"siigo_get_\w+", message))
    assert named == ({detail} if detail else set())
    assert named <= {t.name for t in await server.list_tools()}


def test_detail_tools_exist_and_instructions_do_not_promise_one_for_every_listing():
    registered = {s.name for s in srv.TOOL_SPECS}
    assert set(srv.DETAIL_TOOLS.values()) <= registered
    text = " ".join(srv.INSTRUCTIONS.split())
    assert "usa siigo_get_* con su id para el detalle" not in text
    assert "no la tienen" in text
    # siigo_list_users is not a cached catalog (no refresh, paginated).
    assert "siigo_list_taxes, siigo_list_users)" not in text
    assert "vendedores (siigo_list_users)" in text


# =========================================================================== reports


async def test_trial_balance_report(make_server, fake):
    fake.on("POST", "/v1/test-balance-report", {"file_id": "f1", "file_url": "https://x/f.xlsx"})
    result = await call(
        make_server(),
        "siigo_trial_balance_report",
        {"year": 2026, "month_start": 1, "month_end": 13, "account_start": "1105"},
    )
    out = result.structured_content
    assert out["file_url"] == "https://x/f.xlsx" and "Excel" in out["message"]
    body = fake.data_calls()[0].body
    assert body == {
        "year": 2026,
        "month_start": 1,
        "month_end": 13,
        "account_start": "1105",
        "includes_tax_difference": False,
    }
    assert "idempotency-key" not in fake.data_calls()[0].headers


async def test_trial_balance_by_third_party(make_server, fake):
    fake.on("POST", "/v1/test-balance-report-by-thirdparty", {"file_id": "f", "file_url": "u"})
    result = await call(
        make_server(),
        "siigo_trial_balance_by_third_party",
        {
            "year": 2025,
            "month_start": 3,
            "month_end": 6,
            "customer_identification": "900123456",
            "includes_tax_difference": True,
        },
    )
    assert not result.is_error
    body = fake.data_calls()[0].body
    assert body["customer"] == {"identification": "900123456", "branch_office": 0}
    assert body["includes_tax_difference"] is True and "account_start" not in body


@pytest.mark.parametrize(
    "args",
    [
        {"year": 2026, "month_start": 6, "month_end": 2},
        {"year": 26, "month_start": 1, "month_end": 2},
        {"year": 2026, "month_start": 0, "month_end": 2},
        {"year": 2026, "month_start": 1, "month_end": 14},
        {"year": 2026, "month_start": 1, "month_end": 2, "account_start": "11-05"},
    ],
)
async def test_trial_balance_validation(make_server, fake, args):
    result = await call(make_server(), "siigo_trial_balance_report", args)
    assert result.is_error and fake.calls == []


async def test_report_post_not_retried_on_429(make_server, fake):
    fake.on(
        "POST",
        "/v1/test-balance-report",
        siigo_error(429, "requests_limit", "Try again in 4 seconds"),
    )
    result = await call(
        make_server(),
        "siigo_trial_balance_report",
        {"year": 2026, "month_start": 1, "month_end": 2},
    )
    assert result.is_error and "espera 4 s" in text_of(result)
    assert fake.paths().count("/v1/test-balance-report") == 1


# =========================================================================== downloads

PDF_BYTES = b"%PDF-1.7\n" + bytes(range(256)) * 4


@pytest.mark.parametrize(
    ("tool", "arg", "path", "ext", "code_key"),
    [
        ("siigo_get_invoice_pdf", "invoice_id", "/v1/invoices/{}/pdf", "pdf", "cufe"),
        ("siigo_get_invoice_xml", "invoice_id", "/v1/invoices/{}/xml", "xml", "cufe"),
        ("siigo_get_credit_note_pdf", "credit_note_id", "/v1/credit-notes/{}/pdf", "pdf", "cude"),
    ],
)
async def test_download_tools_write_file_and_never_return_base64(
    make_server, fake, settings, tool, arg, path, ext, code_key
):
    encoded = base64.b64encode(PDF_BYTES).decode()
    wrapped = "\n".join(encoded[i : i + 76] for i in range(0, len(encoded), 76))
    fake.on("GET", path.format(GUID), {"id": GUID, "base64": wrapped, code_key: "abc123"})
    result = await call(make_server(), tool, {arg: GUID})
    assert not result.is_error, text_of(result)
    out = result.structured_content
    target = Path(out["path"])
    assert target.read_bytes() == PDF_BYTES
    assert target.parent == settings.download_dir.resolve()
    assert target.name == f"{GUID}.{ext}"
    assert out["bytes"] == len(PDF_BYTES) and out[code_key] == "abc123" and out["format"] == ext
    dumped = json.dumps(out) + text_of(result)
    assert encoded[:40] not in dumped and "base64" not in dumped
    # Idempotent: a second call overwrites the same file.
    again = (await call(make_server(), tool, {arg: GUID})).structured_content
    assert again["path"] == out["path"] and len(list(target.parent.iterdir())) == 1


async def test_download_file_name_is_sanitized(make_server, fake, settings):
    fake.on(
        "GET", f"/v1/invoices/{GUID}/pdf", {"id": GUID, "base64": base64.b64encode(b"x").decode()}
    )
    for name, expected in [
        ("FV-2-22", "FV-2-22.pdf"),
        ("../../etc/passwd", "etc_passwd.pdf"),
        ("Factura Señor Pérez.PDF", "Factura_Senor_Perez.pdf"),
        ("CON", "_CON.pdf"),
        ("...", f"{GUID}.pdf"),
    ]:
        out = (
            await call(
                make_server(), "siigo_get_invoice_pdf", {"invoice_id": GUID, "file_name": name}
            )
        ).structured_content
        assert Path(out["path"]).name == expected
        assert Path(out["path"]).parent == settings.download_dir.resolve()


def test_safe_filename_unit():
    assert safe_filename("a/b\\c:d*e?.xml", "xml") == "a_b_c_d_e.xml"
    assert safe_filename("", "pdf", fallback="doc") == "doc.pdf"
    assert safe_filename("lpt1.txt", "pdf") == "_lpt1.txt.pdf"
    assert len(safe_filename("x" * 500, "pdf")) == 124


@pytest.mark.parametrize(
    ("payload", "fragment"),
    [
        ({"id": GUID}, "base64 vacío"),
        ({"id": GUID, "base64": ""}, "base64 vacío"),
        ({"id": GUID, "base64": "***not base64***"}, "no es base64"),
    ],
)
async def test_download_bad_payloads(make_server, fake, payload, fragment):
    fake.on("GET", f"/v1/invoices/{GUID}/pdf", payload)
    result = await call(make_server(), "siigo_get_invoice_pdf", {"invoice_id": GUID})
    assert result.is_error and fragment in text_of(result)


async def test_download_dir_not_writable(make_server, fake, tmp_path):
    blocker = tmp_path / "a-file"
    blocker.write_text("x")
    fake.on("GET", f"/v1/invoices/{GUID}/pdf", {"id": GUID, "base64": "eA=="})
    result = await call(
        make_server(download_dir=blocker / "sub"), "siigo_get_invoice_pdf", {"invoice_id": GUID}
    )
    assert result.is_error and "SIIGO_DOWNLOAD_DIR" in text_of(result)


async def test_download_dir_that_cannot_be_expanded_is_actionable(make_server, fake, monkeypatch):
    real = Path.expanduser

    def expanduser(self):
        if str(self).startswith("~siigo_no_such_user_zz9"):
            raise RuntimeError("Could not determine home directory.")
        return real(self)

    monkeypatch.setattr(Path, "expanduser", expanduser)
    fake.on("GET", f"/v1/invoices/{GUID}/pdf", {"id": GUID, "base64": "eA=="})
    server = make_server(download_dir=Path("~siigo_no_such_user_zz9/x"))
    result = await call(server, "siigo_get_invoice_pdf", {"invoice_id": GUID})
    text = text_of(result)
    assert result.is_error and "SIIGO_DOWNLOAD_DIR" in text and "inesperado" not in text


# =========================================================================== error mapping


async def test_all_errors_reported_with_hints(make_server, fake):
    fake.on(
        "GET",
        "/v1/customers",
        httpx.Response(
            400,
            json={
                "Status": 400,
                "Errors": [
                    {"Code": "parameter_required", "Message": "code required", "Params": ["code"]},
                    {"Code": "invalid_date", "Message": "bad date", "Params": []},
                ],
            },
        ),
    )
    text = text_of(await call(make_server(), "siigo_list_customers"))
    assert "parameter_required: code required (params: code)" in text
    assert "invalid_date: bad date" in text
    assert "Falta(n) el/los campo(s): code." in text and "Qué hacer" in text
    assert fake.paths().count("/v1/customers") == 1  # 4xx never retried


async def test_gateway_error_text_and_retries(make_server, fake, clock):
    fake.on("GET", "/v1/taxes", httpx.Response(502, text="<html>KrakenD bad gateway</html>"))
    text = text_of(await call(make_server(), "siigo_list_taxes"))
    assert "Siigo HTTP 502: <html>KrakenD bad gateway</html>" in text
    assert fake.paths().count("/v1/taxes") == 3
    assert [s for s in clock.sleeps if s > 1] == [5.0, 10.0]


async def test_rate_limit_retry_through_tool(make_server, fake, clock):
    fake.on(
        "GET",
        "/v1/customers",
        siigo_error(429, "requests_limit", "Rate limit. Try again in 3 seconds"),
        envelope([CUSTOMER]),
    )
    result = await call(make_server(), "siigo_list_customers")
    assert not result.is_error and 3.0 in clock.sleeps


async def test_network_error_message(make_server, fake):
    def down(request):
        raise httpx.ConnectTimeout("timeout", request=request)

    fake.on("GET", "/v1/customers", down)
    text = text_of(await call(make_server(), "siigo_list_customers"))
    assert "Siigo no respondió a tiempo" in text and "Intenta de nuevo" in text


async def test_unexpected_exception_becomes_generic_tool_error(make_server, fake):
    def crash(request):
        raise RuntimeError(f"internal detail {ACCESS_KEY}")

    fake.on("GET", "/v1/customers", crash)
    result = await call(make_server(), "siigo_list_customers")
    text = text_of(result)
    assert result.is_error and "Error inesperado (RuntimeError)" in text
    assert ACCESS_KEY not in text


async def test_secret_never_leaks_in_tool_errors(make_server, fake):
    fake.on("GET", "/v1/customers", siigo_error(400, "x", f"bad key {ACCESS_KEY}"))
    text = text_of(await call(make_server(), "siigo_list_customers"))
    assert ACCESS_KEY not in text and "***" in text


async def test_secret_echoed_in_error_params_never_reaches_the_client(make_server, fake):
    fake.on(
        "POST",
        "/auth",
        httpx.Response(
            400,
            json={
                "Errors": [
                    {
                        "Code": "invalid_value",
                        "Message": "Invalid credentials",
                        "Params": ["access_key", ACCESS_KEY],
                    }
                ]
            },
        ),
    )
    text = text_of(await call(make_server(), "siigo_check_connection"))
    assert ACCESS_KEY not in text and "(params: access_key, ***)" in text


class YieldingClock(FakeClock):
    """Fake clock whose sleep lets other tasks run, like a real sleep."""

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds
        await anyio.sleep(0)


@pytest.mark.parametrize(
    "auth_answer",
    [
        siigo_error(401, "unauthorized", "Invalid credentials"),
        siigo_error(429, "requests_limit", "Try again in 20 seconds"),
    ],
    ids=["bad-credentials", "auth-rate-limited"],
)
async def test_parallel_calls_share_one_failed_auth(settings, auth_answer):
    """Regression (spec A.4): ten parallel tool calls behind a failing /auth each sent their
    own POST /auth (ten failures toward the 80% rule; the last answer after 54 s at 10/min)."""
    fake, clock = FakeSiigo(), YieldingClock()
    fake.on("POST", "/auth", auth_answer)
    fake.on("GET", "/v1/customers", envelope([]))
    server = create_server(
        replace(settings, rate_limit_per_minute=10), fake.transport, sleep=clock.sleep, clock=clock
    )
    results = []
    async with Client(server) as client:

        async def one() -> None:
            results.append(await client.call_tool("siigo_list_customers", {}))

        async with anyio.create_task_group() as tg:
            for _ in range(10):
                tg.start_soon(one)
    assert len(results) == 10 and all(r.is_error for r in results)
    assert fake.paths() == ["/auth"]
    assert clock.now - 1000.0 < 1  # nobody waited for the limiter behind a doomed /auth
    shared = [text_of(r) for r in results if "no se repitió" in text_of(r)]
    assert len(shared) == 9 and all("POST /auth" in t for t in shared)


async def test_blackholed_auth_fails_every_parallel_call_at_once(settings):
    """Regression: with /auth timing out after 15 s, the auth lock serialised one doomed
    connection per waiting call, so the 8th parallel call failed only after 120 s."""
    clock = YieldingClock()
    paths: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path == "/auth":
            await clock.sleep(15)
            raise httpx.ConnectTimeout("timed out", request=request)
        return httpx.Response(200, json=envelope([]))

    server = create_server(settings, httpx.MockTransport(handler), sleep=clock.sleep, clock=clock)
    finished: list[float] = []
    async with Client(server) as client:

        async def one() -> None:
            result = await client.call_tool("siigo_list_customers", {})
            assert result.is_error and "Siigo no respondió a tiempo" in text_of(result)
            finished.append(clock.now - 1000.0)

        async with anyio.create_task_group() as tg:
            for _ in range(8):
                tg.start_soon(one)
    assert paths == ["/auth"] and len(finished) == 8 and max(finished) <= 16


# =========================================================================== write: customer

NEW_CUSTOMER = {
    "person_type": "Company",
    "id_type": "31",
    "identification": "900123456",
    "name": ["ACME SAS"],
    "address": {
        "address": "Calle 1 # 2-3",
        "city": {"country_code": "Co", "state_code": "05", "city_code": "05001"},
    },
    "phones": [{"number": "6044444444"}],
    "contacts": [{"first_name": "Ana", "email": "ana@acme.co"}],
}


async def test_create_customer_returns_existing_without_post(make_server, fake):
    existing = {"id": GUID, "identification": "900123456", "branch_office": 0}
    fake.on("GET", "/v1/customers", envelope([existing]))
    result = await call(
        make_server(enable_write=True), "siigo_create_customer", {"customer": NEW_CUSTOMER}
    )
    out = result.structured_content
    assert out["created"] is False and out["customer"] == existing
    assert [c.method for c in fake.data_calls()] == ["GET"]
    assert fake.data_calls()[0].params == {"identification": "900123456", "branch_office": "0"}


async def test_create_customer_posts_when_missing(make_server, fake):
    other = {"id": GUID2, "identification": "111", "branch_office": 0}
    fake.on("GET", "/v1/customers", envelope([other]))  # filter ignored by Siigo
    fake.on(
        "POST",
        "/v1/customers",
        httpx.Response(201, json={"id": GUID, "identification": "900123456"}),
    )
    result = await call(
        make_server(enable_write=True), "siigo_create_customer", {"customer": NEW_CUSTOMER}
    )
    out = result.structured_content
    assert out["created"] is True and out["customer"]["id"] == GUID
    post = fake.data_calls()[-1]
    assert post.method == "POST" and "idempotency-key" not in post.headers
    assert post.body["name"] == ["ACME SAS"]
    assert post.body["address"]["city"]["city_code"] == "05001"
    assert post.body["fiscal_responsibilities"] == [{"code": "R-99-PN"}]
    assert post.body["type"] == "Customer" and "check_digit" not in post.body


async def test_create_customer_without_check_and_already_exists_hint(make_server, fake):
    fake.on(
        "POST", "/v1/customers", siigo_error(400, "already_exists", "The customer already exists")
    )
    result = await call(
        make_server(enable_write=True),
        "siigo_create_customer",
        {"customer": NEW_CUSTOMER, "check_existing": False},
    )
    assert result.is_error and "siigo_list_customers(identification" in text_of(result)
    assert [c.method for c in fake.data_calls()] == ["POST"]


async def test_create_customer_invalid_payload_no_request(make_server, fake):
    bad = NEW_CUSTOMER | {"person_type": "Person"}  # Person needs 2 names
    result = await call(make_server(enable_write=True), "siigo_create_customer", {"customer": bad})
    assert result.is_error and "elemento" in text_of(result)
    assert fake.calls == []


# =========================================================================== write: invoice


async def test_create_invoice_happy_path(make_server, fake):
    route_catalogs(fake)
    created = {
        "id": GUID,
        "name": "FV-1-11",
        "date": "2099-01-01",
        "total": 1273.03,
        "balance": 1273.03,
        "stamp": {"status": "Draft"},
        "public_url": "https://siigo/x",
        "metadata": {"created": dt.datetime.now(dt.timezone.utc).isoformat()},
    }
    fake.on("POST", "/v1/invoices", httpx.Response(201, json=created))
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "idempotency_key": "Venta1"},
    )
    assert not result.is_error, text_of(result)
    out = result.structured_content
    assert out["replayed"] is False and out["dian_send_requested"] is False
    assert "sent_to_dian" not in out and out["dian_status"] == "Draft"
    assert out["dian_note"].startswith("Borrador: no se envió a la DIAN")
    assert out["summary"]["name"] == "FV-1-11" and out["summary"]["stamp_status"] == "Draft"
    assert out["preflight"]["ok"] is True and "total" in out["preflight"]["checks"]
    assert out["idempotency_key"] == "Venta1"
    post = fake.data_calls()[-1]
    assert post.path == "/v1/invoices" and post.headers["idempotency-key"] == "Venta1"
    assert post.body["stamp"] == {"send": False} and post.body["mail"] == {"send": False}
    assert post.body["date"] == "2099-01-01" and post.body["items"][0]["price"] == 1069.77
    assert "number" not in post.body


async def test_create_invoice_preflight_blocks_without_post(make_server, fake):
    route_catalogs(fake)
    payload = invoice_payload(payments=[{"id": 5636, "value": 1000}], number=7)
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": payload, "idempotency_key": "Pre1"},
    )
    text = text_of(result)
    assert result.is_error and "NO se envió" in text
    assert "omite `number`" in text and "1273.03" in text and "skip_preflight" in text
    assert all(c.method == "GET" for c in fake.data_calls())


async def test_create_invoice_skip_preflight_and_custom_key(make_server, fake):
    fake.on("POST", "/v1/invoices", {"id": GUID})
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {
            "invoice": invoice_payload(stamp={"send": True}),
            "skip_preflight": True,
            "idempotency_key": "Key42",
        },
    )
    out = result.structured_content
    assert out["preflight"] == {"skipped": True} and out["dian_send_requested"] is True
    assert out["idempotency_key"] == "Key42"
    # Siigo's answer shows no stamp at all: nothing says it reached the DIAN.
    assert "sent_to_dian" not in out and "NO consta como enviada" in out["dian_note"]
    assert fake.paths() == ["/auth", "/v1/invoices"]
    assert fake.calls[-1].headers["idempotency-key"] == "Key42"
    assert fake.calls[-1].body["stamp"] == {"send": True}


@pytest.mark.parametrize("skip_preflight", [False, True])
async def test_create_invoice_never_claims_dian_sending_siigo_did_not_report(
    make_server, fake, skip_preflight
):
    """Regression: sent_to_dian=true was copied from the request for a NoElectronic draft."""
    route_catalogs(fake)  # document 24446 is NoElectronic
    fake.on("POST", "/v1/invoices", httpx.Response(201, json={
        "id": GUID, "name": "FV-1-12", "stamp": {"status": "Draft"}}))  # fmt: skip
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {
            "invoice": invoice_payload(stamp={"send": True}),
            "skip_preflight": skip_preflight,
            "idempotency_key": "Dian1",
        },
    )
    out = result.structured_content
    assert "sent_to_dian" not in out and out["dian_send_requested"] is True
    assert out["dian_status"] == "Draft" and "NO consta como enviada" in out["dian_note"]
    assert "sent_to_dian" not in text_of(result)
    if not skip_preflight:
        assert any("no tiene efecto" in w for w in out["preflight"]["warnings"])


async def test_create_invoice_reports_dian_acceptance_from_the_answer(make_server, fake):
    fake.on("POST", "/v1/invoices", httpx.Response(201, json={
        "id": GUID, "stamp": {"status": "Accepted", "cufe": "c" * 96}}))  # fmt: skip
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {
            "invoice": invoice_payload(stamp={"send": True}),
            "skip_preflight": True,
            "idempotency_key": "Dian2",
        },
    )
    out = result.structured_content
    assert out["dian_status"] == "Accepted" and "aceptó" in out["dian_note"]
    assert out["summary"]["cufe"] == "c" * 96


# Two separate sales to "consumidor final", same item, price and payment, same day.
CONSUMIDOR_FINAL = {"identification": "222222222222", "branch_office": 0}


def same_day_sale() -> dict[str, Any]:
    return invoice_payload(customer=CONSUMIDOR_FINAL)


@pytest.mark.parametrize("key", [None, ""])
async def test_create_invoice_requires_an_idempotency_key(make_server, fake, key):
    """The agent owns the key of each sale: without one nothing is sent (no server key)."""
    server = make_server(enable_write=True)
    tool = {t.name: t for t in await server.list_tools()}["siigo_create_invoice"]
    assert "idempotency_key" in tool.input_schema["required"]
    args: dict[str, Any] = {"invoice": invoice_payload(), "skip_preflight": True}
    if key is not None:
        args["idempotency_key"] = key
    result = await call(server, "siigo_create_invoice", args)
    assert result.is_error and "idempotency_key" in text_of(result)
    assert fake.calls == []


async def test_separate_sales_with_their_own_keys_create_separate_invoices(make_server, fake):
    store = InvoiceStore()
    fake.on("POST", "/v1/invoices", store)
    outs = []
    async with Client(make_server(enable_write=True)) as client:
        for key in ("Venta1", "Venta2"):  # identical content, two sales
            args = {"invoice": same_day_sale(), "skip_preflight": True, "idempotency_key": key}
            outs.append((await client.call_tool("siigo_create_invoice", args)).structured_content)
    EXERCISED.add("siigo_create_invoice")
    assert store.keys_sent == ["Venta1", "Venta2"] and len(store.invoices) == 2
    assert [o["replayed"] for o in outs] == [False, False]
    assert "warning" not in outs[0] and "replay_note" in outs[0]


@pytest.mark.parametrize(("later", "replayed"), [(dt.timedelta(seconds=30), False),
                                                 (dt.timedelta(hours=3), True)])  # fmt: skip
async def test_same_key_retried_after_a_timeout_returns_the_same_invoice(
    make_server, fake, later, replayed
):
    """Every answer of the first call is lost after Siigo stored the invoice; the agent
    retries the same sale with the same key and gets that invoice back, not a second one."""
    store = InvoiceStore()
    store.lose_answers = 3  # the first call and its two automatic retries
    fake.on("POST", "/v1/invoices", store)
    args = {"invoice": same_day_sale(), "skip_preflight": True, "idempotency_key": "Venta20261005"}
    lost = await call(make_server(enable_write=True), "siigo_create_invoice", args)
    text = text_of(lost)
    assert lost.is_error and "MISMA idempotency_key='Venta20261005'" in text
    assert "en vez de duplicarla" in text
    store.now += later
    retry = (
        await call(make_server(enable_write=True), "siigo_create_invoice", args)
    ).structured_content
    assert store.keys_sent == ["Venta20261005"] * 4 and len(store.invoices) == 1
    assert retry["summary"]["id"] == store.invoices[0]["id"]
    assert retry["replayed"] is replayed and ("warning" in retry) is replayed


async def test_reused_key_reports_the_replay_instead_of_a_creation(make_server, fake):
    """A key reused hours later (another conversation): Siigo returns the earlier invoice,
    and the result says so before anything that looks like a fresh invoice."""
    store = InvoiceStore()
    fake.on("POST", "/v1/invoices", store)
    args = {"invoice": same_day_sale(), "skip_preflight": True, "idempotency_key": "VentaCF1"}
    first = await call(make_server(enable_write=True), "siigo_create_invoice", args)
    store.now += dt.timedelta(hours=3)
    second = await call(make_server(enable_write=True), "siigo_create_invoice", args)
    assert len(store.invoices) == 1
    assert first.structured_content["replayed"] is False
    out = second.structured_content
    assert out["replayed"] is True
    assert out["summary"]["id"] == first.structured_content["summary"]["id"]
    text = text_of(second)
    assert text.index('"warning"') < text.index('"summary"') < text.index('"invoice"')
    assert "NO creó una factura nueva" in out["warning"] and "'VentaCF1'" in out["warning"]
    assert "idempotency_key nueva" in out["warning"] and "metadata.created" in out["warning"]
    assert out["dian_note"].startswith("Factura que ya existía")


def priced_sale(price: float) -> dict[str, Any]:
    """invoice_payload() with another price (19% IVA) and payments that match its total."""
    total = round(price + round(price * 0.19, 2), 2)
    item = invoice_payload()["items"][0] | {"price": price}
    return invoice_payload(items=[item], payments=[{"id": 5636, "value": total}])


@pytest.mark.parametrize("later", [dt.timedelta(seconds=40), dt.timedelta(minutes=5)])
@pytest.mark.parametrize("price", [1069.77, 2000])
async def test_retry_with_corrected_data_reports_the_old_invoice_it_got_back(
    make_server, fake, later, price
):
    """Regression: the user interrupts a call with a wrong price and the agent, as told,
    retries with the SAME key and the corrected price. Siigo returns the invoice of the
    interrupted call, unchanged: the result said "created" (< 2 min) or advised a new key,
    which left the wrong invoice in Siigo next to the corrected one."""
    route_catalogs(fake)
    store = InvoiceStore()
    store.lose_answers = 3  # the first call and its two automatic retries
    fake.on("POST", "/v1/invoices", store)
    async with Client(make_server(enable_write=True)) as client:
        lost = await client.call_tool(
            "siigo_create_invoice", {"invoice": priced_sale(1069.77), "idempotency_key": "VentaA1"}
        )
        assert lost.is_error and "MISMA idempotency_key='VentaA1'" in text_of(lost)
        store.now += later
        out = (
            await client.call_tool(
                "siigo_create_invoice",
                {"invoice": priced_sale(price), "idempotency_key": "VentaA1"},
            )
        ).structured_content
    EXERCISED.add("siigo_create_invoice")
    assert [i["total"] for i in store.invoices] == [1273.03]
    if price == 1069.77:  # the same data: this sale's own invoice
        assert "differences" not in out and out["replayed"] is (later > dt.timedelta(minutes=2))
        return
    assert out["replayed"] is True and "replay_note" not in out
    assert out["differences"] == [{"field": "total", "requested": 2380.0, "returned": 1273.03}]
    warning = out["warning"]
    assert (
        "NO creó ni modificó" in warning and "FV-1-1" in warning and "sigue existiendo" in warning
    )
    assert "total: pedido 2380.0, devuelto 1273.03" in warning
    assert "siigo_delete_invoice" in warning and "Draft" in warning
    assert "anúlala" in warning and "idempotency_key nueva" in warning
    assert "otra venta: crea esta" not in warning  # a corrected retry is not "another sale"
    assert out["dian_note"].startswith("Factura que ya existía")


async def test_returned_invoice_with_other_customer_items_or_date_is_flagged(make_server, fake):
    """Without the preflight total, the customer, document, date and items still count."""
    fresh = dt.datetime.now(dt.timezone.utc).isoformat()
    other = {"id": GUID, "name": "FV-1-3", "document": {"id": 24447}, "date": "2099-01-02",
             "customer": {"identification": "900123456", "branch_office": 1},
             "items": [{"code": "Item-2", "quantity": 3}],
             "metadata": {"created": fresh}}  # fmt: skip
    fake.on("POST", "/v1/invoices", httpx.Response(201, json=other))
    args = {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "Otra1"}
    out = (
        await call(make_server(enable_write=True), "siigo_create_invoice", args)
    ).structured_content
    assert out["replayed"] is True
    assert {d["field"]: (d["requested"], d["returned"]) for d in out["differences"]} == {
        "customer.identification": ("13832081", "900123456"),
        "customer.branch_office": (0, 1),
        "document.id": (24446, 24447),
        "date": ("2099-01-01", "2099-01-02"),
        "items": ("Item-1 x 1", "Item-2 x 3"),
    }


async def test_same_data_in_another_format_is_not_a_difference(make_server, fake):
    """No false alarm: Siigo may echo numbers as text, codes in another case, a time."""
    route_catalogs(fake)
    fresh = dt.datetime.now(dt.timezone.utc).isoformat()
    echo = {"id": GUID, "name": "FV-1-4", "document": {"id": "24446"},
            "date": "2099-01-01T00:00:00",
            "customer": {"id": GUID2, "identification": 13832081, "branch_office": "0"},
            "items": [{"code": "ITEM-1", "quantity": "1.00"}], "total": 1273.0,
            "metadata": {"created": fresh}}  # fmt: skip
    fake.on("POST", "/v1/invoices", httpx.Response(201, json=echo))
    args = {"invoice": invoice_payload(), "idempotency_key": "Mismo1"}
    out = (
        await call(make_server(enable_write=True), "siigo_create_invoice", args)
    ).structured_content
    assert out["replayed"] is False and "differences" not in out and "warning" not in out


@pytest.mark.parametrize(("later", "replayed"), [(dt.timedelta(seconds=30), False),
                                                 (dt.timedelta(minutes=5), True)])  # fmt: skip
async def test_dian_note_of_a_draft_returned_for_a_send_request(make_server, fake, later, replayed):
    """Regression: stamp.send=true on a retry of a draft got the old draft back, and the note
    blamed the document type; a replay sends nothing to the DIAN."""
    store = InvoiceStore()
    store.lose_answers = 3
    fake.on("POST", "/v1/invoices", store)
    base = {"skip_preflight": True, "idempotency_key": "VentaB1"}
    async with Client(make_server(enable_write=True)) as client:
        await client.call_tool("siigo_create_invoice", base | {"invoice": invoice_payload()})
        store.now += later
        args = base | {"invoice": invoice_payload(stamp={"send": True})}
        out = (await client.call_tool("siigo_create_invoice", args)).structured_content
    assert out["replayed"] is replayed and "NO consta como enviada" in out["dian_note"]
    if replayed:
        assert "esta llamada no envió nada" in out["dian_note"]
        assert "no es electrónico" not in out["dian_note"]
    else:
        assert "creada antes con esta clave" in out["dian_note"]


async def test_key_reused_in_the_same_session_is_a_replay_even_without_timestamps(
    make_server, fake
):
    fake.on("POST", "/v1/invoices", httpx.Response(201, json={"id": GUID, "name": "FV-1-9"}))
    args = {"invoice": same_day_sale(), "skip_preflight": True, "idempotency_key": "Clave9"}
    async with Client(make_server(enable_write=True)) as client:
        first = (await client.call_tool("siigo_create_invoice", args)).structured_content
        again = (await client.call_tool("siigo_create_invoice", args)).structured_content
    assert first["replayed"] is None and "No se pudo determinar" in first["replay_note"]
    assert again["replayed"] is True and "ya había recibido" in again["warning"]


@pytest.mark.parametrize(
    "metadata",
    [None, "x", {"created": None}, {"created": "ayer"}, {"created": "2026-10-05T12:00:00+24:00"},
     {"created": "2026-10-05T12:00:00+23:99"}, {"created": "9999-12-31T23:59:59-05:00"}],
)  # fmt: skip
async def test_unreadable_creation_time_gives_replayed_null_never_an_error(
    make_server, fake, metadata
):
    """Regression: an out-of-range offset in metadata.created raised inside the tool, so an
    invoice Siigo had just created was reported as an unexpected error without the key."""
    answer: dict[str, Any] = {"id": GUID, "name": "FV-1-5", "stamp": {"status": "Draft"}}
    if metadata is not None:
        answer["metadata"] = metadata
    fake.on("POST", "/v1/invoices", httpx.Response(201, json=answer))
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "K1"},
    )
    assert not result.is_error, text_of(result)
    out = result.structured_content
    assert out["replayed"] is None and "warning" not in out
    assert "una sola factura" in out["replay_note"] and out["summary"]["name"] == "FV-1-5"


@pytest.mark.parametrize("local_clock_error_hours", [-5, 0, 5])
async def test_fresh_invoice_is_not_a_replay_whatever_the_local_clock(
    make_server, fake, local_clock_error_hours
):
    """Replay detection uses Siigo's Date header, so a wrong clock on the user's computer
    never makes a brand-new invoice look like an old one (or the opposite)."""
    store = InvoiceStore()
    store.now += dt.timedelta(hours=local_clock_error_hours)
    fake.on("POST", "/v1/invoices", store)
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": same_day_sale(), "skip_preflight": True, "idempotency_key": "Nueva1"},
    )
    out = result.structured_content
    assert out["replayed"] is False and len(store.invoices) == 1


async def test_create_invoice_retry_after_client_timeout_sends_the_same_key(
    make_server, fake, caplog
):
    """The client gave up (timeout/Esc) after the POST reached Siigo; re-running the call with
    the same key sends that key again, so Siigo can return the invoice instead of a second."""
    from mcp import MCPError

    async def slow_then_created(request: httpx.Request) -> httpx.Response:
        if len([c for c in fake.calls if c.path == "/v1/invoices"]) == 1:
            await anyio.sleep(5)  # Siigo still working when the client gives up
        return httpx.Response(201, json={"id": GUID, "stamp": {"status": "Draft"}})

    fake.on("POST", "/v1/invoices", slow_then_created)
    args = {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "Esc1"}
    caplog.set_level(logging.INFO, logger="siigo_mcp")
    async with Client(make_server(enable_write=True)) as client:
        with pytest.raises(MCPError, match="(?i)timed out"):
            await client.call_tool("siigo_create_invoice", args, read_timeout_seconds=0.5)
        retry = await client.call_tool("siigo_create_invoice", args)
    EXERCISED.add("siigo_create_invoice")
    keys = [c.headers["idempotency-key"] for c in fake.calls if c.path == "/v1/invoices"]
    assert keys == ["Esc1", "Esc1"] and retry.structured_content["idempotency_key"] == "Esc1"
    assert "Idempotency-Key=Esc1" in caplog.text  # logged before the POST went out


async def test_create_invoice_description_explains_the_required_key(make_server):
    tool = {t.name: t for t in await make_server(enable_write=True).list_tools()}[
        "siigo_create_invoice"
    ]
    text = " ".join((tool.description + json.dumps(tool.input_schema, ensure_ascii=False)).split())
    for fragment in (
        "Obligatoria",
        "NUEVA y única por cada venta",
        "REUTILIZA LA MISMA",
        "falta de respuesta",
        "Nunca uses la clave de otra venta",
        "replayed=true",
        "replayed=null",
        "menos de 2 minutos",
    ):
        assert fragment in text, fragment
    for gone in ("aleatoria", "Si la omites", "2 horas", "idempotency_key_source"):
        assert gone not in text, gone
    instructions = " ".join(srv.INSTRUCTIONS.split())
    assert "exige idempotency_key" in instructions and "REUTILIZA LA MISMA" in instructions
    assert "replayed=true" in instructions and "interrupción" in instructions


async def test_create_invoice_description_qualifies_the_total_check(make_server):
    """Regression: the description promised that payments are always checked against the
    total before sending; with retentions, taxed_price, etc. the invoice goes to Siigo."""
    tool = {t.name: t for t in await make_server(enable_write=True).list_tools()}[
        "siigo_create_invoice"
    ]
    text = " ".join(tool.description.split())
    assert "y que los pagos sumen el total) antes de enviar" not in text
    assert "solo en facturas simples" in text and "esa suma la valida Siigo" in text
    assert "sin retenciones, anticipo ni moneda extranjera" in text


async def test_create_invoice_retries_keep_same_key(make_server, fake):
    fake.on("POST", "/v1/invoices", httpx.Response(503, text="busy"), {"id": GUID})
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "Same1"},
    )
    assert not result.is_error
    keys = [c.headers["idempotency-key"] for c in fake.data_calls()]
    assert keys == ["Same1", "Same1"]


async def test_create_invoice_network_error_mentions_key(make_server, fake):
    def down(request):
        raise httpx.ReadTimeout("slow", request=request)

    fake.on("POST", "/v1/invoices", down)
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "Retry1"},
    )
    text = text_of(result)
    assert result.is_error and "MISMA idempotency_key='Retry1'" in text
    assert "devolverá esa factura en vez de duplicarla" in text
    assert "siigo_list_* o siigo_get_*" not in text  # the generic advice is replaced
    assert len(fake.data_calls()) == 3  # keyed POST: retried on transport errors


async def test_create_invoice_siigo_validation_error(make_server, fake):
    fake.on(
        "POST",
        "/v1/invoices",
        siigo_error(400, "invalid_total_payments", "Payments must equal total"),
    )
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "Bad1"},
    )
    text = text_of(result)
    assert "invalid_total_payments" in text and "payments[].value" in text
    assert "idempotency_key=" not in text
    assert len(fake.data_calls()) == 1


async def test_create_invoice_5xx_error_mentions_key(make_server, fake):
    fake.on("POST", "/v1/invoices", siigo_error(500, "unhandled_error", "boom"))
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "K5"},
    )
    assert "idempotency_key='K5'" in text_of(result) and len(fake.data_calls()) == 1


def _read_timeout(request: httpx.Request) -> httpx.Response:
    raise httpx.ReadTimeout("slow", request=request)


@pytest.mark.parametrize(
    ("responses", "fragment", "maybe_created"),
    [
        ([siigo_error(408, "request_timeout", "The request timed out")], "request_timeout", True),
        ([httpx.Response(201, text="<html>created</html>")], "probablemente", True),
        ([_read_timeout, siigo_error(409, "duplicated_document", "d")], "duplicated", True),
        ([siigo_error(504, "gateway", "Gateway timeout")], "504", True),
        ([siigo_error(429, "requests_limit", "Try again in 90 seconds")], "requests_limit", False),
    ],
)
async def test_create_invoice_uncertain_outcome_always_gives_the_key(
    make_server, fake, responses, fragment, maybe_created
):
    """Whenever the invoice may already exist, the error gives the key and says to retry with
    the SAME key (Siigo returns the existing invoice); a 429 created nothing."""
    fake.on("POST", "/v1/invoices", *responses)
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "K9"},
    )
    text = text_of(result)
    assert result.is_error and fragment in text
    assert "idempotency_key='K9'" in text
    assert ("MISMA idempotency_key='K9'" in text) is maybe_created
    assert ("en vez de duplicarla" in text) is maybe_created
    assert ("La factura no se creó" in text) is not maybe_created


@pytest.mark.parametrize(
    ("invoice_responses", "auth_responses"),
    [
        # timeout (may have created it) -> 401 -> the renewal of the token fails
        ([_read_timeout, siigo_error(401, "unauthorized", "expired")],
         [{"access_token": "t1", "expires_in": 86400},
          siigo_error(503, "service_unavailable", "auth down")]),
        ([siigo_error(503, "service_unavailable", "busy"), siigo_error(401, "unauthorized", "x")],
         [{"access_token": "t1", "expires_in": 86400},
          siigo_error(500, "unhandled_error", "boom")]),
    ],
)  # fmt: skip
async def test_create_invoice_auth_failure_after_uncertain_attempt_keeps_the_key(
    make_server, fake, invoice_responses, auth_responses
):
    """Regression: an /auth error during the retry dropped the key and the warning."""
    fake.on("POST", "/v1/invoices", *invoice_responses)
    fake.on("POST", "/auth", *auth_responses)
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "Auth1"},
    )
    text = text_of(result)
    assert result.is_error and "POST /auth" in text
    assert "MISMA idempotency_key='Auth1'" in text and "pudo haberse creado" in text


@pytest.mark.parametrize("skip_preflight", [False, True])
async def test_create_invoice_auth_2xx_without_token_is_not_a_created_invoice(
    make_server, fake, skip_preflight
):
    """Regression: a 200 from POST /auth without access_token (a proxy's HTML page) was read
    as Siigo's 2xx to the invoice: "la factura probablemente SÍ se creó"."""
    route_catalogs(fake)
    proxy_page = httpx.Response(200, text="<html>Proxy login</html>")
    if skip_preflight:  # no token yet: the invoice is never sent
        fake.on("POST", "/auth", proxy_page)
    else:  # catalogs read with a valid token; then the invoice gets a 401 and renewal fails
        fake.on("POST", "/auth", {"access_token": "t1", "expires_in": 86400}, proxy_page)
        fake.on("POST", "/v1/invoices", siigo_error(401, "unauthorized", "expired"))
    args = {"invoice": invoice_payload(), "idempotency_key": "SaleA1", "check_customer": False}
    result = await call(make_server(enable_write=True), "siigo_create_invoice",
                        args | {"skip_preflight": skip_preflight})  # fmt: skip
    text = text_of(result)
    assert result.is_error and "POST /auth" in text and "SIIGO_BASE_URL" in text
    assert "probablemente" not in text and "pudo haberse creado" not in text
    assert "La factura no se creó" in text and "idempotency_key='SaleA1'" in text
    invoice_posts = [c for c in fake.calls if c.path == "/v1/invoices"]
    assert len(invoice_posts) == (0 if skip_preflight else 1)


@pytest.mark.parametrize(
    "content",
    [b'{"\\ud800": 1, "id": "\\udc00", "name": "FV-1-1 \\ud83d"}',
     b'{"id": "x", "name": "FV-1-1 \xed\xa0\xbd"}'],  # CESU-8 bytes of a lone surrogate
)  # fmt: skip
async def test_answer_with_a_lone_surrogate_is_shown_not_a_crash(make_server, fake, content):
    """Regression: a 2xx body with half an emoji could not be serialised: the invoice was
    created but every retry with its key failed with "Error inesperado", without the key."""
    fake.on("POST", "/v1/invoices", httpx.Response(201, content=content))
    fake.on("GET", f"/v1/invoices/{GUID}", httpx.Response(200, content=content))
    server = make_server(enable_write=True)
    args = {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "K1"}
    created = await call(server, "siigo_create_invoice", args)
    assert not created.is_error, text_of(created)
    assert created.structured_content["summary"]["name"] == "FV-1-1 \ufffd"
    shown = await call(server, "siigo_get_invoice", {"invoice_id": GUID})
    assert not shown.is_error and "\ufffd" in text_of(shown)


class _BadGzip(httpx.AsyncByteStream):
    async def __aiter__(self):
        yield b"this is not gzip"

    async def aclose(self) -> None:
        pass


def _undecodable(status: int):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status,
            headers={"Content-Encoding": "gzip", "Content-Type": "application/json"},
            stream=_BadGzip(),
        )

    return handler


async def test_create_invoice_undecodable_201_says_it_was_probably_created(make_server, fake):
    """Regression: httpx.DecodingError skipped the write-outcome logic ("Intenta de nuevo")."""
    fake.on("POST", "/v1/invoices", _undecodable(201))
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "K7"},
    )
    text = text_of(result)
    assert result.is_error and "probablemente SÍ se creó" in text
    assert "idempotency_key='K7'" in text and "Intenta de nuevo" not in text
    assert len(fake.data_calls()) == 1


async def test_undecodable_answer_to_other_writes_says_probably_done(make_server, fake):
    fake.on("POST", f"/v1/invoices/{GUID}/annul", _undecodable(200))
    result = await call(make_server(enable_write=True), "siigo_annul_invoice", {"invoice_id": GUID})
    text = text_of(result)
    assert result.is_error and "probablemente SÍ se ejecutó" in text
    assert "DecodingError" not in text and len(fake.data_calls()) == 1


async def test_create_invoice_non_json_201_says_it_was_probably_created(make_server, fake):
    fake.on("POST", "/v1/invoices", httpx.Response(201, text="<html>created</html>"))
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "K8"},
    )
    text = text_of(result)
    assert "probablemente SÍ se creó" in text and "rechazó" not in text
    assert len(fake.data_calls()) == 1


@pytest.mark.parametrize(
    "args",
    [
        {"invoice": invoice_payload(items=[]), "idempotency_key": "K1"},
        {"invoice": invoice_payload() | {"extra_field": 1}, "idempotency_key": "K1"},
        {"invoice": invoice_payload()},  # no idempotency_key
        {"invoice": invoice_payload(), "idempotency_key": "has-hyphen"},
        {"invoice": invoice_payload(), "idempotency_key": "x" * 31},
    ],
)
async def test_create_invoice_input_validation(make_server, fake, args):
    result = await call(make_server(enable_write=True), "siigo_create_invoice", args)
    assert result.is_error and fake.calls == []


# =========================================================================== write: other


@pytest.mark.parametrize(
    ("field", "value"),
    [("quantity", "Infinity"), ("price", "inf"), ("discount", "inf"), ("taxed_price", "Infinity")],
)
async def test_create_invoice_rejects_infinite_amounts_before_sending(
    make_server, fake, field, value
):
    """Regression: "inf" passed the models and failed later as "Error inesperado ... de
    Siigo" (and the audit log claimed a POST that was never sent)."""
    item = invoice_payload()["items"][0] | {field: value}
    if field == "taxed_price":
        del item["price"]
    args = {"invoice": invoice_payload(items=[item]), "idempotency_key": "Inf1"}
    result = await call(make_server(enable_write=True), "siigo_create_invoice", args)
    text = text_of(result)
    assert result.is_error and "finite" in text and "inesperado" not in text
    assert fake.calls == []


async def test_send_invoice_email(make_server, fake):
    fake.on("POST", f"/v1/invoices/{GUID}/mail", {"status": "sent", "observations": ""})
    result = await call(
        make_server(enable_write=True),
        "siigo_send_invoice_email",
        {"invoice_id": GUID, "mail_to": "a@x.co", "copy_to": ["b@x.co", "c@x.co"]},
    )
    out = result.structured_content
    assert out["status"] == "sent" and out["invoice_id"] == GUID
    call_ = fake.data_calls()[0]
    assert call_.body == {"mail_to": "a@x.co", "copy_to": "b@x.co;c@x.co"}
    assert "idempotency-key" not in call_.headers
    bad = await call(
        make_server(enable_write=True),
        "siigo_send_invoice_email",
        {"invoice_id": GUID, "mail_to": "a@x.co", "copy_to": [f"{i}@x.co" for i in range(5)]},
    )
    assert bad.is_error
    bad = await call(
        make_server(enable_write=True),
        "siigo_send_invoice_email",
        {"invoice_id": GUID, "mail_to": "a@x.co;b@x.co"},
    )
    assert bad.is_error
    only_to = await call(
        make_server(enable_write=True),
        "siigo_send_invoice_email",
        {"invoice_id": GUID, "mail_to": "a@x.co"},
    )
    assert not only_to.is_error and fake.data_calls()[-1].body == {"mail_to": "a@x.co"}


@pytest.mark.parametrize("response", [{"id": GUID, "Annul": True}, {"id": GUID, "deleted": True}])
async def test_annul_invoice_accepts_both_shapes(make_server, fake, response):
    fake.on("POST", f"/v1/invoices/{GUID}/annul", response)
    out = (
        await call(make_server(enable_write=True), "siigo_annul_invoice", {"invoice_id": GUID})
    ).structured_content
    assert out == {"invoice_id": GUID, **response}
    call_ = fake.data_calls()[0]
    assert call_.body is None and "idempotency-key" not in call_.headers


async def test_delete_invoice(make_server, fake):
    fake.on("DELETE", f"/v1/invoices/{GUID}", {"id": GUID, "deleted": True})
    out = (
        await call(make_server(enable_write=True), "siigo_delete_invoice", {"invoice_id": GUID})
    ).structured_content
    assert out["deleted"] is True
    fake.on("DELETE", f"/v1/invoices/{GUID}", httpx.Response(204))
    out = (
        await call(make_server(enable_write=True), "siigo_delete_invoice", {"invoice_id": GUID})
    ).structured_content
    assert out == {"invoice_id": GUID, "response": {}}


async def test_delete_not_allowed_hint_and_no_retry(make_server, fake):
    fake.on("DELETE", f"/v1/invoices/{GUID}", siigo_error(400, "delete_not_allowed", "nope"))
    result = await call(
        make_server(enable_write=True), "siigo_delete_invoice", {"invoice_id": GUID}
    )
    assert result.is_error and "nota crédito" in text_of(result)
    assert len(fake.data_calls()) == 1


# =========================================================================== logging & entry point


@pytest.fixture
def restore_logging():
    root = logging.getLogger()
    saved = (root.handlers[:], root.level, logging.getLogger("httpx").level)
    yield
    root.handlers[:] = saved[0]
    root.setLevel(saved[1])
    logging.getLogger("httpx").setLevel(saved[2])


def test_redacting_formatter_masks_secrets_in_tracebacks():
    register_secret("TopSecretValue1")
    formatter = RedactingFormatter(LOG_FORMAT)
    try:
        raise RuntimeError("leak TopSecretValue1")
    except RuntimeError:
        record = logging.LogRecord(
            "siigo_mcp", logging.ERROR, __file__, 1, "msg %s", ("TopSecretValue1",), sys.exc_info()
        )
    out = formatter.format(record)
    assert "TopSecretValue1" not in out and "***" in out and "RuntimeError" in out


def test_configure_logging_uses_stderr(restore_logging):
    configure_logging(Settings(access_key="AnotherSecret9", log_level="WARNING"))
    handler = logging.getLogger().handlers[0]
    assert isinstance(handler, logging.StreamHandler) and handler.stream is sys.stderr
    assert isinstance(handler.formatter, RedactingFormatter)
    assert logging.getLogger("httpx").level == logging.WARNING
    assert redact_secrets("x AnotherSecret9 y") == "x *** y"


@pytest.mark.parametrize("level", ["WARNING", "ERROR", "CRITICAL"])
async def test_invoice_key_is_logged_whatever_the_log_level(
    make_server, fake, restore_logging, capsys, level
):
    """Regression: the pre-send Idempotency-Key line was logged at INFO, so the documented
    SIIGO_LOG_LEVEL=WARNING/ERROR/CRITICAL dropped the line the README sends users to."""
    configure_logging(Settings(access_key="LogLevelSecret1", log_level=level))
    fake.on("POST", "/v1/invoices", {"id": GUID})
    result = await call(
        make_server(enable_write=True),
        "siigo_create_invoice",
        {"invoice": invoice_payload(), "skip_preflight": True, "idempotency_key": "LogKey1"},
    )
    assert not result.is_error
    err = capsys.readouterr().err
    assert "Idempotency-Key=LogKey1" in err
    assert "Token de Siigo obtenido" not in err  # every other INFO line still follows the level


def test_main_runs_stdio_server(monkeypatch, restore_logging, capsys):
    calls: list[str] = []
    monkeypatch.setattr(srv.mcp, "run", lambda: calls.append("run"))
    monkeypatch.delenv("SIIGO_USERNAME", raising=False)
    srv.main()
    assert calls == ["run"]
    captured = capsys.readouterr()
    assert captured.out == ""  # nothing may be printed to stdout
    assert "SIIGO_USERNAME" in captured.err and "iniciando" in captured.err


# =========================================================================== coverage guard


def test_every_tool_was_exercised():
    """Runs last in this module: every registered tool was called at least once above."""
    if len(EXERCISED) < 10:
        pytest.skip("only meaningful when the whole module runs")
    assert EXERCISED >= READ_TOOLS | WRITE_TOOL_NAMES, sorted(
        (READ_TOOLS | WRITE_TOOL_NAMES) - EXERCISED
    )
