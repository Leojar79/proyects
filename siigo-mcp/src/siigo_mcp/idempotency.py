"""Idempotency-Key bookkeeping for ``siigo_create_invoice`` (spec A.2).

Siigo answers a repeated Idempotency-Key with the invoice it created earlier for that key,
not with a new one ("la información del comprobante creado previamente"). So:

- Every call gets a fresh random key (``uuid4().hex[:30]``) unless the agent sends one: two
  separate sales with identical content must never share a key.
- To keep a re-run of a call whose outcome is unknown (client timeout, cancellation, Esc,
  408/5xx, unreadable 2xx) from creating a second invoice, the key is remembered for the
  body's fingerprint while the POST is in flight and after such an outcome, for
  ``PENDING_KEY_TTL`` seconds. An identical re-run without a key reuses it. A definite outcome
  (2xx, or a rejection that created nothing) forgets it.
- A 2xx may therefore be a replay of an earlier invoice. ``check_replay`` tells it apart from
  a creation, so the tool never reports ``created: true`` for an invoice it did not create.
"""

from __future__ import annotations

import datetime as dt
import email.utils
import re
from collections import OrderedDict
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

PENDING_KEY_TTL = 2 * 3600.0  # seconds an unknown-outcome key is reused for identical calls
ANSWERED_KEY_TTL = 24 * 3600.0  # seconds a key that already got a 2xx is remembered
REPLAY_MARGIN = 120.0  # clock skew allowed before an older metadata.created means "replay"
MAX_KEYS = 256

UTC = dt.timezone.utc
BOGOTA = dt.timezone(dt.timedelta(hours=-5))

ClockFn = Callable[[], float]


def utc_now() -> dt.datetime:
    return dt.datetime.now(UTC)


@dataclass(frozen=True)
class PendingKey:
    key: str
    since: float  # clock() of the latest send of this key for the body


class InvoiceKeyMemory:
    """Per-process memory of invoice Idempotency-Keys (bounded and time-limited).

    ``pending``: body fingerprint -> key of a POST in flight or whose outcome is unknown.
    ``answered``: key -> id of the invoice of a 2xx already received with that key (``None``
    when the 2xx could not be read): another 2xx with that key can only be a replay.
    ``created``: body fingerprint -> the last invoice created for it, to warn when an identical
    call without a key follows (a retry whose earlier answer never reached the agent would be
    a duplicate; the server cannot tell it from a second sale, so it only warns).
    """

    def __init__(self, clock: ClockFn):
        self._clock = clock
        self._pending: OrderedDict[str, PendingKey] = OrderedDict()
        self._answered: OrderedDict[str, tuple[float, str | None]] = OrderedDict()
        self._created: OrderedDict[str, tuple[float, CreatedInvoice]] = OrderedDict()

    def _expire(self) -> None:
        now = self._clock()
        stores: tuple[tuple[OrderedDict[str, Any], float], ...] = (
            (self._pending, PENDING_KEY_TTL),
            (self._answered, ANSWERED_KEY_TTL),
            (self._created, PENDING_KEY_TTL),
        )
        for store, ttl in stores:
            for name in [k for k, v in store.items() if now - _since(v) > ttl]:
                del store[name]
            while len(store) > MAX_KEYS:
                store.popitem(last=False)

    def pending(self, fingerprint: str) -> PendingKey | None:
        self._expire()
        return self._pending.get(fingerprint)

    def remember(self, fingerprint: str, key: str) -> None:
        """Called before every send: the window runs from the latest attempt."""
        self._pending[fingerprint] = PendingKey(key, self._clock())
        self._pending.move_to_end(fingerprint)
        self._expire()

    def forget(self, fingerprint: str, key: str) -> None:
        current = self._pending.get(fingerprint)
        if current is not None and current.key == key:
            del self._pending[fingerprint]

    def answered(self, key: str) -> tuple[float, str | None] | None:
        """``(seconds ago, invoice id)`` of an earlier 2xx with this key, if any."""
        self._expire()
        hit = self._answered.get(key)
        if hit is None:
            return None
        return self._clock() - hit[0], hit[1]

    def record_answer(self, key: str, invoice_id: Any) -> None:
        if key not in self._answered:
            ident = str(invoice_id) if invoice_id not in (None, "") else None
            self._answered[key] = (self._clock(), ident)
        self._expire()

    def record_created(self, fingerprint: str, invoice: CreatedInvoice) -> None:
        self._created[fingerprint] = (self._clock(), invoice)
        self._created.move_to_end(fingerprint)
        self._expire()

    def recently_created(self, fingerprint: str) -> tuple[float, CreatedInvoice] | None:
        """``(seconds ago, invoice)`` created by this server for an identical body, if any."""
        self._expire()
        hit = self._created.get(fingerprint)
        return None if hit is None else (self._clock() - hit[0], hit[1])

    def age(self, entry: PendingKey) -> float:
        return max(0.0, self._clock() - entry.since)


@dataclass(frozen=True)
class CreatedInvoice:
    key: str
    invoice_id: str | None
    name: str | None


def _since(value: PendingKey | tuple[float, Any]) -> float:
    return value.since if isinstance(value, PendingKey) else value[0]


# --------------------------------------------------------------------------- timestamps

_TIMESTAMP_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$",
    re.IGNORECASE,
)


def parse_timestamp(value: Any) -> dt.datetime | None:
    """Siigo's ``metadata.created`` (e.g. ``2025-07-10T20:48:59.8634833+00:00``) in UTC.

    Python 3.10 cannot parse 7 fractional digits or ``Z``, hence the regex. A value without
    an offset is read as Colombian time: of the two plausible readings (UTC or UTC-5) that is
    the later instant, so an ambiguous value never makes an invoice look older than it is.
    """
    if not isinstance(value, str):
        return None
    match = _TIMESTAMP_RE.match(value.strip())
    if not match:
        return None
    year, month, day, hour, minute, second, fraction, offset = match.groups()
    micro = int((fraction or "0")[:6].ljust(6, "0"))
    if offset is None:
        tz: dt.tzinfo = BOGOTA
    elif offset.upper() == "Z":
        tz = UTC
    else:
        sign = -1 if offset[0] == "-" else 1
        digits = offset[1:].replace(":", "")
        tz = dt.timezone(sign * dt.timedelta(hours=int(digits[:2]), minutes=int(digits[2:])))
    try:
        stamp = dt.datetime(
            int(year), int(month), int(day), int(hour), int(minute), int(second), micro, tz
        )
    except ValueError:
        return None
    return stamp.astimezone(UTC)


def parse_http_date(value: Any) -> dt.datetime | None:
    """The ``Date`` header of Siigo's answer (RFC 9110), in UTC."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        stamp = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=UTC)
    return stamp.astimezone(UTC)


def call_reference(started: dt.datetime, response_info: Mapping[str, Any]) -> dt.datetime:
    """Latest instant, on Siigo's clock when known, before which this call created nothing.

    With a ``Date`` header the reference is Siigo's own time minus the whole call duration,
    so a wrong clock on the user's computer cannot make a new invoice look old. Without it,
    the local time taken just before the POST.
    """
    server = parse_http_date(response_info.get("date"))
    if server is None:
        return started
    try:
        elapsed = max(0.0, float(response_info.get("elapsed") or 0.0))
    except (TypeError, ValueError):
        elapsed = 0.0
    return server - dt.timedelta(seconds=elapsed + 1)  # the header has 1 s resolution


# --------------------------------------------------------------------------- replay check


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@dataclass
class ReplayCheck:
    replayed: bool = False
    reasons: list[str] = field(default_factory=list)
    mismatches: list[dict[str, Any]] = field(default_factory=list)
    metadata_created: str | None = None
    call_started: str | None = None

    def evidence(self) -> dict[str, Any]:
        out: dict[str, Any] = {"reasons": self.reasons}
        if self.mismatches:
            out["mismatches"] = self.mismatches
        if self.metadata_created:
            out["metadata_created"] = self.metadata_created
        if self.call_started:
            out["call_started"] = self.call_started
        return out


def mismatches(
    answer: Mapping[str, Any],
    *,
    customer_identification: str,
    document_id: int,
    expected_total: float | None,
) -> list[dict[str, Any]]:
    """Fields of the returned invoice that contradict the request (a different invoice).

    Only fields Siigo must echo for a new invoice: the customer, the document type and, when
    it is known exactly (simple invoices, checked by the preflight), the total.
    """
    found: list[dict[str, Any]] = []
    returned = _as_dict(answer.get("customer")).get("identification")
    if returned not in (None, "") and (
        str(returned).strip().upper() != customer_identification.strip().upper()
    ):
        found.append(
            {
                "field": "customer.identification",
                "requested": customer_identification,
                "returned": returned,
            }
        )
    returned_doc = _as_int(_as_dict(answer.get("document")).get("id"))
    if returned_doc is not None and returned_doc != document_id:
        found.append({"field": "document.id", "requested": document_id, "returned": returned_doc})
    total = _as_float(answer.get("total"))
    if expected_total is not None and total is not None and abs(total - expected_total) > 1.0:
        found.append({"field": "total", "requested": expected_total, "returned": total})
    return found


def check_replay(
    answer: Mapping[str, Any],
    *,
    key_reusable: bool,
    earlier_answer: tuple[float, str | None] | None,
    reference: dt.datetime,
    mismatched: list[dict[str, Any]],
) -> ReplayCheck:
    """Decide whether a 2xx to ``POST /v1/invoices`` is Siigo replaying an older invoice.

    ``key_reusable`` is false for a key this server just generated at random: nobody can
    have used it before, so its answer is always a creation. Otherwise any of these proves a
    replay: this server already got a 2xx for the key, the invoice contradicts the request,
    or its ``metadata.created`` is older than the call (by more than ``REPLAY_MARGIN``).
    """
    check = ReplayCheck()
    created_raw = _as_dict(answer.get("metadata")).get("created")
    created = parse_timestamp(created_raw)
    if isinstance(created_raw, str):
        check.metadata_created = created_raw
    check.call_started = reference.astimezone(UTC).isoformat(timespec="seconds")
    if not key_reusable:
        return check
    if earlier_answer is not None:
        ago, invoice_id = earlier_answer
        same = f" (factura {invoice_id})" if invoice_id else ""
        check.reasons.append(
            f"este servidor ya había recibido hace {ago:.0f} s una respuesta exitosa de Siigo "
            f"con esta misma clave{same}"
        )
    if mismatched:
        check.mismatches = mismatched
        check.reasons.append(
            "la factura devuelta no corresponde a la pedida ("
            + "; ".join(
                f"{m['field']}: pedido {m['requested']}, devuelto {m['returned']}"
                for m in mismatched
            )
            + ")"
        )
    if created is not None and created < reference - dt.timedelta(seconds=REPLAY_MARGIN):
        check.reasons.append(
            f"su metadata.created ({created_raw}) es anterior al inicio de esta llamada "
            f"({check.call_started})"
        )
    check.replayed = bool(check.reasons)
    return check
