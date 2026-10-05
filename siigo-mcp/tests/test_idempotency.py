"""Unit tests for the invoice replay reporting (timestamps, replay check, answered keys)."""

from __future__ import annotations

import datetime as dt

import pytest

from siigo_mcp.idempotency import (
    MAX_KEYS,
    REPLAY_MARGIN,
    AnsweredKeys,
    call_reference,
    check_replay,
    differences,
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
        ("2026-10-05T22:30:00+0530", NOON),
        # No offset: read as Colombian time, the later of the two plausible readings.
        ("2026-10-05T12:00:00", NOON),
        ("2026-10-05 12:00:00.5", NOON + dt.timedelta(milliseconds=500)),
    ],
)
def test_parse_timestamp_accepts_siigo_formats(value, expected):
    assert parse_timestamp(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        17,
        "ayer",
        "2026-10-05",
        "2026-13-05T00:00:00Z",
        "2026-02-30T00:00:00Z",
        # Offsets out of range: datetime.timezone raised ValueError (the tool crashed after
        # Siigo had created the invoice).
        "2026-10-05T12:00:00+24:00",
        "2026-10-05T12:00:00+23:99",
        "2026-10-05T12:00:00-99:00",
        "2026-10-05T12:00:00+00:60",
        # Representable locally, but not in UTC: astimezone raised OverflowError.
        "0001-01-01T00:00:00+05:00",
        "9999-12-31T23:59:59-05:00",
        "٢٠٢٦-10-05T12:00:00Z",  # non-ASCII digits
    ],
)
def test_parse_timestamp_returns_none_for_anything_malformed(value):
    assert parse_timestamp(value) is None


def test_parse_http_date_and_call_reference():
    assert parse_http_date("Mon, 05 Oct 2026 17:00:00 GMT") == NOON
    assert parse_http_date("not a date") is None and parse_http_date(None) is None
    local = NOON + dt.timedelta(hours=5)  # a computer clock five hours ahead
    info = {"date": "Mon, 05 Oct 2026 17:00:00 GMT", "elapsed": 9.0}
    assert call_reference(local, info) == NOON - dt.timedelta(seconds=10)  # Siigo's clock
    assert call_reference(local, {}) == local  # no Date header: the local time
    # Nothing raises: an elapsed time that cannot be subtracted falls back to local time.
    assert call_reference(local, info | {"elapsed": 1e20}) == local
    assert call_reference(local, info | {"elapsed": "x"}) == local


def answer(created: str | dt.datetime | None = None, **extra):
    data = {"id": "inv-1", "customer": {"identification": "222222222222"}, "total": 23800}
    if created is not None:
        stamp = created.isoformat() if isinstance(created, dt.datetime) else created
        data["metadata"] = {"created": stamp}
    return data | extra


def test_check_replay_by_metadata_created_respects_the_margin():
    old = answer(NOON - dt.timedelta(seconds=REPLAY_MARGIN + 5))
    recent = answer(NOON - dt.timedelta(seconds=REPLAY_MARGIN - 5))
    replayed, reason = check_replay(old, earlier_id=None, reference=NOON)
    assert replayed is True and "metadata.created" in reason
    assert check_replay(recent, earlier_id=None, reference=NOON)[0] is False
    assert (
        check_replay(answer(NOON + dt.timedelta(hours=1)), earlier_id=None, reference=NOON)[0]
        is False
    )


@pytest.mark.parametrize(
    "created", [None, "", "ayer", "2026-10-05T12:00:00+24:00", "2026-10-05T12:00:00+23:99"]
)
def test_check_replay_is_unknown_without_a_readable_timestamp(created):
    data = answer() if created is None else answer(created)
    replayed, reason = check_replay(data, earlier_id=None, reference=NOON)
    assert replayed is None and "metadata.created" in reason


def test_check_replay_never_raises_on_odd_answers():
    for data in ({}, {"metadata": "x"}, {"metadata": {"created": 5}}, {"id": None}):
        assert check_replay(data, earlier_id="inv-1", reference=NOON)[0] is None
    extreme = dt.datetime(1, 1, 1, 0, 1, tzinfo=UTC)  # the margin cannot be subtracted
    assert check_replay(answer(NOON), earlier_id=None, reference=extreme)[0] is None


def test_check_replay_by_an_earlier_answer_for_the_same_invoice():
    recent = answer(NOON)  # the timestamp alone would say "not a replay"
    replayed, reason = check_replay(recent, earlier_id="inv-1", reference=NOON)
    assert replayed is True and "ya había recibido" in reason
    # A different invoice under the same key (Siigo forgot the key): the timestamp decides.
    assert check_replay(recent, earlier_id="inv-0", reference=NOON)[0] is False


def test_answered_keys_keep_the_first_id_and_stay_bounded():
    keys = AnsweredKeys()
    keys.add("K", None)  # an answer without id proves nothing
    assert keys.get("K") is None
    keys.add("K", "inv-1")
    keys.add("K", "inv-2")
    assert keys.get("K") == "inv-1"
    for n in range(MAX_KEYS):
        keys.add(f"X{n}", n)
    assert keys.get("K") is None and keys.get(f"X{MAX_KEYS - 1}") == str(MAX_KEYS - 1)


BODY = {
    "document": {"id": 24446},
    "date": "2099-01-01",
    "customer": {"identification": "13832081", "branch_office": 0},
    "items": [{"code": "Item-1", "quantity": 1.0, "price": 1069.77}],
}


@pytest.mark.parametrize(
    "answer",
    [{}, {"customer": "x", "document": [], "items": "x", "total": "abc", "date": 5},
     {"customer": {"identification": None, "branch_office": "x"}, "document": {"id": True}},
     {"items": [1, None]}, {"items": [{"code": {"a": 1}, "quantity": "1"}]},
     {"items": [{"code": "Item-1", "quantity": "inf"}]}, {"date": "ayer"},
     {"total": float("nan")}, {"total": 10**400}, {"customer": {"identification": "\ud800"}}],
)  # fmt: skip
def test_differences_never_raises_on_odd_answers(answer):
    found = differences(answer, BODY, 1273.03)
    assert isinstance(found, list)
    assert {d["field"] for d in found} <= {"customer.identification"}


def test_differences_compares_only_what_the_answer_carries():
    assert differences({"id": "x", "total": 1273.03}, BODY, None) == []
    found = differences({"total": 1190.0}, BODY, 1273.03)
    assert found == [{"field": "total", "requested": 1273.03, "returned": 1190.0}]
    two = {"items": [{"code": "Item-1", "quantity": 1}, {"code": "Item-1", "quantity": 1}]}
    assert differences(two, BODY, None)[0]["field"] == "items"
