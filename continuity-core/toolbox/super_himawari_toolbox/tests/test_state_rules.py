from src.contracts.enums import JobStatus
from src.testing_support.state_rules import can_transition

def test_done_cannot_resume(): assert can_transition(JobStatus.DONE,JobStatus.ACTIVE) is False
def test_wait_hitl_can_resume(): assert can_transition(JobStatus.WAIT_HITL,JobStatus.ACTIVE) is True
def test_closed_is_terminal():
    for target in JobStatus: assert can_transition(JobStatus.CLOSED,target) is False
