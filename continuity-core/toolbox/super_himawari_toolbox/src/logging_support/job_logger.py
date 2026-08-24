import structlog

def configure_logging():
    structlog.configure(processors=[structlog.processors.TimeStamper(fmt='iso'), structlog.processors.add_log_level, structlog.processors.JSONRenderer()])

def get_job_logger(job_id: str, **context):
    return structlog.get_logger().bind(job_id=job_id, **context)
