from datetime import datetime
from pydantic import BaseModel
from .enums import PromiseStatus

class Promise(BaseModel):
    promise_id: str
    job_id: str
    user_id: str
    promised_at: datetime
    due_at: datetime
    promise_type: str
    expected_output: str
    status: PromiseStatus = PromiseStatus.OPEN
    fulfilled_at: datetime | None = None
    note: str | None = None
