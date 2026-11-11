import sys
from pathlib import Path

# Add apps/ml to sys.path so core can be imported
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import handlers

def test_health_check():
    res = handlers.health()
    assert res is not None
    assert res.get("status") == "ok"
    assert "service_version" in res

