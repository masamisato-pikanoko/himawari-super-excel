from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
RETRYABLE=(TimeoutError, ConnectionError)

def transient_retry(max_attempts: int = 4):
    return retry(retry=retry_if_exception_type(RETRYABLE), stop=stop_after_attempt(max_attempts), wait=wait_exponential(multiplier=1,min=1,max=8), reraise=True)
