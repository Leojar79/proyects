"""Replay reporting for ``siigo_create_invoice`` (spec A.2).

The agent sends its own Idempotency-Key, a new one per sale, and reuses it on every retry of
that sale. Siigo answers a repeated key with the invoice it created earlier for it ("la
información del comprobante creado previamente") instead of a new one, so a 2xx may be a
replay. ``check_replay`` says which, when it can be known, and never raises:

- ``True``: this process already received a 2xx with this key for the same invoice id, or
  the invoice's ``metadata.created`` is older than the start of this call by more than
  ``REPLAY_MARGIN`` (on Siigo's clock when its ``Date`` header came back).
- ``False``: ``metadata.created`` is not that old. A retry sent less than ``REPLAY_MARGIN``
  after the attempt that really created the invoice also lands here.
- ``None``: ``metadata.created`` is missing or unreadable.

``differences`` compares the returned invoice with the request: a replay keeps the data of
the call that created the invoice, so a retry with corrected data gets the old invoice back.
"""

from __future__ import annotations

import datetime as dt
import email.utils
import math
import re
from collections.abc import Mapping
from typing import Any

REPLAY_MARGIN = 120.0  # seconds; a false "replayed" could lead the agent to invoice twice
MAX_KEYS = 256

UTC = dt.timezone.utc
BOGOTA = dt.timezone(dt.timedelta(hours=-5))


def utc_now() -> dt.datetime:
    return dt.datetime.now(UTC)


class AnsweredKeys:
    """Per-process memory (bounded): Idempotency-Key -> id of the invoice a 2xx returned."""

    def __init__(self) -> None:
        self._ids: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._ids.get(key)

    def add(self, key: str, invoice_id: Any) -> None:
        if invoice_id in (None, "") or key in self._ids:
            return
        self._ids[key] = str(invoice_id)
        while len(self._ids) > MAX_KEYS:
            del self._ids[next(iter(self._ids))]


# --------------------------------------------------------------------------- timestamps

_TIMESTAMP_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$",
    re.IGNORECASE | re.ASCII,
)


def parse_timestamp(value: Any) -> dt.datetime | None:
    """Siigo's ``metadata.created`` (e.g. ``2025-07-10T20:48:59.8634833+00:00``) in UTC.

    Returns ``None`` for anything malformed (never raises). Python 3.10 cannot parse 7
    fractional digits or ``Z``, hence the regex. A value without an offset is read as
    Colombian time: of the two plausible readings (UTC or UTC-5) that is the later instant,
    so an ambiguous value never makes an invoice look older than it is.
    """
    match = _TIMESTAMP_RE.match(value.strip()) if isinstance(value, str) else None
    if not match:
        return None
    *parts, fraction, offset = match.groups()
    tz: dt.tzinfo = BOGOTA if offset is None else UTC
    try:
        if offset and offset.upper() != "Z":
            digits = offset[1:].replace(":", "")
            hours, minutes = int(digits[:2]), int(digits[2:])
            if hours > 23 or minutes > 59:
                return None
            delta = dt.timedelta(hours=hours, minutes=minutes)
            tz = dt.timezone(-delta if offset[0] == "-" else delta)
        micro = int((fraction or "0")[:6].ljust(6, "0"))
        return dt.datetime(*map(int, parts), micro, tz).astimezone(UTC)
    except (ValueError, OverflowError):
        return None


def parse_http_date(value: Any) -> dt.datetime | None:
    """The ``Date`` header of Siigo's answer (RFC 9110), in UTC; ``None`` if unreadable."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        stamp = email.utils.parsedate_to_datetime(value)
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=UTC)
        return stamp.astimezone(UTC)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None


def call_reference(started: dt.datetime, response_info: Mapping[str, Any]) -> dt.datetime:
    """Latest instant, on Siigo's clock when known, before which this call created nothing.

    With a ``Date`` header the reference is Siigo's own time minus the whole call duration,
    so a wrong clock on the user's computer cannot make a new invoice look old. Without it,
    the local time taken just before the POST.
    """
    server = parse_http_date(response_info.get("date"))
    try:
        elapsed = max(0.0, float(response_info.get("elapsed") or 0.0))
        if server is not None:
            return server - dt.timedelta(seconds=elapsed + 1)  # the header has 1 s resolution
    except (TypeError, ValueError, OverflowError):
        pass
    return started


# --------------------------------------------------------------------------- replay check


def check_replay(
    answer: Mapping[str, Any], *, earlier_id: str | None, reference: dt.datetime
) -> tuple[bool | None, str]:
    """``(replayed, reason)`` for a 2xx to ``POST /v1/invoices`` (see the module docstring).

    ``earlier_id`` is the invoice id of an earlier 2xx with the same key in this process.
    """
    invoice_id = answer.get("id")
    if earlier_id is not None and str(invoice_id) == earlier_id:
        return True, "este servidor ya había recibido esta misma factura con esta clave"
    metadata = answer.get("metadata")
    raw = metadata.get("created") if isinstance(metadata, dict) else None
    created = parse_timestamp(raw)
    if created is None:
        return None, "Siigo no informó una fecha de creación legible (metadata.created)"
    try:
        limit = (reference - dt.timedelta(seconds=REPLAY_MARGIN)).astimezone(UTC)
        started = reference.isoformat(timespec="seconds")
    except (OverflowError, ValueError):
        return None, "no se pudo determinar el inicio de esta llamada"
    if created < limit:
        return (
            True,
            f"su metadata.created ({raw}) es anterior al inicio de esta llamada ({started})",
        )
    return False, f"su metadata.created ({raw}) es posterior a {limit:%H:%M:%S} UTC"


# --------------------------------------------------------------------------- data check

PAYMENTS_TOLERANCE = 0.005  # payments are stored as sent, with at most 2 decimals


def _text(value: Any) -> str | None:
    if isinstance(value, bool) or not isinstance(value, str | int):
        return None
    return str(value).strip().casefold() or None


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


def _items(rows: Any) -> list[tuple[str, float, str]] | None:
    """Sorted (code, quantity, code as sent) per item; ``None`` if any item is unreadable."""
    if not isinstance(rows, list) or not rows:
        return None
    items = []
    for row in rows:
        code = _text(row.get("code")) if isinstance(row, Mapping) else None
        quantity = _number(row.get("quantity")) if isinstance(row, Mapping) else None
        if code is None or quantity is None:
            return None
        items.append((code, quantity, str(row.get("code")).strip()))
    return sorted(items)


def _show_items(rows: list[tuple[str, float, str]]) -> str:
    return ", ".join(f"{shown} x {quantity:g}" for _, quantity, shown in rows)


def _paid(rows: Any) -> float | None:
    """Sum of ``payments[].value``; ``None`` if missing or any value is unreadable."""
    if not isinstance(rows, list) or not rows:
        return None
    paid = 0.0
    for row in rows:
        value = _number(row.get("value")) if isinstance(row, Mapping) else None
        if value is None:
            return None
        paid += value
    return round(paid, 2) if math.isfinite(paid) else None


def differences(answer: Mapping[str, Any], body: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Fields of the returned invoice that contradict the request ``body`` (never raises).

    Only what Siigo echoes for a new invoice, when the answer carries it: customer and
    branch office, document type, date (only when ``body`` has one: the caller's own, not a
    default that changes at midnight), item codes and quantities, and the sum of the
    payments. Siigo stores the payments as sent and requires them to match the invoice, so
    any correction that changes the total (a price, a discount, a tax) changes that sum.
    """
    found: list[dict[str, Any]] = []

    def differ(field: str, requested: Any, returned: Any) -> None:
        found.append({"field": field, "requested": requested, "returned": returned})

    asked = body.get("customer") if isinstance(body.get("customer"), Mapping) else {}
    got = answer.get("customer") if isinstance(answer.get("customer"), Mapping) else {}
    returned = _text(got.get("identification"))
    if returned is not None and returned != _text(asked.get("identification")):
        differ("customer.identification", asked.get("identification"), got.get("identification"))
    returned_branch = _number(got.get("branch_office"))
    if returned_branch is not None and returned_branch != _number(asked.get("branch_office", 0)):
        differ("customer.branch_office", asked.get("branch_office", 0), got.get("branch_office"))
    document = answer.get("document") if isinstance(answer.get("document"), Mapping) else {}
    requested_doc = (body.get("document") or {}).get("id")
    returned_doc = _number(document.get("id"))
    if returned_doc is not None and returned_doc != _number(requested_doc):
        differ("document.id", requested_doc, document.get("id"))
    date = answer.get("date").strip() if isinstance(answer.get("date"), str) else ""
    if (
        "date" in body
        and re.match(r"\d{4}-\d{2}-\d{2}", date)
        and date[:10] != str(body.get("date"))
    ):
        differ("date", body.get("date"), answer.get("date"))
    asked_items, got_items = _items(body.get("items")), _items(answer.get("items"))
    if asked_items is not None and got_items is not None:
        same = len(asked_items) == len(got_items) and all(
            a[0] == g[0] and abs(a[1] - g[1]) < 0.001
            for a, g in zip(asked_items, got_items, strict=False)
        )
        if not same:
            differ("items", _show_items(asked_items), _show_items(got_items))
    asked_paid, got_paid = _paid(body.get("payments")), _paid(answer.get("payments"))
    if None not in (asked_paid, got_paid) and abs(asked_paid - got_paid) > PAYMENTS_TOLERANCE:
        differ("payments", asked_paid, got_paid)
    return found
