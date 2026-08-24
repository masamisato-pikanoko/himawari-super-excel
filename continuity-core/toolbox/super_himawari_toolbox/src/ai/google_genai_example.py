from src.ai.renderer_contract import RenderedBrief
from src.contracts.morning import MorningItem

def render_with_ai(items: list[MorningItem], user_name: str) -> RenderedBrief:
    """google-genai structured outputをここへ接続する。AIは事実・件数・action idを発明しない。失敗時はfallback_render。"""
    raise NotImplementedError('Connect google-genai after the non-AI flow passes.')
