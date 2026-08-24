from src.contracts.enums import JobStatus
ALLOWED={
JobStatus.RECEIVED:{JobStatus.QUEUED,JobStatus.ACTIVE,JobStatus.CLOSED},
JobStatus.QUEUED:{JobStatus.ACTIVE,JobStatus.RETRY_WAIT,JobStatus.FAILED,JobStatus.CLOSED},
JobStatus.ACTIVE:{JobStatus.WAIT_HITL,JobStatus.READY,JobStatus.DONE,JobStatus.RETRY_WAIT,JobStatus.FAILED},
JobStatus.WAIT_HITL:{JobStatus.ACTIVE,JobStatus.CLOSED,JobStatus.FAILED},
JobStatus.READY:{JobStatus.DONE,JobStatus.FAILED},
JobStatus.RETRY_WAIT:{JobStatus.ACTIVE,JobStatus.FAILED,JobStatus.CLOSED},
JobStatus.FAILED:{JobStatus.RETRY_WAIT,JobStatus.CLOSED},
JobStatus.DONE:{JobStatus.CLOSED},
JobStatus.CLOSED:set(),}

def can_transition(current: JobStatus, target: JobStatus) -> bool:
    return target in ALLOWED[current]
