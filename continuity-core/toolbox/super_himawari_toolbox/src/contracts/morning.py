from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field
from .enums import ActionMode

class MorningAction(BaseModel):
    action_id: str
    label: str
    action_type: str
    payload: dict[str, Any] = Field(default_factory=dict)

class MorningItem(BaseModel):
    item_id: str
    module_id: str
    user_id: str
    priority: int = Field(ge=0, le=100)
    title: str
    facts: list[str] = Field(default_factory=list)
    reason_code: str
    source_refs: list[str] = Field(default_factory=list)
    action_mode: ActionMode = ActionMode.VIEW_ONLY
    actions: list[MorningAction] = Field(default_factory=list)
    dedupe_key: str
    expires_at: datetime | None = None
    estimated_cost_yen: float | None = Field(default=None, ge=0)
