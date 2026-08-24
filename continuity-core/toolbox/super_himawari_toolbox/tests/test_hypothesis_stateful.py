from hypothesis.stateful import RuleBasedStateMachine, invariant, rule
from src.contracts.enums import JobStatus
from src.testing_support.state_rules import can_transition

class JobMachine(RuleBasedStateMachine):
    def __init__(self): super().__init__(); self.status=JobStatus.RECEIVED
    @rule()
    def try_progress(self):
        for target in [JobStatus.QUEUED,JobStatus.ACTIVE,JobStatus.WAIT_HITL,JobStatus.DONE,JobStatus.CLOSED]:
            if can_transition(self.status,target): self.status=target; break
    @invariant()
    def closed_never_leaves_terminal(self):
        if self.status == JobStatus.CLOSED:
            assert not any(can_transition(self.status,target) for target in JobStatus)
TestJobMachine=JobMachine.TestCase
