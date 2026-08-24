from src.resilience.idempotency import InMemoryIdempotencyStore, make_idempotency_key

def test_duplicate_event_is_claimed_once():
    store=InMemoryIdempotencyStore(); key=make_idempotency_key('EXCEL_042','HITL_RESPONSE_RECEIVED','Q1',1)
    assert store.claim(key) is True
    assert store.claim(key) is False

def test_event_type_is_part_of_the_key():
    answer=make_idempotency_key('EXCEL_042','HITL_RESPONSE_RECEIVED','Q1',1)
    resume=make_idempotency_key('EXCEL_042','WORKER_RESUMED','Q1',1)
    assert answer != resume
