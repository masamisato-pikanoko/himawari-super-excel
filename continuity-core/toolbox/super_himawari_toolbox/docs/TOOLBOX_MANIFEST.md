# Toolbox Manifest

## S優先
Pydantic / Google Workspace公式Python samples / pytest / Freezegun / Tenacity

## A優先
HTTPX / RESPX / structlog / Hypothesis / google-genai

## B候補
FastAPI / Cloud Tasks / Cloud Run Jobs / holidays

## 初号機では採用しない
PostgreSQL / LangGraph / APScheduler / transitions / python-statemachine / Celery / Prefect / Temporal / Dagster

理由: GASgraphの状態管理と責任が重なり、Sheetsを見れば分かる利点を薄めるため。
