---
description: View product health dashboard — status counts, category distribution, conversion metrics, and warnings.
handoffs:
  - label: Triage feedbacks
    agent: product.triage
    prompt: Triage new feedbacks into backlogs
    send: true
  - label: Check health
    agent: product.check
    prompt: Run product health check
    send: true
  - label: Browse backlogs
    agent: product.backlog
    prompt: List all backlogs
    send: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

- If `$ARGUMENTS` contains `--json`: output structured JSON instead of Markdown
- Otherwise: output Markdown dashboard

## Purpose

Read-only command that displays a complete product health overview: feedback counts by status, backlog counts by status, category distribution, conversion metrics (feedback-to-backlog rate, backlog-to-feature rate, resolution rate), and warnings for stale feedbacks or critical bugs.

## Execution Flow

### 1. Validate environment

- Check that `.product/` directory exists. If not → **ERROR**: "Product directory not initialized."

### 2. Gather data

Scan the filesystem directly for accurate counts:

**Feedbacks:**
- Count files in `.product/feedbacks/new/`
- Count files in `.product/feedbacks/triaged/`
- Count files in `.product/feedbacks/excluded/`
- Count files in `.product/feedbacks/resolved/`

**Backlogs:**
- Count files in `.product/backlogs/open/`
- Count files in `.product/backlogs/in-progress/`
- Count files in `.product/backlogs/done/`
- Count files in `.product/backlogs/promoted/`
- Count files in `.product/backlogs/cancelled/`

**Categories:**
- For each feedback file across all status directories, read the `category` field from frontmatter
- Count occurrences of each category: `critical-bug`, `bug`, `optimization`, `evolution`, `new-feature`

**Backlog priorities:**
- For each backlog file across all status directories, read the `priority` field

### 3. Compute metrics

- **Feedback-to-backlog rate**: count of feedbacks with non-empty `linked_to.backlog[]` / total non-excluded feedbacks. If total non-excluded is 0, rate = 0.
- **Backlog-to-feature rate**: count of promoted backlogs / total backlogs. If total backlogs is 0, rate = 0.
- **Resolution rate**: count of resolved feedbacks / total feedbacks. If total feedbacks is 0, rate = 0.

### 4. Identify warnings

- **Stale feedbacks**: For each feedback in `feedbacks/new/`, read the `created` date. If today minus created > 14 days → add stale warning with count and oldest age.
- **Critical bugs**: For each backlog with `priority: critical` → add critical bug alert with ID and title.

### 5. Output — Markdown (default)

```markdown
## Product Dashboard

**Last updated**: {today's date}

### Feedbacks

| Status | Count |
|--------|-------|
| New | {count} |
| Triaged | {count} |
| Excluded | {count} |
| Resolved | {count} |
| **Total** | **{total}** |

### Backlogs

| Status | Count |
|--------|-------|
| Open | {count} |
| In Progress | {count} |
| Done | {count} |
| Promoted | {count} |
| Cancelled | {count} |
| **Total** | **{total}** |

### Categories

| Category | Count | % |
|----------|-------|---|
| critical-bug | {count} | {pct}% |
| bug | {count} | {pct}% |
| optimization | {count} | {pct}% |
| evolution | {count} | {pct}% |
| new-feature | {count} | {pct}% |

### Conversion Metrics

| Metric | Value |
|--------|-------|
| Feedback → Backlog | {rate}% |
| Backlog → Feature | {rate}% |
| Resolution rate | {rate}% |

### Warnings

{If stale feedbacks:}
- **{count} stale feedback(s)** in `new/` (oldest: {days} days) — run `/product.triage`

{If critical bugs:}
- **{count} critical bug(s)** in backlogs — {id} "{title}"

{If no warnings:}
No warnings.
```

If the product directory is empty (no feedbacks, no backlogs), display the dashboard with all zeros and add:
> No feedbacks or backlogs yet. Start with `/product.intake`.

### 6. Output — JSON (`--json` flag)

Output a structured JSON object:

```json
{
  "updated": "{ISO timestamp}",
  "feedbacks": {
    "total": {n},
    "new": {n},
    "triaged": {n},
    "excluded": {n},
    "resolved": {n}
  },
  "backlogs": {
    "total": {n},
    "open": {n},
    "in_progress": {n},
    "done": {n},
    "promoted": {n},
    "cancelled": {n}
  },
  "categories": {
    "critical-bug": {n},
    "bug": {n},
    "optimization": {n},
    "evolution": {n},
    "new-feature": {n}
  },
  "metrics": {
    "feedback_to_backlog_rate": {float},
    "backlog_to_feature_rate": {float},
    "resolution_rate": {float}
  },
  "warnings": [
    { "type": "stale_feedbacks", "count": {n}, "oldest_days": {n} },
    { "type": "critical_bug", "id": "{BL-xxx}", "title": "{title}" }
  ]
}
```

## Error Handling

- `.product/` missing → ERROR with init instructions
- Empty `.product/` → display dashboard with all zeros and a note

## Rules

- This command is **READ-ONLY** — no files are modified
- ALWAYS scan the filesystem directly for accurate counts — do not rely solely on index.yaml
- ALWAYS compute percentages as integers (rounded)
- ALWAYS show all categories even if count is 0
- ALWAYS show all status groups even if count is 0
- NEVER modify any files
