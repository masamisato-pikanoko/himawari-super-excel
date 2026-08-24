from pydantic import BaseModel, Field
from src.contracts.morning import MorningItem

class RenderedBrief(BaseModel):
    greeting: str
    intro: str
    item_lines: list[str] = Field(default_factory=list)
    closing: str = ''

def fallback_render(items: list[MorningItem], user_name: str) -> RenderedBrief:
    ordered=sorted(items,key=lambda x:x.priority,reverse=True)
    return RenderedBrief(greeting=f'おはようございます、{user_name}さん！', intro=f'今日まず確認したいことは{len(ordered)}件です。', item_lines=[f'・{item.title}' for item in ordered], closing='必要な項目から確認できます。')
