from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field

class HitlQuestion(BaseModel):
    question_id: str
    text: str
    options: list[str] = Field(default_factory=list)
    required: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)

class HitlResponse(BaseModel):
    event_id: str
    job_id: str
    question_id: str
    user_id: str
    response_version: int = 1
    answer: Any
    received_at: datetime
