"""Unit tests for the invoice Idempotency-Key bookkeeping and replay detection."""

from __future__ import annotations

import datetime as dt

import pytest
from conftest import FakeClock

from siigo_mcp.idempotency import (
    PENDING_KEY_TTL,
    REPLAY_MARGIN,
    InvoiceKeyMemory,
    call_reference,
    check_replay,
    mismatches,
    parse_http_date,
    parse_timestamp,
)

UTC = dt.timezone.utc
NOON = dt.datetime(2026, 10, 5, 17, 0, 0, tzinfo=UTC)  # 12:00 in Bogotá


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2025-07-10T20:48:59.8634833+00:00", dt.datetime(2025, 7, 10, 20, 48, 59, 863483, UTC)),
        ("2020-06-15T03:33:17.208Z", dt.datetime(2020, 6, 15, 3, 33, 17, 208000, UTC)),
        ("2024-05-23T12:57:42.0000000+00:00", dt.datetime(2024, 5, 23, 12, 57, 42, 0, UTC)),
        ("2026-10-05T12:00:00-05:00", NOON),
        # No offset: read as Colombian time, the later of the two plausible readings.
        ("2026-10-05T12:00:00", NOON),
        ("2026-10-05 12:00:00.5", NOON + dt.timedelta(milliseconds=500)),
    ],
)
def test_parse_timestamp_accepts_siigo_formats(value, expected):
    assert parse_timestamp(value) == expected


@pytest.mark.parametrize("value", [None, "", "2026-10-05", "2026-13-05T00:00:00Z", 17, "ayer"])
def test_parse_timestamp_rejects_garbage(value):
    assert parse_timestamp(value) is None


def test_parse_http_date_and_call_reference():
    assert parse_http_date("Mon, 05 Oct 2026 17:00:00 GMT") == NOON
    assert parse_http_date("not a date") is None and parse_http_date(None) is None
    local = NOON + dt.timedelta(hours=5)  # a computer clock five hours ahead
    info = {"date": "Mon, 05 Oct 2026 17:00:00 GMT", "elapsed": 9.0}
    assert call_reference(local, info) == NOON - dt.timedelta(seconds=10)  # Siigo's clock
    assert call_reference(local, {}) == local  # no Date header: the local time


def answer(created: dt.datetime | None = None, **extra):
    data = {"id": "inv-1", "customer": {"identification": "222222222222"}, "total": 23800}
    if created is not None:
        data["metadata"] = {"created": created.isoformat()}
    return data | extra


def test_check_replay_by_metadata_created_respects_the_margin():
    old = answer(NOON - dt.timedelta(seconds=REPLAY_MARGIN + 5))
    recent = answer(NOON - dt.timedelta(seconds=REPLAY_MARGIN - 5))
    kwargs = {"earlier_answer": None, "reference": NOON, "mismatched": []}
    assert check_replay(old, key_reusable=True, **kwargs).replayed
    assert not check_replay(recent, key_reusable=True, **kwargs).replayed
    assert not check_replay(answer(), key_reusable=True, **kwargs).replayed  # no metadata


def test_check_replay_never_flags_a_freshly_generated_key():
    """Nobody can have used a random key before: its answer is always a creation."""
    old = answer(NOON - dt.timedelta(days=3))
    check = check_replay(
        old,
        key_reusable=False,
        earlier_answer=(10.0, "inv-0"),
        reference=NOON,
        mismatched=[{"field": "total", "requested": 1, "returned": 2}],
    )
    assert not check.replayed and check.reasons == []


def test_check_replay_by_earlier_answer_or_mismatch():
    by_answer = check_replay(
        answer(), key_reusable=True, earlier_answer=(30.0, "inv-1"), reference=NOON, mismatched=[]
    )
    assert by_answer.replayed and "inv-1" in by_answer.reasons[0]
    found = mismatches(
        answer(document={"id": 9}),
        customer_identification="13832081",
        document_id=24446,
        expected_total=23800.0,
    )
    assert {m["field"] for m in found} == {"customer.identification", "document.id"}
    by_content = check_replay(
        answer(), key_reusable=True, earlier_answer=None, reference=NOON, mismatched=found
    )
    assert by_content.replayed and by_content.evidence()["mismatches"] == found


def test_mismatches_ignore_missing_fields_and_cent_rounding():
    assert (
        mismatches({"id": "x"}, customer_identification="1", document_id=1, expected_total=10.0)
        == []
    )
    close = answer(total=23800.4)
    assert (
        mismatches(
            close, customer_identification="222222222222", document_id=1, expected_total=23800.0
        )
        == []
    )
    assert mismatches(  # total unknown (not a simple invoice): never compared
        answer(total=1), customer_identification="222222222222", document_id=1,
        expected_total=None,
    ) == []  # fmt: skip


def test_memory_pending_keys_expire_and_are_forgotten():
    clock = FakeClock()
    memory = InvoiceKeyMemory(clock)
    memory.remember("body", "K1")
    clock.now += PENDING_KEY_TTL - 10
    memory.remember("body", "K1")  # sent again: the window restarts from this attempt
    clock.now += 60
    entry = memory.pending("body")
    assert entry is not None and entry.key == "K1" and memory.age(entry) == 60
    memory.forget("body", "OTHER")  # only the key it holds is forgotten
    assert memory.pending("body") is not None
    memory.forget("body", "K1")
    assert memory.pending("body") is None
    memory.remember("body", "K2")
    clock.now += PENDING_KEY_TTL + 1
    assert memory.pending("body") is None


def test_memory_records_the_first_answer_per_key():
    clock = FakeClock()
    memory = InvoiceKeyMemory(clock)
    assert memory.answered("K") is None
    memory.record_answer("K", "inv-1")
    clock.now += 5
    memory.record_answer("K", "inv-2")
    assert memory.answered("K") == (5.0, "inv-1")
    memory.record_answer("U", None)  # 2xx whose body could not be read
    assert memory.answered("U") == (0.0, None)
