"""Invoice preflight (spec D.2) and the catalog cache."""

from __future__ import annotations

import datetime as dt

import httpx
import pytest
from conftest import (
    CUSTOMER,
    DOC_FV,
    DOCUMENT_TYPES,
    PAYMENT_TYPES,
    TAXES,
    FakeClock,
    FakeSiigo,
    invoice_payload,
    route_catalogs,
)

from siigo_mcp.client import Settings, SiigoClient
from siigo_mcp.models import InvoiceCreate
from siigo_mcp.preflight import CatalogCache, evaluate_invoice, preflight_invoice

pytestmark = pytest.mark.anyio

TODAY = dt.date(2026, 10, 4)


def check(**overrides):
    inv = InvoiceCreate.model_validate(invoice_payload(**overrides))
    return evaluate_invoice(
        inv,
        document_types=DOCUMENT_TYPES,
        payment_types=PAYMENT_TYPES,
        taxes=TAXES,
        today=TODAY,
    )


def item(**overrides):
    data = {"code": "A1", "quantity": 1, "price": 100, "taxes": []}
    data.update(overrides)
    return data


def test_simple_invoice_passes_and_reports_totals():
    report = check()
    assert report.ok, report.problems
    assert {"document_type", "number", "payments", "taxes", "total"} <= set(report.checks)
    assert report.totals == {
        "payments": 1273.03,
        "total_round_half_up": 1273.03,
        "total_round_half_even": 1273.03,
    }
    assert report.as_dict()["ok"] is True and "problems" not in report.as_dict()


def test_total_mismatch_blocks_and_shows_both_roundings():
    report = check(payments=[{"id": 5636, "value": 1273.04}])
    assert not report.ok
    text = report.problems[0]
    assert "1273.04" in text and "1273.03" in text and "HALF_UP" in text and "HALF_EVEN" in text
    assert report.as_dict()["problems"] == report.problems


def test_rounding_mode_ambiguity_accepts_either():
    # 0.50 * 5% = 0.025 -> 0.03 (HALF_UP) or 0.02 (HALF_EVEN)
    items = [item(price=0.5, taxes=[{"id": 13157}])]
    assert check(items=items, payments=[{"id": 5636, "value": 0.53}]).ok
    assert check(items=items, payments=[{"id": 5636, "value": 0.52}]).ok
    bad = check(items=items, payments=[{"id": 5636, "value": 0.54}])
    assert "0.53" in bad.problems[0] and "0.52" in bad.problems[0]


def test_discounts_percentage_and_value():
    # DOC_FV discount_type=Percentage: 2 x 100 with 10% -> base 180 + IVA 19% 34.20 = 214.20
    pct = [item(quantity=2, discount=10, taxes=[{"id": 13156}])]
    assert check(items=pct, payments=[{"id": 5636, "value": 214.2}]).ok
    # DOC_ELECTRONIC discount_type=Value: 2 x 100 - 10 = 190 + 36.10 = 226.10
    val = [item(quantity=2, discount=10, taxes=[{"id": 13156}])]
    assert check(document={"id": 30000}, items=val, payments=[{"id": 5636, "value": 226.1}]).ok
    # Impoconsumo is part of the simple case too
    impo = [item(taxes=[{"id": 13162}])]
    assert check(items=impo, payments=[{"id": 5636, "value": 108}]).ok


@pytest.mark.parametrize(
    "overrides",
    [
        {"items": [{"code": "A", "quantity": 1, "taxed_price": 119}]},
        {"retentions": [{"id": 13158}]},
        {"advance_payment": 10},
        {"currency": {"code": "USD", "exchange_rate": 4000}},
        {"items": [item(taxes=[{"id": 13160}])]},
    ],
)
def test_total_check_skipped_outside_simple_case(overrides):
    report = check(payments=[{"id": 5636, "value": 1}], **overrides)
    assert "total" not in report.checks
    assert any("No se verificó" in w for w in report.warnings)
    assert report.ok, report.problems


@pytest.mark.parametrize(
    ("overrides", "fragment"),
    [
        ({"document": {"id": 999}}, "siigo_list_document_types"),
        ({"document": {"id": 30002}}, "inactivo"),
        ({"number": 55}, "omite `number`"),
        (
            {"document": {"id": 30001}, "cost_center": 1, "items": [item(seller=1)]},
            "envía `number`",
        ),
        ({"document": {"id": 30001}, "number": 5, "items": [item(seller=1)]}, "cost_center"),
        ({"document": {"id": 30001}, "number": 5, "cost_center": 1}, "seller_by_item"),
        ({"document": {"id": 30000}, "date": "2026-10-03"}, "anterior a hoy"),
        ({"payments": [{"id": 1, "value": 1273.03}]}, "siigo_list_payment_types"),
        ({"payments": [{"id": 5638, "value": 1273.03}]}, "inactiva"),
        ({"payments": [{"id": 5637, "value": 1273.03}]}, "due_date"),
        (
            {
                "payments": [
                    {"id": 5637, "value": 1000, "due_date": "2099-02-01"},
                    {"id": 5636, "value": 273.03},
                ]
            },
            "UN pago",
        ),
        ({"items": [item(taxes=[{"id": 1}])]}, "no existe"),
        ({"items": [item(taxes=[{"id": 13161}])]}, "inactivo"),
        ({"items": [item(taxes=[{"id": 13158}])]}, "retentions"),
        ({"items": [item(taxes=[{"id": 13163}])]}, "retentions"),
        ({"items": [item(taxes=[{"id": 13156}, {"id": 13157}])]}, "mismo tipo"),
        ({"items": [item(taxes=[{"id": 13156}, {"id": 13159}])]}, "AdValorem"),
        ({"retentions": [{"id": 4}]}, "retentions: el impuesto 4 no existe"),
        ({"retentions": [{"id": 13161}]}, "retentions: el impuesto 13161 está inactivo"),
    ],
)
def test_blocking_checks(overrides, fragment):
    report = check(**overrides)
    assert not report.ok
    assert any(fragment in p for p in report.problems), report.problems


def test_past_date_allowed_for_non_electronic_and_strict_doc_ok():
    assert check(date="2020-01-01").ok
    report = check(
        document={"id": 30001},
        number=5,
        cost_center=235,
        items=[item(seller=7, taxes=[{"id": 13156}])],
        payments=[{"id": 5637, "value": 119, "due_date": "2099-02-01"}],
    )
    assert report.ok, report.problems


def test_stamp_send_on_non_electronic_warns():
    report = check(stamp={"send": True})
    assert report.ok and any("stamp.send" in w for w in report.warnings)


@pytest.mark.parametrize("electronic_type", [None, "", "   ", "<missing>"])
def test_past_date_blocked_when_electronic_type_is_unknown(electronic_type):
    """Check 5 fails closed: it is skipped only for an explicit NoElectronic type."""
    doc = {k: v for k, v in DOC_FV.items() if k != "electronic_type"} | {"id": 31000}
    if electronic_type != "<missing>":
        doc["electronic_type"] = electronic_type
    inv = InvoiceCreate.model_validate(
        invoice_payload(document={"id": 31000}, date="2026-09-01", stamp={"send": True})
    )
    report = evaluate_invoice(
        inv, document_types=[doc], payment_types=PAYMENT_TYPES, taxes=TAXES, today=TODAY
    )
    assert any("anterior a hoy" in p for p in report.problems), report.problems
    assert any("electronic_type" in w for w in report.warnings), report.warnings
    assert not any("no tiene efecto" in w for w in report.warnings)
    today = InvoiceCreate.model_validate(
        invoice_payload(document={"id": 31000}, date=TODAY.isoformat())
    )
    assert evaluate_invoice(
        today, document_types=[doc], payment_types=PAYMENT_TYPES, taxes=TAXES, today=TODAY
    ).ok


def test_unknown_document_type_reports_everything_else():
    report = check(document={"id": 1}, payments=[{"id": 1, "value": 1}])
    assert len(report.problems) == 2
    assert any("tipo de comprobante desconocido" in w for w in report.warnings)


# --------------------------------------------------------------------------- async + cache


def make_cache(fake: FakeSiigo, clock: FakeClock, settings: Settings) -> CatalogCache:
    http = httpx.AsyncClient(base_url=settings.base_url, transport=fake.transport)
    client = SiigoClient(settings, http, sleep=clock.sleep, clock=clock)
    return CatalogCache(client, clock=clock)


async def test_preflight_fetches_catalogs_once_and_checks_customer(fake, clock, settings):
    route_catalogs(fake)
    cache = make_cache(fake, clock, settings)
    inv = InvoiceCreate.model_validate(invoice_payload())
    report = await preflight_invoice(inv, catalogs=cache)
    assert report.ok and "customer" in report.checks
    first = fake.paths()
    assert first == [
        "/auth",
        "/v1/document-types",
        "/v1/payment-types",
        "/v1/taxes",
        "/v1/customers",
    ]
    assert fake.calls[1].params == {"type": "FV"}
    assert fake.calls[2].params == {"document_type": "FV"}
    assert fake.calls[4].params == {"identification": "13832081", "branch_office": "0"}
    await preflight_invoice(inv, catalogs=cache, check_customer=False)
    assert fake.paths() == first  # all catalogs served from the cache


async def test_preflight_skips_taxes_when_unused(fake, clock, settings):
    route_catalogs(fake)
    cache = make_cache(fake, clock, settings)
    inv = InvoiceCreate.model_validate(
        invoice_payload(items=[item()], payments=[{"id": 5636, "value": 100}])
    )
    report = await preflight_invoice(inv, catalogs=cache, check_customer=False)
    assert report.ok and "/v1/taxes" not in fake.paths()


@pytest.mark.parametrize(
    ("customers", "kind", "fragment"),
    [
        ([], "problems", "siigo_create_customer"),
        ([CUSTOMER | {"identification": "999"}], "problems", "No existe"),
        ([CUSTOMER | {"active": False}], "problems", "inactivo"),
        ([CUSTOMER | {"contacts": []}], "warnings", "contactos"),
    ],
)
async def test_preflight_customer_check(fake, clock, settings, customers, kind, fragment):
    route_catalogs(fake, customers=customers)
    cache = make_cache(fake, clock, settings)
    report = await preflight_invoice(
        InvoiceCreate.model_validate(invoice_payload()), catalogs=cache
    )
    assert any(fragment in text for text in getattr(report, kind))


async def test_catalog_cache_ttl_and_refresh(fake, clock, settings):
    fake.on("GET", "/v1/taxes", TAXES)
    cache = make_cache(fake, clock, settings)
    data, cached = await cache.get("/v1/taxes")
    assert data == TAXES and cached is False
    _, cached = await cache.get("/v1/taxes")
    assert cached is True
    clock.now += 599
    assert (await cache.get("/v1/taxes"))[1] is True
    clock.now += 2  # past the 600 s TTL
    assert (await cache.get("/v1/taxes"))[1] is False
    assert (await cache.get("/v1/taxes", refresh=True))[1] is False
    assert fake.paths().count("/v1/taxes") == 3
    # Different params are different cache entries.
    fake.on("GET", "/v1/payment-types", PAYMENT_TYPES)
    await cache.get("/v1/payment-types", {"document_type": "FV"})
    assert (await cache.get("/v1/payment-types", {"document_type": "NC"}))[1] is False
    cache.clear()
    assert (await cache.get("/v1/taxes"))[1] is False
