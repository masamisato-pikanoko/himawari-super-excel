from datetime import datetime
from pydantic import BaseModel, Field, model_validator
from .enums import JobStatus
from .hitl import HitlQuestion

class JobUpdate(BaseModel):
    job_id: str
    user_id: str
    job_type: str
    status: JobStatus
    progress: int = Field(ge=0, le=100)
    completed_steps: list[str] = Field(default_factory=list)
    pending_questions: list[HitlQuestion] = Field(default_factory=list)
    next_action: str | None = None
    output_refs: list[str] = Field(default_factory=list)
    event_id: str
    updated_at: datetime

    @model_validator(mode='after')
    def validate_wait_hitl(self):
        if self.status == JobStatus.WAIT_HITL and len(self.pending_questions) != 2:
            raise ValueError('WAIT_HITL requires exactly two pending questions')
        if self.status == JobStatus.DONE and self.progress != 100:
            raise ValueError('DONE requires progress=100')
        if self.status == JobStatus.DONE and not self.output_refs:
            raise ValueError('DONE requires at least one output reference')
        return self
