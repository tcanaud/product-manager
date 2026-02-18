---
description: Browse and manage backlogs — list all by status or inspect a specific backlog with linked feedbacks.
handoffs:
  - label: Promote backlog
    agent: product.promote
    prompt: Promote a backlog to feature
    send: true
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

- If `$ARGUMENTS` contains a backlog ID (e.g., `BL-001`): show detail view for that backlog
- If `$ARGUMENTS` is empty: show list of all backlogs grouped by status

## Purpose

Read-only command to browse and inspect backlog items. List all backlogs grouped by status, or view detailed information about a specific backlog including its linked feedbacks.

## Execution Flow

### 1. Validate environment

- Check that `.product/` directory exists. If not → **ERROR**: "Product directory not initialized."

### 2. Determine mode

- **If `$ARGUMENTS` is empty**: List mode (Mode 1)
- **If `$ARGUMENTS` contains `BL-xxx`**: Detail mode (Mode 2)

### 3. Mode 1 — List all backlogs

1. Scan all `.product/backlogs/` subdirectories: `open/`, `in-progress/`, `done/`, `promoted/`, `cancelled/`
2. For each backlog file found, parse YAML frontmatter to extract: id, title, priority, feedbacks count, created date, owner, features
3. Group by status directory
4. Display grouped summary:

```markdown
## Product Backlog

**Total**: {count} items

### Open ({count})

| ID | Title | Priority | Feedbacks | Created |
|----|-------|----------|-----------|---------|
| BL-xxx | {title} | {priority} | {feedbacks.length} | {created} |

### In Progress ({count})

| ID | Title | Priority | Owner | Created |
|----|-------|----------|-------|---------|
| BL-xxx | {title} | {priority} | {owner} | {created} |

### Promoted ({count})

| ID | Title | Feature | Promoted |
|----|-------|---------|----------|
| BL-xxx | {title} | {promotion.feature_id} | {promotion.promoted_date} |

### Done ({count})

| ID | Title | Completed |
|----|-------|-----------|
(list or "(none)")

### Cancelled ({count})

| ID | Title | Reason |
|----|-------|--------|
(list or "(none)")
```

If no backlogs exist in any directory → **INFO**: "No backlog items. Run `/product.triage` to create backlogs from feedbacks."

### 4. Mode 2 — Backlog detail

1. Search for the backlog file matching the given ID across ALL status directories: `open/`, `in-progress/`, `done/`, `promoted/`, `cancelled/`
2. If not found → **ERROR**: "Backlog item {id} not found."
3. Read the full file: parse YAML frontmatter and body content
4. For each feedback ID in the `feedbacks[]` array:
   - Search for the feedback file across all `feedbacks/` subdirectories
   - Read its title and current status
5. Display detail view:

```markdown
## {id}: {title}

**Status**: {status} | **Priority**: {priority} | **Category**: {category}
**Created**: {created} | **Owner**: {owner}
**Tags**: {tags joined by ", "}

### Linked Feedbacks

| ID | Title | Status | Created |
|----|-------|--------|---------|
| FB-xxx | {title} | {status} | {created} |

### Promotion

(if promoted: show feature_id and promoted_date)
(if not promoted: "Not yet promoted. Run `/product.promote {id}` when ready.")

### Description

{backlog body content}
```

## Error Handling

- `.product/` missing → ERROR with init instructions
- BL-xxx not found → ERROR with ID
- No backlogs exist → INFO suggesting `/product.triage`
- Linked feedback file missing → show feedback ID with "(not found)" status

## Rules

- This command is **READ-ONLY** — no files are modified
- ALWAYS search across ALL status directories when looking for a specific backlog or feedback
- ALWAYS display backlogs sorted by ID within each status group
- NEVER modify any files
