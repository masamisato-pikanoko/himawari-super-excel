from dataclasses import dataclass, field
from hashlib import sha256

def make_idempotency_key(*parts: object) -> str:
    raw = '|'.join(str(p) for p in parts)
    return sha256(raw.encode('utf-8')).hexdigest()

@dataclass
class InMemoryIdempotencyStore:
    """テスト用。本番の正本は GASgraph / Sheets / Cloud Tasks 等へ差し替える。"""
    seen: set[str] = field(default_factory=set)
    def claim(self, key: str) -> bool:
        if key in self.seen: return False
        self.seen.add(key); return True
