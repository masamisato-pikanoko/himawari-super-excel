---
name: himawari-super-excel
description: Preserve, diagnose, repair, and batch-process messy Excel workbooks plus receipt images, then reduce uncertain business decisions to exactly two Google Chat HITL questions. Use for Himawari overnight Excel intake, A/B adapter work, post-answer resume, or C/D/E blind evaluation; do not use for ordinary one-cell edits or live Excel control.
---

# Himawari Super Excel

Process employee workbooks as an auditable overnight pipeline. Treat the program as the decision engine; use a language model only at the employee-facing exit unless the user changes that boundary.

## Invariants

- Never overwrite the received workbook. Copy it into a per-job `original/` folder and record SHA-256 before inspection.
- Keep workbook files, images, OCR, reports, answers, and completed outputs in separate job folders. Never put API keys, webhook URLs, tokens, or private-key material in workbooks, logs, reports, or deliverables.
- Preserve formulas, embedded images, drawings, charts, macros, external links, styles, and sheet names unless a verified repair requires a change. Count package parts before and after.
- Make only high-confidence structural repairs automatically. Conflicting business facts, duplicate meaning, and source-of-truth decisions go to HITL.
- Produce exactly two high-information HITL questions per supported job. Each question must include reason, impact, 2–3 stable option IDs, and one recommendation.
- After answers, resume from the preliminary workbook, retain the raw sheets, add an answer/audit sheet, and write a new completed workbook.
- Use synthetic answers to test decision branches. Never substitute synthetic answers for the employee's real HITL decision.
- Keep C/D/E challenge files untouched until the user explicitly starts the final blind evaluation. Do not use them to tune adapters.

## Execution routing

For intake, batch processing, or deployment, read [references/runbook.md](references/runbook.md). For HITL and report payloads, read [references/contracts.md](references/contracts.md).

The reusable engine is in `scripts/super-excel/`. Copy it to a workspace `work/` directory before execution, load the bundled spreadsheet runtime, and link that runtime's `node_modules` into the copied engine. Use the human shelf-label entrypoints:

- `mazukore_yakan_excel_wo_uketsukeru.mjs` for one workbook.
- `mazukore_5ninbun_wo_yakan_shori.mjs` for an inbox tree.
- `tsugikore_HITL_kaitou_de_shiageru.mjs` after two answers.

Use `@oai/artifact-tool` for `.xlsx` reading/writing and render every sheet for visual QA. Use Azure Document Intelligence for receipt OCR when images are present; fetch credentials at runtime and never save the key.

Stop at a real authorization/consent screen, missing business authority, or an unsupported adapter that cannot be handled safely. A runtime failure is not a reason to modify the original.
