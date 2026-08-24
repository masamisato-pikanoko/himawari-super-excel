from datetime import datetime, timezone
import pytest
from pydantic import ValidationError
from src.contracts.enums import JobStatus
from src.contracts.job import JobUpdate
from src.contracts.hitl import HitlQuestion

def test_wait_hitl_requires_question():
    with pytest.raises(ValidationError):
        JobUpdate(job_id='EXCEL_042',user_id='u1',job_type='excel',status=JobStatus.WAIT_HITL,progress=82,pending_questions=[],event_id='e1',updated_at=datetime.now(timezone.utc))

def test_wait_hitl_requires_exactly_two_questions():
    with pytest.raises(ValidationError):
        JobUpdate(job_id='EXCEL_042',user_id='u1',job_type='excel',status=JobStatus.WAIT_HITL,progress=82,pending_questions=[HitlQuestion(question_id='Q1',text='どちらを採用しますか？')],event_id='e1',updated_at=datetime.now(timezone.utc))

def test_wait_hitl_with_two_questions_is_valid():
    job=JobUpdate(job_id='EXCEL_042',user_id='u1',job_type='excel',status=JobStatus.WAIT_HITL,progress=82,pending_questions=[HitlQuestion(question_id='Q1',text='どちらを採用しますか？'),HitlQuestion(question_id='Q2',text='空欄をどう扱いますか？')],event_id='e1',updated_at=datetime.now(timezone.utc))
    assert job.progress == 82

def test_done_requires_100_percent_and_output_reference():
    with pytest.raises(ValidationError):
        JobUpdate(job_id='EXCEL_042',user_id='u1',job_type='excel',status=JobStatus.DONE,progress=82,event_id='e2',updated_at=datetime.now(timezone.utc))
    job=JobUpdate(job_id='EXCEL_042',user_id='u1',job_type='excel',status=JobStatus.DONE,progress=100,output_refs=['drive://demo/result.xlsx'],event_id='e3',updated_at=datetime.now(timezone.utc))
    assert job.status == JobStatus.DONE
