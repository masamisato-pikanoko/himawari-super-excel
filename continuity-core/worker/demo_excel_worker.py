"""スーパーひまわり Continuity Core用の決定論的ダミーWorker。"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TOOLBOX_ROOT = PROJECT_ROOT / "toolbox" / "super_himawari_toolbox"
if str(TOOLBOX_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLBOX_ROOT))

from src.contracts.enums import JobStatus  # noqa: E402
from src.contracts.hitl import HitlQuestion  # noqa: E402
from src.contracts.job import JobUpdate  # noqa: E402

TOKYO = ZoneInfo("Asia/Tokyo")
JOB_ID = "EXCEL_DEMO_001"
USER_ID = "USER_DEMO_001"
JOB_TYPE = "EXCEL_CLEANUP"
OUTPUT_REF = "drive://demo/絶望Excel_営業部_A_改訂版.xlsx"


def _question(
    question_id: str,
    text: str,
    labels: list[str],
    option_ids: list[str],
    reason: str,
    impact: str,
    recommended_option_id: str,
) -> HitlQuestion:
    return HitlQuestion(
        question_id=question_id,
        text=text,
        options=labels,
        metadata={
            "option_ids": option_ids,
            "reason": reason,
            "impact": impact,
            "recommended_option_id": recommended_option_id,
        },
    )


def build_wait_hitl_update(now: datetime | None = None) -> JobUpdate:
    updated_at = now or datetime.now(TOKYO)
    return JobUpdate(
        job_id=JOB_ID,
        user_id=USER_ID,
        job_type=JOB_TYPE,
        status=JobStatus.WAIT_HITL,
        progress=82,
        completed_steps=["シート構成の確認", "列名の正規化", "空行の整理"],
        pending_questions=[
            _question(
                "Q1",
                "商品コードが重複した場合、更新日の新しい方を採用しますか？",
                ["更新日の新しい方", "元ファイルを優先"],
                ["Q1_NEWEST", "Q1_ORIGINAL"],
                "重複した商品コードの採用基準は業務判断が必要なためです。",
                "重複している商品コードの行に影響します。",
                "Q1_NEWEST",
            ),
            _question(
                "Q2",
                "空欄の担当部署は『未設定』として残しますか？",
                ["未設定として残す", "該当行を確認対象にする"],
                ["Q2_UNSET", "Q2_REVIEW"],
                "空欄を確定値へ変える権限がWorkerにはないためです。",
                "担当部署が空欄の行に影響します。",
                "Q2_REVIEW",
            ),
        ],
        next_action="WAIT_FOR_USER",
        event_id="evt_worker_wait_hitl_001",
        updated_at=updated_at,
    )


def _validate_answers(answers: dict[str, str]) -> None:
    expected = {"Q1": "Q1_NEWEST", "Q2": "Q2_REVIEW"}
    if answers != expected:
        raise ValueError(f"demo answers must equal {expected!r}")


def build_done_update(
    answers: dict[str, str], now: datetime | None = None
) -> JobUpdate:
    _validate_answers(answers)
    updated_at = now or datetime.now(TOKYO)
    return JobUpdate(
        job_id=JOB_ID,
        user_id=USER_ID,
        job_type=JOB_TYPE,
        status=JobStatus.DONE,
        progress=100,
        completed_steps=[
            "シート構成の確認",
            "列名の正規化",
            "空行の整理",
            "HITL回答の反映",
            "改訂版の生成",
        ],
        pending_questions=[],
        next_action="DELIVER",
        output_refs=[OUTPUT_REF],
        event_id="evt_worker_done_001",
        updated_at=updated_at,
    )


def write_update(update: JobUpdate, output_path: Path) -> str:
    payload = update.model_dump_json(indent=2)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(payload + "\n", encoding="utf-8")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["wait-hitl", "done"], required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "artifacts" / "demo_worker_result.json",
    )
    parser.add_argument("--answers-json", type=Path)
    args = parser.parse_args()

    if args.mode == "wait-hitl":
        update = build_wait_hitl_update()
    else:
        if not args.answers_json:
            parser.error("--answers-json is required for done mode")
        answers = json.loads(args.answers_json.read_text(encoding="utf-8"))
        update = build_done_update(answers)

    print(write_update(update, args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
