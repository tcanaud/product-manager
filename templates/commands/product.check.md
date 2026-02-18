---
description: Detect drift and integrity issues — status desync, stale feedbacks, orphaned backlogs, broken chains, index desync, duplicate IDs.
handoffs:
  - label: Triage feedbacks
    agent: product.triage
    prompt: Triage new feedbacks into backlogs
    send: true
  - label: View dashboard
    agent: product.dashboard
    prompt: View product health dashboard
    send: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

Detect inconsistencies in the `.product/` directory: status/directory desync, stale feedbacks, orphaned backlogs, broken traceability chains, index desync, and duplicate IDs. This is the self-testing mechanism for the product management system.

## Execution Flow

### 1. Validate environment

- Check that `.product/` directory exists. If not → **ERROR**: "Product directory not initialized."
- Check if `.product/` is empty (no feedbacks, no backlogs) → **INFO**: "Product directory is empty. No checks to perform." → STOP

### 2. Scan all files

Read all files from:
- `.product/feedbacks/new/`, `triaged/`, `excluded/`, `resolved/`
- `.product/backlogs/open/`, `in-progress/`, `done/`, `promoted/`, `cancelled/`

For each file, parse the YAML frontmatter. Track all findings.

### 3. Check 1 — Status/directory desync

For each feedback file in all `feedbacks/` subdirectories:
- Read the `status` field from frontmatter
- Compare against the directory name the file resides in
- The directory name IS the canonical status:
  - `new/` → status should be `"new"`
  - `triaged/` → status should be `"triaged"`
  - `excluded/` → status should be `"excluded"`
  - `resolved/` → status should be `"resolved"`
- If mismatch → finding: **STATUS_DESYNC** (severity: WARNING)
  - File path, expected status (from directory), actual status (from frontmatter)
  - Fix: "Update frontmatter `status` to \"{expected}\""

For each backlog file in all `backlogs/` subdirectories:
- Same check: directory name must match `status` field
  - `open/` → `"open"`, `in-progress/` → `"in-progress"`, `done/` → `"done"`, `promoted/` → `"promoted"`, `cancelled/` → `"cancelled"`

### 4. Check 2 — Stale feedbacks

For each feedback in `feedbacks/new/`:
- Read the `created` date
- Calculate days since creation: today - created
- If > 14 days → finding: **STALE_FEEDBACK** (severity: WARNING)
  - File path, created date, days since creation
  - Fix: "Run `/product.triage` to process stale feedbacks"

### 5. Check 3 — Orphaned backlogs

For each backlog file in any status directory:
- Read the `feedbacks[]` array from frontmatter
- For each listed feedback ID, search for the file across ALL `feedbacks/` subdirectories
- If **ALL** listed feedbacks are missing → finding: **ORPHANED_BACKLOG** (severity: WARNING)
  - Backlog file path, missing feedback IDs
  - Fix: "Remove broken references or recreate the missing feedbacks"
- If **SOME** listed feedbacks are missing → finding: **PARTIAL_ORPHAN** (severity: INFO)
  - Backlog file path, missing feedback IDs, existing feedback IDs
  - Fix: "Remove broken reference(s) from feedbacks[] array"

### 6. Check 4 — Broken traceability chains

**Feedback → Backlog:**
For each feedback with non-empty `linked_to.backlog[]`:
- For each referenced backlog ID, search across ALL `backlogs/` subdirectories
- If not found → finding: **BROKEN_CHAIN_FB_TO_BL** (severity: ERROR)
  - Feedback file path, missing backlog ID
  - Fix: "Remove broken reference or create the missing backlog"

**Backlog → Feature:**
For each backlog with non-empty `features[]`:
- For each referenced feature ID, check if `.features/{feature_id}.yaml` exists
- If not found → finding: **BROKEN_CHAIN_BL_TO_FEAT** (severity: ERROR)
  - Backlog file path, missing feature ID
  - Fix: "Remove broken reference or create the missing feature"

### 7. Check 5 — Index consistency

Read `.product/index.yaml` and compare against actual filesystem state:

- Compare `feedbacks.total` against actual file count
- Compare `feedbacks.by_status.*` against actual directory counts
- Compare `backlogs.total` against actual file count
- Compare `backlogs.by_status.*` against actual directory counts
- Compare `feedbacks.items[]` list against actual files

If any mismatch → finding: **INDEX_DESYNC** (severity: WARNING)
  - What's different (expected vs actual)
  - Fix: Auto-rebuild the index from filesystem state

If index desync is detected, rebuild `index.yaml` from the filesystem:
1. Count all feedbacks by status directory
2. Count all backlogs by status directory
3. Read category from each feedback for category distribution
4. Build items arrays from all files
5. Recalculate metrics
6. Write the rebuilt index

### 8. Check 6 — ID uniqueness

Scan all feedback files and collect all `id` fields:
- If any duplicate `id` values found → finding: **DUPLICATE_ID** (severity: ERROR)
  - The duplicate ID, all file paths containing it
  - Fix: "Rename one of the duplicate files and update the id field"

Same for backlog files.

### 9. Compile and classify findings

Group findings by severity:
- **ERROR**: Issues that break traceability or data integrity (must fix)
- **WARNING**: Issues that indicate drift or neglect (should fix)
- **INFO**: Minor issues or informational notes (nice to fix)

### 10. Output report

```markdown
## Product Health Check

**Date**: {today's date}
**Scanned**: {feedback_count} feedbacks, {backlog_count} backlogs

### Summary

| Severity | Count |
|----------|-------|
| ERROR | {count} |
| WARNING | {count} |
| INFO | {count} |

### Findings

{For each finding, numbered sequentially:}

#### FINDING-{NNN} [{severity}] {type}
- **File**: {file path}
- **{detail key}**: {detail value}
- **Fix**: {suggested remediation}

### Verdict

**PASS** — No errors found. {warning_count} warning(s) to review.
or
**FAIL** — {error_count} error(s) require action.
```

If no findings at all:
```markdown
## Product Health Check

**Date**: {today's date}
**Scanned**: {feedback_count} feedbacks, {backlog_count} backlogs

**PASS** — Zero findings. Product data is consistent.
```

## Error Handling

- `.product/` missing → ERROR with init instructions
- Empty `.product/` → INFO, no checks to perform
- Unparseable file (malformed frontmatter) → WARN, skip file, report as finding
- `.features/` missing when checking backlog→feature links → skip those checks, note in report

## Rules

- This command is **READ-ONLY** except for `index.yaml` rebuild when desync is detected
- ALWAYS check ALL six categories of issues
- ALWAYS number findings sequentially (FINDING-001, FINDING-002, ...)
- ALWAYS provide a suggested fix for each finding
- Verdict is **FAIL** if ANY error-severity findings exist
- Verdict is **PASS** if only warnings or info findings (or none)
- NEVER modify feedback or backlog files — only report findings
- NEVER skip checks — run all 6 checks every time
