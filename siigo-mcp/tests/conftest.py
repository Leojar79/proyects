"""Shared fixtures: a programmable fake Siigo API (httpx.MockTransport) and a fake clock."""

from __future__ import annotations

import datetime as dt
import email.utils
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest

from siigo_mcp.client import Settings
from siigo_mcp.server import create_server

ACCESS_KEY = "SuperSecretAccessKey123"
GUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6"
GUID2 = "9b2f1c4e-1111-4a2b-9c3d-abcdefabcdef"

Handler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def envelope(results: list[Any], *, page: int = 1, page_size: int = 25, total: int | None = None):
    return {
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_results": len(results) if total is None else total,
        },
        "results": results,
        "_links": {"self": {"href": "https://api.siigo.com/v1/x"}},
    }


def siigo_error(status: int, code: str, message: str, params: list[str] | None = None):
    return httpx.Response(
        status,
        json={
            "Status": status,
            "Errors": [{"Code": code, "Message": message, "Params": params or [], "Detail": None}],
        },
    )


@dataclass
class Call:
    method: str
    path: str
    params: dict[str, str]
    headers: httpx.Headers
    body: Any


@dataclass
class FakeSiigo:
    """Routes requests to handlers keyed by (METHOD, path) and records every call."""

    routes: dict[tuple[str, str], Handler | list[Handler | httpx.Response] | httpx.Response] = (
        field(default_factory=dict)
    )
    calls: list[Call] = field(default_factory=list)
    token_counter: int = 0

    def on(self, method: str, path: str, *responses: Handler | httpx.Response | dict | list):
        """Register a response, or a sequence consumed in order (last one repeats)."""
        items: list[Handler | httpx.Response] = []
        for r in responses:
            if isinstance(r, dict | list):
                items.append(httpx.Response(200, json=r))
            else:
                items.append(r)
        self.routes[(method.upper(), path)] = items
        return self

    def handler(self, request: httpx.Request) -> httpx.Response:
        body: Any = None
        if request.content:
            try:
                body = json.loads(request.content)
            except ValueError:
                body = request.content
        self.calls.append(
            Call(request.method, request.url.path, dict(request.url.params), request.headers, body)
        )
        key = (request.method, request.url.path)
        if key not in self.routes and request.url.path == "/auth":
            self.token_counter += 1
            return httpx.Response(
                200,
                json={
                    "access_token": f"jwt-token-{self.token_counter}",
                    "expires_in": 86400,
                    "token_type": "Bearer",
                    "scope": "SiigoAPI",
                },
            )
        if key not in self.routes:
            return siigo_error(404, "not_found", f"No route {key}")
        items = self.routes[key]
        assert isinstance(items, list)
        item = items.pop(0) if len(items) > 1 else items[0]
        if isinstance(item, httpx.Response):
            # Responses are single-use streams: return a fresh copy each time.
            return httpx.Response(item.status_code, headers=item.headers, content=item.content)
        return item(request)

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)

    def paths(self) -> list[str]:
        return [c.path for c in self.calls]

    def data_calls(self) -> list[Call]:
        return [c for c in self.calls if c.path != "/auth"]


@dataclass
class FakeClock:
    """Monotonic clock advanced only by ``sleep``; records every wait."""

    now: float = 1000.0
    sleeps: list[float] = field(default_factory=list)

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def fake() -> FakeSiigo:
    return FakeSiigo()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        username="api@empresa.com",
        access_key=ACCESS_KEY,
        partner_id="TestApp",
        rate_limit_per_minute=100,
        download_dir=tmp_path / "downloads",
    )


@pytest.fixture
def make_server(fake: FakeSiigo, clock: FakeClock, settings: Settings):
    def build(**overrides: Any):
        from dataclasses import replace

        s = replace(settings, **overrides) if overrides else settings
        return create_server(s, fake.transport, sleep=clock.sleep, clock=clock)

    return build


# --------------------------------------------------------------------------- catalog fixtures

DOC_FV = {
    "id": 24446,
    "code": "1",
    "name": "Factura de venta",
    "type": "FV",
    "active": True,
    "seller_by_item": False,
    "cost_center": False,
    "cost_center_mandatory": False,
    "automatic_number": True,
    "consecutive": 10,
    "discount_type": "Percentage",
    "electronic_type": "NoElectronic",
}
DOC_ELECTRONIC = DOC_FV | {
    "id": 30000,
    "name": "Factura electrónica",
    "electronic_type": "Electronicvoice",
    "discount_type": "Value",
}
DOC_STRICT = DOC_FV | {
    "id": 30001,
    "automatic_number": False,
    "cost_center_mandatory": True,
    "cost_center_default": 235,
    "seller_by_item": True,
}
DOC_INACTIVE = DOC_FV | {"id": 30002, "active": False}
DOCUMENT_TYPES = [DOC_FV, DOC_ELECTRONIC, DOC_STRICT, DOC_INACTIVE]

PAY_CASH = {"id": 5636, "name": "Efectivo", "type": "Cartera", "active": True, "due_date": False}
PAY_CREDIT = {"id": 5637, "name": "Crédito", "type": "Cartera", "active": True, "due_date": True}
PAY_OFF = {"id": 5638, "name": "Cheque", "type": "Cartera", "active": False, "due_date": False}
PAYMENT_TYPES = [PAY_CASH, PAY_CREDIT, PAY_OFF]

TAXES = [
    {"id": 13156, "name": "IVA 19%", "type": "IVA", "percentage": 19, "active": True},
    {"id": 13157, "name": "IVA 5%", "type": "IVA", "percentage": 5, "active": True},
    {"id": 13158, "name": "ReteIVA 15%", "type": "ReteIVA", "percentage": 15, "active": True},
    {"id": 13159, "name": "AdValorem", "type": "AdValorem", "percentage": 2, "active": True},
    {"id": 13160, "name": "Retefuente", "type": "Retefuente", "percentage": 2.5, "active": True},
    {"id": 13161, "name": "IVA 16%", "type": "IVA", "percentage": 16, "active": False},
    {"id": 13162, "name": "Impoconsumo 8%", "type": "Impoconsumo", "percentage": 8, "active": True},
    {"id": 13163, "name": "Autorretención", "type": "Autorretención", "percentage": 0.4,
     "active": True},
]  # fmt: skip

CUSTOMER = {
    "id": GUID,
    "identification": "13832081",
    "branch_office": 0,
    "active": True,
    "name": ["Marcos", "Castillo"],
    "contacts": [{"first_name": "Marcos"}],
}


def invoice_payload(**overrides: Any) -> dict[str, Any]:
    """A valid simple invoice: 1069.77 + 19% IVA = 1273.03 (spec D.2 example)."""
    data: dict[str, Any] = {
        "document": {"id": 24446},
        "date": "2099-01-01",
        "customer": {"identification": "13832081", "branch_office": 0},
        "seller": 629,
        "items": [
            {"code": "Item-1", "description": "Camiseta", "quantity": 1, "price": 1069.77,
             "taxes": [{"id": 13156}]}
        ],
        "payments": [{"id": 5636, "value": 1273.03}],
    }  # fmt: skip
    data.update(overrides)
    return data


def route_catalogs(fake: FakeSiigo, customers: list[Any] | None = None) -> FakeSiigo:
    """Answer the preflight catalogs; document-types/payment-types honour their query."""

    def doc_types(request: httpx.Request) -> httpx.Response:
        wanted = request.url.params.get("type")
        return httpx.Response(200, json=[d for d in DOCUMENT_TYPES if d["type"] == wanted])

    fake.on("GET", "/v1/document-types", doc_types)
    fake.on("GET", "/v1/payment-types", PAYMENT_TYPES)
    fake.on("GET", "/v1/taxes", TAXES)
    fake.on("GET", "/v1/customers", envelope([CUSTOMER] if customers is None else customers))
    return fake


class InvoiceStore:
    """``POST /v1/invoices`` as Siigo documents it (Blueprint "# Idempotencia").

    A repeated Idempotency-Key returns the invoice created earlier for that key ("la
    información del comprobante creado previamente"), never a new one. The answer echoes
    the items and payments as sent (``InvoiceOutDian``). ``now`` is Siigo's
    clock: it stamps ``metadata.created`` (``+00:00``, 7 fractional digits, as in the
    Blueprint) and the ``Date`` header; tests move it to simulate later sales.
    """

    def __init__(self) -> None:
        self.invoices: list[dict[str, Any]] = []
        self.by_key: dict[str, dict[str, Any]] = {}
        self.keys_sent: list[str | None] = []
        self.now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        self.lose_answers = 0  # this many answers are lost after the invoice is stored

    def stamp(self) -> str:
        return f"{self.now:%Y-%m-%dT%H:%M:%S}.{self.now.microsecond:06d}0+00:00"

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        key = request.headers.get("idempotency-key")
        self.keys_sent.append(key)
        invoice = self.by_key.get(key) if key else None
        if invoice is None:
            n = len(self.invoices) + 1
            total = round(sum(p["value"] for p in body["payments"]), 2)
            invoice = {
                "id": f"00000000-0000-4000-8000-{n:012d}",
                "document": {"id": body["document"]["id"]},
                "number": n,
                "name": f"FV-1-{n}",
                "date": body["date"],
                "customer": dict(body["customer"]),
                "items": [
                    {
                        "code": i["code"],
                        "quantity": i["quantity"],
                        "price": i.get("price", i.get("taxed_price")),
                    }
                    for i in body["items"]
                ],
                "payments": [{"id": p["id"], "value": p["value"]} for p in body["payments"]],
                "total": total,
                "balance": total,
                "stamp": {"status": "Draft"},
                "metadata": {"created": self.stamp(), "last_updated": None},
            }
            self.invoices.append(invoice)
            if key:
                self.by_key[key] = invoice
        if self.lose_answers:
            self.lose_answers -= 1
            raise httpx.ReadTimeout("answer lost", request=request)
        date = email.utils.format_datetime(self.now, usegmt=True)
        return httpx.Response(201, json=invoice, headers={"Date": date})
