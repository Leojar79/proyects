"""Catalog cache (TTL 600 s) and local invoice preflight (spec D.2).

Every request that fails at Siigo counts toward the "more than 80% failed
requests in 7 days" rule that blocks the API user, so the invoice tool checks
everything it can locally before POSTing.
"""

from __future__ import annotations

import datetime as dt
import time
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal
from typing import Any

import anyio

from .client import ClockFn, SiigoClient, normalize_list
from .models import InvoiceCreate, today_bogota

CATALOG_TTL = 600.0
DOCUMENT_TYPES_PATH = "/v1/document-types"
PAYMENT_TYPES_PATH = "/v1/payment-types"
TAXES_PATH = "/v1/taxes"

# Item-level taxes allowed in the simple total check and forbidden at item level.
_SIMPLE_TAX_TYPES = {"iva", "impoconsumo"}
_NOT_ON_ITEMS = {"reteiva", "reteica", "autorretencion"}
_Q2 = Decimal("0.01")


class CatalogCache:
    """Per-process cache of catalog answers, keyed by path and query params."""

    def __init__(
        self, client: SiigoClient, *, ttl: float = CATALOG_TTL, clock: ClockFn | None = None
    ):
        self.client = client
        self.ttl = ttl
        self._clock = clock or time.monotonic
        self._entries: dict[tuple[str, tuple[tuple[str, str], ...]], tuple[float, Any]] = {}
        self._lock = anyio.Lock()

    async def get(
        self, path: str, params: Mapping[str, Any] | None = None, *, refresh: bool = False
    ) -> tuple[Any, bool]:
        """Return ``(data, from_cache)``."""
        key = (path, tuple(sorted((k, str(v)) for k, v in (params or {}).items())))
        async with self._lock:
            hit = self._entries.get(key)
            if hit is not None and not refresh and self._clock() - hit[0] < self.ttl:
                return hit[1], True
            data = await self.client.get(path, params)
            self._entries[key] = (self._clock(), data)
            return data, False

    async def rows(self, path: str, params: Mapping[str, Any] | None = None) -> list[Any]:
        data, _ = await self.get(path, params)
        return normalize_list(data)["results"]

    def clear(self) -> None:
        self._entries.clear()


# --------------------------------------------------------------------------- helpers


def _norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(c for c in text if not unicodedata.combining(c)).strip().lower()


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _index(rows: list[Any]) -> dict[int, dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict) and (key := _as_int(row.get("id"))) is not None:
            out[key] = row
    return out


def _dec(value: float | int | str) -> Decimal:
    return Decimal(str(value))


@dataclass
class PreflightReport:
    problems: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checks: list[str] = field(default_factory=list)
    totals: dict[str, float] | None = None

    @property
    def ok(self) -> bool:
        return not self.problems

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"ok": self.ok, "checks": self.checks, "warnings": self.warnings}
        if self.problems:
            out["problems"] = self.problems
        if self.totals is not None:
            out["totals"] = self.totals
        return out


def compute_total(
    invoice: InvoiceCreate,
    taxes: Mapping[int, Mapping[str, Any]],
    discount_type: str,
    rounding: str,
) -> Decimal:
    """Invoice total for the simple case: per item base, tax and total rounded to 2 dp."""
    total = Decimal("0")
    for item in invoice.items:
        qty = _dec(item.quantity)
        price = _dec(item.price or 0)
        gross = qty * price
        discount = Decimal("0")
        if item.discount:
            if discount_type == "percentage":
                discount = (gross * _dec(item.discount) / 100).quantize(_Q2, rounding)
            else:
                discount = _dec(item.discount)
        base = (gross - discount).quantize(_Q2, rounding)
        tax_sum = Decimal("0")
        for ref in item.taxes:
            pct = _dec(taxes[ref.id].get("percentage") or 0)
            tax_sum += (base * pct / 100).quantize(_Q2, rounding)
        total += (base + tax_sum).quantize(_Q2, rounding)
    return total


# --------------------------------------------------------------------------- evaluation


def evaluate_invoice(
    invoice: InvoiceCreate,
    *,
    document_types: list[Any],
    payment_types: list[Any],
    taxes: list[Any] | None,
    today: dt.date | None = None,
) -> PreflightReport:
    """Pure checks 1-8 of spec D.2 against already-loaded catalogs."""
    report = PreflightReport()
    today = today or today_bogota()
    problems, warnings, checks = report.problems, report.warnings, report.checks

    # 1. document type exists and is active
    checks.append("document_type")
    doc = _index(document_types).get(invoice.document.id)
    if doc is None:
        problems.append(
            f"document.id={invoice.document.id} no es un tipo de comprobante FV de esta empresa; "
            "consulta los válidos con siigo_list_document_types(type='FV')."
        )
    elif doc.get("active") is False:
        problems.append(f"El tipo de comprobante {invoice.document.id} está inactivo.")

    discount_type = ""
    if doc is not None:
        discount_type = _norm(doc.get("discount_type"))
        # 2. number only when automatic_number is false
        checks.append("number")
        automatic = doc.get("automatic_number")
        if automatic is False and invoice.number is None:
            problems.append(
                "Este tipo de comprobante no tiene numeración automática "
                "(automatic_number=false): envía `number` con un consecutivo que no exista."
            )
        elif automatic is True and invoice.number is not None:
            problems.append(
                "Este tipo de comprobante tiene numeración automática: omite `number` "
                "(enviarlo puede causar duplicated_document)."
            )
        # 3. cost center
        checks.append("cost_center")
        if doc.get("cost_center_mandatory") is True and invoice.cost_center is None:
            default = doc.get("cost_center_default")
            extra = f" (el predeterminado del tipo es {default})" if default else ""
            problems.append(
                "El tipo de comprobante exige centro de costo: envía `cost_center`"
                f"{extra}; consulta siigo_list_cost_centers."
            )
        # 4. seller per item
        checks.append("seller_by_item")
        if doc.get("seller_by_item") is True:
            missing = [str(i + 1) for i, it in enumerate(invoice.items) if it.seller is None]
            if missing:
                problems.append(
                    "El tipo de comprobante exige vendedor por ítem (seller_by_item=true): "
                    f"falta `seller` en los ítems {', '.join(missing)}."
                )
        # 5. electronic invoices cannot be dated before today (Colombia time)
        checks.append("date")
        # Fail closed: only an explicit NoElectronic type may carry a past date.
        electronic = _norm(doc.get("electronic_type"))
        is_electronic = electronic != "noelectronic"
        if not electronic:
            warnings.append(
                f"El tipo de comprobante {invoice.document.id} no informa electronic_type: se "
                "validó como factura electrónica (la fecha no puede ser anterior a hoy)."
            )
        if is_electronic and invoice.date < today:
            problems.append(
                f"La fecha {invoice.date.isoformat()} es anterior a hoy ({today.isoformat()}, "
                "hora de Colombia): una factura electrónica no puede tener fecha pasada."
            )
        if invoice.stamp.send and not is_electronic:
            warnings.append(
                "stamp.send=true no tiene efecto: el tipo de comprobante no es electrónico."
            )

    # 6. payment types
    checks.append("payments")
    pay_index = _index(payment_types)
    any_due = False
    for n, payment in enumerate(invoice.payments, start=1):
        ptype = pay_index.get(payment.id)
        if ptype is None:
            problems.append(
                f"payments[{n}].id={payment.id} no es una forma de pago FV; consulta "
                "siigo_list_payment_types(document_type='FV')."
            )
            continue
        if ptype.get("active") is False:
            problems.append(f"La forma de pago {payment.id} está inactiva.")
        if ptype.get("due_date") is True:
            any_due = True
            if payment.due_date is None:
                problems.append(
                    f"La forma de pago {payment.id} exige `due_date` (fecha de vencimiento)."
                )
    if any_due and len(invoice.payments) != 1:
        problems.append(
            "Cuando una forma de pago exige fecha de vencimiento solo se permite UN pago "
            f"en `payments` (se enviaron {len(invoice.payments)})."
        )

    # 7. taxes
    tax_index = _index(taxes or [])
    uses_taxes = any(item.taxes for item in invoice.items) or bool(invoice.retentions)
    if uses_taxes:
        checks.append("taxes")
    for n, item in enumerate(invoice.items, start=1):
        types: list[str] = []
        for ref in item.taxes:
            tax = tax_index.get(ref.id)
            if tax is None:
                problems.append(
                    f"items[{n}]: el impuesto {ref.id} no existe; consulta siigo_list_taxes."
                )
                continue
            if tax.get("active") is False:
                problems.append(f"items[{n}]: el impuesto {ref.id} está inactivo.")
            ttype = _norm(tax.get("type"))
            if ttype in _NOT_ON_ITEMS:
                problems.append(
                    f"items[{n}]: el impuesto {ref.id} ({tax.get('type')}) no va en ítems; "
                    "envíalo en `retentions` a nivel de factura."
                )
            types.append(ttype)
        if len(set(types)) != len(types):
            problems.append(f"items[{n}]: tiene dos impuestos del mismo tipo.")
        if "iva" in types and "advalorem" in types:
            problems.append(f"items[{n}]: no se puede combinar IVA con AdValorem.")
    for ref in invoice.retentions or []:
        tax = tax_index.get(ref.id)
        if tax is None:
            problems.append(
                f"retentions: el impuesto {ref.id} no existe; consulta siigo_list_taxes."
            )
        elif tax.get("active") is False:
            problems.append(f"retentions: el impuesto {ref.id} está inactivo.")

    # 8. totals, only in the simple case
    reasons: list[str] = []
    if doc is None:
        reasons.append("tipo de comprobante desconocido")
    if any(item.taxed_price is not None for item in invoice.items):
        reasons.append("hay ítems con taxed_price")
    if invoice.retentions:
        reasons.append("hay retenciones")
    if invoice.advance_payment is not None:
        reasons.append("hay anticipo")
    if invoice.currency is not None:
        reasons.append("moneda extranjera")
    for item in invoice.items:
        for ref in item.taxes:
            tax = tax_index.get(ref.id)
            if tax is None or _norm(tax.get("type")) not in _SIMPLE_TAX_TYPES:
                reasons.append("impuestos distintos de IVA/Impoconsumo")
                break
            try:
                _dec(tax.get("percentage") or 0)
            except ArithmeticError:
                reasons.append("porcentaje de impuesto no numérico")
                break
    if any(item.discount for item in invoice.items) and discount_type not in (
        "value",
        "percentage",
    ):
        reasons.append("discount_type desconocido")
    if reasons:
        warnings.append(
            "No se verificó que los pagos igualen el total ("
            + ", ".join(dict.fromkeys(reasons))
            + "); Siigo lo validará (invalid_total_payments)."
        )
    else:
        checks.append("total")
        paid = sum((_dec(p.value) for p in invoice.payments), Decimal("0"))
        half_up = compute_total(invoice, tax_index, discount_type, ROUND_HALF_UP)
        half_even = compute_total(invoice, tax_index, discount_type, ROUND_HALF_EVEN)
        report.totals = {
            "payments": float(paid),
            "total_round_half_up": float(half_up),
            "total_round_half_even": float(half_even),
        }
        if paid not in (half_up, half_even):
            problems.append(
                f"La suma de los pagos ({paid}) no coincide con el total calculado de la factura "
                f"({half_up} con redondeo HALF_UP; {half_even} con HALF_EVEN). Por ítem: "
                "base = cantidad×precio − descuento; impuesto = base×%/100; cada uno redondeado "
                "a 2 decimales. Ajusta payments[].value (Siigo respondería invalid_total_payments)."
            )
    return report


async def preflight_invoice(
    invoice: InvoiceCreate,
    *,
    catalogs: CatalogCache,
    check_customer: bool = True,
    today: dt.date | None = None,
) -> PreflightReport:
    """Load the needed catalogs (cached) and run every check, including the customer one."""
    document_types = await catalogs.rows(DOCUMENT_TYPES_PATH, {"type": "FV"})
    payment_types = await catalogs.rows(PAYMENT_TYPES_PATH, {"document_type": "FV"})
    needs_taxes = any(item.taxes for item in invoice.items) or bool(invoice.retentions)
    taxes = await catalogs.rows(TAXES_PATH) if needs_taxes else []
    report = evaluate_invoice(
        invoice,
        document_types=document_types,
        payment_types=payment_types,
        taxes=taxes,
        today=today,
    )
    if check_customer:
        # 9. the customer must exist and be active (one request)
        report.checks.append("customer")
        ref = invoice.customer
        data = await catalogs.client.get(
            "/v1/customers",
            {"identification": ref.identification, "branch_office": ref.branch_office},
        )
        found = [
            c
            for c in normalize_list(data)["results"]
            if isinstance(c, dict) and str(c.get("identification", "")) == ref.identification
        ]
        if not found:
            report.problems.append(
                f"No existe un cliente con identificación {ref.identification} "
                f"(sucursal {ref.branch_office}); créalo con siigo_create_customer."
            )
        else:
            customer = found[0]
            if customer.get("active") is False:
                report.problems.append(f"El cliente {ref.identification} está inactivo en Siigo.")
            if customer.get("contacts") == []:
                report.warnings.append(
                    f"El cliente {ref.identification} no tiene contactos; Siigo podría responder "
                    "customer_settings."
                )
    return report
