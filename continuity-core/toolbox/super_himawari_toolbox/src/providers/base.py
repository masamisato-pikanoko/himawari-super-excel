from typing import Protocol
from src.contracts.morning import MorningItem
class MorningModule(Protocol):
    module_id: str
    def collect(self, user_id: str) -> list[MorningItem]: ...
