from datetime import datetime
from typing import Any
from pydantic import BaseModel
from .enums import FeedbackScope

class FeedbackRecord(BaseModel):
    feedback_id: str
    job_id: str
    user_id: str
    job_type: str
    original_value: Any
    corrected_value: Any
    scope: FeedbackScope
    consent_event_id: str
    created_at: datetime
