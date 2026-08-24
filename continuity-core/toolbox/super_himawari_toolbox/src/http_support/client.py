import httpx
DEFAULT_TIMEOUT=httpx.Timeout(10.0, connect=5.0)

def make_client(base_url: str | None = None) -> httpx.Client:
    return httpx.Client(base_url=base_url or '', timeout=DEFAULT_TIMEOUT, follow_redirects=True, headers={'User-Agent':'super-himawari/0.1'})
