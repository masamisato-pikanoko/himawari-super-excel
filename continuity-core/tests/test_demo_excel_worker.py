from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from worker.demo_excel_worker import (
    OUTPUT_REF,
    build_done_update,
    build_wait_hitl_update,
)


def test_wait_hitl_payload_has_exactly_two_structured_questions():
    update = build_wait_hitl_update(datetime(2026, 8, 25, 6, 18, tzinfo=ZoneInfo("Asia/Tokyo")))
    assert update.progress == 82
    assert len(update.pending_questions) == 2
    for question in update.pending_questions:
        assert len(question.options) in (2, 3)
        assert question.metadata["reason"]
        assert question.metadata["impact"]
        assert question.metadata["recommended_option_id"] in question.metadata["option_ids"]


def test_done_payload_requires_both_expected_answers():
    with pytest.raises(ValueError):
        build_done_update({"Q1": "Q1_NEWEST"})


def test_done_payload_is_complete_and_has_output_ref():
    update = build_done_update({"Q1": "Q1_NEWEST", "Q2": "Q2_REVIEW"})
    assert update.progress == 100
    assert update.output_refs == [OUTPUT_REF]
    assert update.pending_questions == []
