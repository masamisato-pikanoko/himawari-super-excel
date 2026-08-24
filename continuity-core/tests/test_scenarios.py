import json
from pathlib import Path


SCENARIOS = Path(__file__).parents[1] / "toolbox" / "super_himawari_toolbox" / "tests" / "scenarios"


def _read(name: str) -> dict:
    return json.loads((SCENARIOS / name).read_text(encoding="utf-8"))


def test_wait_hitl_scenario_keeps_expected_order():
    events = [item["event"] for item in _read("overnight_wait_hitl.json")["timeline"]]
    assert events == [
        "RECEIVED",
        "PROMISE_CREATED",
        "ACTIVE",
        "WAIT_HITL",
        "RESPONSE_RECEIVED",
        "RESUMED",
        "DONE",
    ]


def test_done_and_failed_scenarios_both_have_morning_carryover():
    done = [item["event"] for item in _read("overnight_done.json")["timeline"]]
    failed = [item["event"] for item in _read("overnight_failed.json")["timeline"]]
    assert "MORNING_DELIVERY" in done
    assert "MORNING_FAILURE_REPORT" in failed


def test_duplicate_click_scenario_starts_worker_once():
    scenario = _read("duplicate_click.json")
    keys = {
        (e["job_id"], e["question_id"], e["response_version"], e["event_id"])
        for e in scenario["events"]
    }
    assert len(keys) == scenario["expected_worker_starts"] == 1
