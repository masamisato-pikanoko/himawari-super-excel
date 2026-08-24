# Integration handoff and blind evaluation

Read this reference when joining Super Excel to another Himawari component, preparing a successor-thread handoff, or running the C/D/E challenge sequence.

## Integration boundary

Keep the deterministic workbook engine independent from employee-facing conversation code. Agree on a versioned job envelope before connecting components. At minimum it should carry:

- stable `job_id`, employee/source identity, receipt time, and original file references
- source SHA-256 values and per-file MIME type/name
- processing `status`, structured diagnostics, and exactly two HITL questions for a supported job
- stable `question_id` and `option_id` values, optional comments, and the same-job resume key
- preliminary/final artifact references, QA report reference, and explicit error code

Do not put raw workbook/image bytes, OCR dumps, API keys, tokens, webhook URLs, or private keys into the language-model request or integration logs. The exit model may naturalize approved structured text only; it may not change facts, counts, choices, links, or question count.

Before changing a live integration, read the repository handoff document if one exists and reverify all IDs, deployments, folders, schemas, and authentication state. Treat recorded live values as a dated snapshot, not permanent configuration.

## Pre-blind integration gate

Use A/B fixtures and synthetic jobs only until the integrated release candidate passes all of these:

- five independent jobs cannot mix employee, original, artifact, HITL, or history state
- intake returns the fixed acknowledgement without waiting for workbook processing
- supported jobs produce exactly two decision questions; unsupported structures stop as `needs_adapter`
- one answer cannot start completion; two valid answers resume the same job exactly once
- completion is posted only after the final file, hash, QA report, and Drive URL exist
- Chat cards, comments, queue state, completion link, and user-visible artifact all agree
- retries are idempotent and do not duplicate completed artifacts or overwrite originals
- every populated output sheet is rendered and checked; formula errors and workbook package objects are counted

Freeze the release candidate after this gate. Do not tune with C/D/E.

## C/D/E sequence

Open only one challenge at a time after the user explicitly starts the blind evaluation.

1. Copy C into an isolated job and record its hash without opening hidden answer material.
2. Run the frozen release candidate without adapter edits. Score preservation, detection, formulas, evidence, two-question quality, resume, QA, and delivery.
3. Classify failures as an engine defect, an integration defect, or an unsupported business rule. Fix only reusable structure/semantic logic; never hard-code challenge values.
4. Freeze again, then repeat with D.
5. Keep E untouched until the final candidate is frozen. Treat E as the graduation test and record the pre-run code revision and configuration snapshot.

Keep machine correctness, employee/Copilot usability, and human readability as separate results. A visually pleasant workbook does not prove factual correctness, and a mechanically valid workbook does not prove that a human can use it.

## Stop conditions

Stop and ask the user at a real authorization screen, a missing business decision, a destructive replacement request, an unknown integration contract, or a challenge structure that cannot be handled without post-hoc tuning. Preserve the isolated input and failure evidence.
