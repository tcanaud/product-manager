---
description: Triage new feedbacks — semantic clustering, duplicate/regression detection, backlog creation.
handoffs:
  - label: Browse backlogs
    agent: product.backlog
    prompt: List all backlogs
    send: true
  - label: Promote backlog
    agent: product.promote
    prompt: Promote a backlog to feature
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

- If `$ARGUMENTS` contains `--supervised`: use supervised mode (confirm each action)
- Otherwise: use autonomous mode (execute all actions immediately)

## Purpose

Read all new feedbacks, perform AI semantic clustering, detect duplicates and regressions against resolved feedbacks, propose backlog items, and execute triage actions — moving feedbacks to `triaged/` or `excluded/` and creating backlog items in `backlogs/open/`.

## Execution Flow

### 1. Validate environment

- Check that `.product/` directory exists. If not → **ERROR**: "Product directory not initialized."
- List files in `.product/feedbacks/new/`. If empty → **INFO**: "No new feedbacks to triage." → STOP
- If more than 30 feedbacks in `new/` → **WARN**: "Large batch ({count} feedbacks). Processing first 30; re-run for remainder." Process only the first 30 (sorted by filename).

### 2. Read all feedbacks for context

Read **all** feedback files from:
- `.product/feedbacks/new/` — the feedbacks to triage (primary input)
- `.product/feedbacks/resolved/` — for regression/duplicate detection
- `.product/feedbacks/triaged/` — for existing context and deduplication

For each file, parse the YAML frontmatter and body content.

### 3. Read existing backlogs for context

Read all backlog files from all `.product/backlogs/` subdirectories to understand what already exists and avoid creating duplicate backlogs.

### 4. Semantic analysis

For each new feedback, perform the following analysis:

#### 4a. Clustering

Group new feedbacks that describe the **same problem or request**, even with different phrasings. Use semantic understanding — NOT keyword matching.

Example: "Search takes 40 seconds" and "Search is unusable with 10k files" → same cluster (search performance).

#### 4b. Regression / duplicate detection

Compare each new feedback against **resolved** feedbacks:

1. If semantically similar to a resolved feedback:
   - Find the resolution chain: read the resolved feedback's `linked_to.backlog[]` → read that backlog's `features[]` → find the feature
   - Read the feature's `.features/{feature_id}.yaml` to get `lifecycle.stage` and `lifecycle.stage_since`
   - **If** feedback `created` date > feature `stage_since` date (feature was released BEFORE the new feedback was created) → classify as **REGRESSION**
   - **If** feedback `created` date <= feature `stage_since` date → classify as **DUPLICATE-RESOLVED**
2. If no resolution chain can be traced, treat as a new standalone feedback

#### 4c. Category assignment

For each feedback, verify or reassign its category from the predefined set: `critical-bug`, `bug`, `optimization`, `evolution`, `new-feature`.

#### 4d. Priority proposal

For each cluster/standalone feedback, propose a priority: `low`, `medium`, `high`, `critical`.
Consider: user impact, frequency of reports, severity of the issue.

### 5. Present triage proposal

Build a structured proposal showing all planned actions:

```markdown
## Triage Proposal

### Group 1: {cluster title} ({count} feedbacks)
- FB-xxx: "{title}"
- FB-yyy: "{title}"
**Action**: Create backlog BL-{NNN} "{proposed title}" ({category}, {priority})

### Group 2: Standalone
- FB-zzz: "{title}"
**Action**: Create backlog BL-{NNN} "{proposed title}" ({category}, {priority})

### Excluded
- FB-aaa: "{title}"
**Action**: Move to excluded/ (reason: {noise | out-of-scope | duplicate-resolved | ...})

### Regression Detected
- FB-bbb: Similar to resolved FB-ccc (resolved by feature {feature_id}, released {date})
  FB-bbb created: {date} — AFTER release
**Action**: Create backlog BL-{NNN} "{title}" (critical-bug, critical, tag: regression)
```

### 6. Execute actions

#### Autonomous mode (default)

Execute all proposed actions immediately:

#### Supervised mode (`--supervised`)

Present each action individually and wait for user confirmation:
- **Accept**: execute the action
- **Reject**: skip the action, leave the feedback in `new/`
- **Modify**: let the user change the proposed action before executing

#### For each triage action:

**Creating a backlog item:**
1. Scan ALL `.product/backlogs/` subdirectories for highest existing BL-xxx number
2. Assign next sequential ID (zero-padded to 3 digits)
3. Read `.product/_templates/backlog.tpl.md` for the schema
4. Create backlog file at `.product/backlogs/open/BL-{NNN}.md`:
   - Replace `{{id}}` with `BL-{NNN}`
   - Replace `{{title}}` with the synthesized title from the cluster
   - Replace `{{category}}` with the determined category
   - Replace `{{priority}}` with the proposed priority
   - Replace `{{created}}` and `{{updated}}` with today's date
   - Replace `{{owner}}` with git user name or `unknown`
   - Set `feedbacks:` array with all feedback IDs in the cluster
   - Replace `{{body}}` with a synthesized description of the problem from the cluster
5. For each feedback in the cluster:
   - Move file from `feedbacks/new/` to `feedbacks/triaged/`
   - Update frontmatter: `status: "triaged"`, `updated: today`
   - Add the backlog ID to `linked_to.backlog[]`

**Excluding a feedback:**
1. Move file from `feedbacks/new/` to `feedbacks/excluded/`
2. Update frontmatter: `status: "excluded"`, `updated: today`
3. Set `exclusion_reason` to the specific reason (e.g., "duplicate-resolved", "noise", "out-of-scope")

**Handling a regression:**
1. Create a backlog item (same as above) with:
   - `category: "critical-bug"`
   - `priority: "critical"`
   - `tags: ["regression"]`
2. Move the feedback to `triaged/` with the backlog link

### 7. Update index

Read `.product/index.yaml` and update:
- Feedback counts by status (decrement `new`, increment `triaged`/`excluded` as appropriate)
- Backlog counts (increment `open` for each new backlog)
- Category distributions
- Recalculate `metrics.feedback_to_backlog_rate`
- Update `updated` timestamp

Write the updated index back.

### 8. Output report

```markdown
## Triage Complete

**Processed**: {count} feedbacks
**Created**: {count} backlog item(s)
**Excluded**: {count} feedback(s)
**Regressions**: {count} detected

| Feedback | Action | Result |
|----------|--------|--------|
| FB-xxx | Grouped → BL-{NNN} | triaged/ |
| FB-yyy | Grouped → BL-{NNN} | triaged/ |
| FB-zzz | Standalone → BL-{NNN} | triaged/ |
| FB-aaa | Excluded ({reason}) | excluded/ |

**Next**: Review backlogs with `/product.backlog` or promote with `/product.promote BL-xxx`.
```

## Error Handling

- No feedbacks in `new/` → INFO, stop gracefully
- `.product/` missing → ERROR with init instructions
- Batch > 30 items → WARN, process first 30, instruct to re-run
- Feature file not found during regression check → skip regression detection for that feedback, note in report
- Feedback file cannot be parsed → WARN, skip, leave in `new/`

## Rules

- ALWAYS use semantic similarity for clustering — NEVER keyword matching
- ALWAYS scan ALL backlogs/ and feedbacks/ subdirs for ID assignment — NEVER reuse IDs
- ALWAYS update bidirectional links (feedback → backlog AND backlog → feedbacks)
- ALWAYS move files to new directories as state transitions — NEVER just update frontmatter status without moving
- ALWAYS update `index.yaml` after all actions
- NEVER modify resolved feedbacks (read-only context)
- NEVER modify existing backlog items (read-only context)
- Category MUST be one of: `critical-bug`, `bug`, `optimization`, `evolution`, `new-feature`
- Priority MUST be one of: `low`, `medium`, `high`, `critical`
- In supervised mode, respect user decisions without argument
