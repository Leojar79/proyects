"""Payload models (spec D.1-D.3)."""

from __future__ import annotations

import datetime as dt

import pytest
from pydantic import ValidationError

from siigo_mcp.models import CustomerCreate, InvoiceCreate, to_body, today_bogota


def person(**overrides):
    data = {
        "person_type": "Person",
        "id_type": "13",
        "identification": "13832081",
        "name": ["Marcos", "Castillo"],
        "address": {
            "address": "Cra. 18 #79A - 42",
            "city": {"country_code": "Co", "state_code": "11", "city_code": "11001"},
        },
        "phones": [{"indicative": "57", "number": "3006003345"}],
        "contacts": [{"first_name": "Marcos", "last_name": "Castillo", "email": "m@x.com"}],
    }
    data.update(overrides)
    return data


def invoice(**overrides):
    data = {
        "document": {"id": 24446},
        "date": "2026-10-04",
        "customer": {"identification": "13832081"},
        "seller": 629,
        "items": [{"code": "Item-1", "quantity": 1, "price": 1069.77, "taxes": [{"id": 13156}]}],
        "payments": [{"id": 5636, "value": 1273.03, "due_date": "2026-11-04"}],
    }
    data.update(overrides)
    return data


def test_customer_person_body():
    body = to_body(CustomerCreate.model_validate(person()))
    assert body["type"] == "Customer" and body["branch_office"] == 0
    assert body["fiscal_responsibilities"] == [{"code": "R-99-PN"}]
    assert body["address"]["city"] == {
        "country_code": "Co",
        "state_code": "11",
        "city_code": "11001",
    }
    assert "check_digit" not in body and "comments" not in body  # no nulls sent
    assert body["vat_responsible"] is False and body["active"] is True


def test_customer_company():
    c = CustomerCreate.model_validate(
        person(person_type="Company", id_type="31", identification="900123456", name=["ACME SAS"])
    )
    assert c.name == ["ACME SAS"]


@pytest.mark.parametrize(
    ("overrides", "fragment"),
    [
        ({"name": ["Solo"]}, "2 elemento"),
        ({"person_type": "Company", "name": ["A", "B"]}, "1 elemento"),
        ({"id_type": "31", "identification": "900123456-7"}, "sin dígito"),
        ({"identification": "12"}, "3 a 13"),
        ({"id_type": "41", "identification": "AB-123"}, "1 a 20"),
        ({"contacts": []}, "at least 1"),
        ({"contacts": [{"first_name": "x"}] * 11}, "at most 10"),
        ({"phones": []}, "at least 1"),
        ({"phones": [{"number": "300-600"}]}, "pattern"),
        ({"unknown": 1}, "Extra inputs"),
        ({"id_type": "99"}, "id_type"),
        ({"branch_office": 1000}, "less than or equal"),
        ({"fiscal_responsibilities": [{"code": "X"}]}, "fiscal_responsibilities"),
        ({"contacts": [{"first_name": "a", "email": "no-at-sign"}]}, "pattern"),
    ],
)
def test_customer_rejections(overrides, fragment):
    with pytest.raises(ValidationError) as info:
        CustomerCreate.model_validate(person(**overrides))
    assert fragment in str(info.value)


def test_city_codes_must_be_strings():
    data = person()
    data["address"]["city"]["city_code"] = 5001
    with pytest.raises(ValidationError):
        CustomerCreate.model_validate(data)


def test_invoice_defaults_and_serialisation():
    body = to_body(
        InvoiceCreate.model_validate({k: v for k, v in invoice().items() if k != "date"})
    )
    assert body["date"] == today_bogota().isoformat()
    assert body["stamp"] == {"send": False} and body["mail"] == {"send": False}
    assert body["customer"] == {"identification": "13832081", "branch_office": 0}
    assert isinstance(body["items"][0]["price"], float)
    assert body["payments"][0]["due_date"] == "2026-11-04"
    assert "number" not in body and "cost_center" not in body


def test_invoice_bad_date_is_rejected_but_omitted_uses_today():
    for bad in (None, "04/10/2026", "2026-02-30"):
        with pytest.raises(ValidationError):
            InvoiceCreate.model_validate(invoice(date=bad))
    inv = InvoiceCreate.model_validate({k: v for k, v in invoice().items() if k != "date"})
    assert inv.date == dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).date()


@pytest.mark.parametrize(
    ("item", "fragment"),
    [
        ({"code": "A", "quantity": 1}, "exactamente uno"),
        ({"code": "A", "quantity": 1, "price": 1, "taxed_price": 1}, "exactamente uno"),
        ({"code": "A", "quantity": 1.234, "price": 1}, "2 decimales"),
        ({"code": "A", "quantity": 0, "price": 1}, "greater than 0"),
        ({"code": "A", "quantity": 1, "price": 1.1234567}, "6 decimales"),
        ({"code": "A", "quantity": 1, "price": 0}, "greater than 0"),
        ({"code": "A B", "quantity": 1, "price": 1}, "pattern"),
        ({"code": "A'1", "quantity": 1, "price": 1}, "pattern"),
        ({"code": "A", "quantity": 1, "price": 1, "taxes": [{"id": 1}, {"id": 1}]}, "repetido"),
        ({"code": "A", "quantity": 1, "price": 1, "taxes": [{"id": i} for i in range(1, 5)]}, "3"),
        ({"code": "A", "quantity": 1, "price": 1, "discount": 1.001}, "2 decimales"),
    ],
)
def test_invoice_item_rejections(item, fragment):
    with pytest.raises(ValidationError) as info:
        InvoiceCreate.model_validate(invoice(items=[item]))
    assert fragment in str(info.value)


def test_invoice_other_rejections():
    for overrides in (
        {"items": []},
        {"payments": []},
        {"payments": [{"id": 1, "value": 10.555}]},
        {"currency": {"code": "usd", "exchange_rate": 4000}},
        {"observations": "x" * 4001},
        {"stamp": {"send": True, "extra": 1}},
    ):
        with pytest.raises(ValidationError):
            InvoiceCreate.model_validate(invoice(**overrides))
    ok = InvoiceCreate.model_validate(
        invoice(items=[{"code": "A", "quantity": 2.5, "taxed_price": 1190.123456}])
    )
    assert ok.items[0].taxed_price == 1190.123456
