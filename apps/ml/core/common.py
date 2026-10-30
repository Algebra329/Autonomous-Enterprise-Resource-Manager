"""Shared helpers and input limits for the advisory ML service."""
from datetime import datetime, timezone

MAX_OFFERS, MAX_SEATS, MAX_PURCHASES, MAX_ASSETS = 500, 5000, 5000, 10000


class InputError(ValueError):
    """Bad or oversized input. The API maps this to HTTP 422."""


def parse_ts(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError as e:
        raise InputError(f"bad timestamp: {s!r}") from e
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def need(d, key, where):
    if key not in d:
        raise InputError(f"{where}: missing '{key}'")
    return d[key]
