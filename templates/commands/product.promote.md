---
description: Promote a backlog item to a full kai feature with traceability links.
handoffs:
  - label: Start feature workflow
    agent: feature.workflow
    prompt: Start the feature workflow for the newly created feature
    send: true
  - label: Browse backlogs
    agent: product.backlog
    prompt: List all backlogs
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

`$ARGUMENTS` must contain a backlog ID (e.g., `BL-001`).

## Purpose

Convert a backlog item into a kai feature — creating the `.features/{NNN}-{name}.yaml` file, updating `.features/index.yaml`, moving the backlog to `promoted/`, and updating all traceability links through the feedback → backlog → feature chain.

## Execution Flow

### 1. Validate arguments

- If `$ARGUMENTS` is empty → **ERROR**: "Backlog ID required. Usage: `/product.promote BL-xxx`"
- Extract the backlog ID from arguments (should match pattern `BL-\d{3}`)
- If invalid format → **ERROR**: "Invalid backlog ID format. Expected BL-xxx (e.g., BL-001)."

### 2. Find the backlog

Search for the backlog file across these directories (in order):
1. `.product/backlogs/open/`
2. `.product/backlogs/in-progress/`

If found in `promoted/` → **ERROR**: "Backlog {id} is already promoted (feature: {feature_id})."
If found in `done/` or `cancelled/` → **ERROR**: "Cannot promote a {status} backlog. Only open or in-progress backlogs can be promoted."
If not found anywhere → **ERROR**: "Backlog {id} not found."

Read the backlog file: parse YAML frontmatter and body content.

### 3. Determine feature identity

1. Read `.features/index.yaml` to list all existing features
2. Scan `.features/` for all `{NNN}-*.yaml` files
3. Find the highest feature number (NNN)
4. Next feature number = highest + 1, zero-padded to 3 digits
5. Derive the feature name from the backlog title:
   - Convert to lowercase
   - Replace spaces and special characters with hyphens
   - Remove consecutive hyphens
   - Trim hyphens from start/end
   - Example: "Search Performance on Large Repos" → `search-performance-on-large-repos`
6. Feature ID = `{NNN}-{name}` (e.g., `009-search-performance-on-large-repos`)

### 4. Create feature YAML

1. Read `.features/_templates/feature.tpl.yaml`
2. Copy to `.features/{feature_id}.yaml`
3. Replace template placeholders:
   - `{{feature_id}}` → the feature ID
   - `{{title}}` → the backlog title (title case)
   - `{{owner}}` → the backlog `owner` field, or `default_owner` from `.features/config.yaml`
   - `{{date}}` → today's date (YYYY-MM-DD)
   - `{{timestamp}}` → current ISO timestamp
4. Set `workflow_path: "full"` (promoted features use the full method)

### 5. Update feature index

Read `.features/index.yaml` and add the new feature entry:
- `id`: the feature ID
- `title`: the backlog title
- `status`: `active`
- `stage`: `ideation`
- `progress`: `0.0`
- `health`: `HEALTHY`

Write the updated index back.

### 6. Update backlog

1. Move the backlog file from its current directory to `.product/backlogs/promoted/`
2. Update the backlog frontmatter:
   - `status: "promoted"`
   - `updated: today's date`
   - `promotion.promoted_date: today's date`
   - `promotion.feature_id: "{feature_id}"`
   - Add the feature ID to `features[]` array
3. Write the updated file

### 7. Update linked feedbacks

For each feedback ID in the backlog's `feedbacks[]` array:
1. Find the feedback file across all `feedbacks/` subdirectories
2. Read its frontmatter
3. Add the feature ID to `linked_to.features[]`
4. Update `updated` to today's date
5. Write the updated file

### 8. Update product index

Read `.product/index.yaml` and update:
- Decrement the appropriate `backlogs.by_status.{old_status}` count
- Increment `backlogs.by_status.promoted`
- Update the backlog entry in `backlogs.items[]`
- Recalculate `metrics.backlog_to_feature_rate`
- Update `updated` timestamp

Write the updated index back.

### 9. Output report

```markdown
## Promotion Complete

**Backlog**: {backlog_id} → promoted
**Feature**: {feature_id} created

### Traceability Chain

{For each linked feedback:}
FB-xxx ──→ {backlog_id} ──→ {feature_id}

### Next Steps

1. Run `/feature.workflow {feature_id}` to start the feature pipeline
2. The feature begins at **ideation** stage — proceed through Brief → PRD → Spec → Tasks → Code
```

## Error Handling

- `$ARGUMENTS` is empty → ERROR with usage instructions
- Backlog not found → ERROR with ID
- Backlog already promoted → ERROR with existing feature ID
- Backlog in wrong status (done/cancelled) → ERROR with explanation
- `.features/` missing → ERROR: "Feature lifecycle system not initialized. Run `npx feature-lifecycle init` first."
- `.features/_templates/feature.tpl.yaml` missing → ERROR: "Feature template missing."
- Feature index update fails → ERROR but backlog move is already done — instruct to run `/product.check`

## Rules

- ALWAYS validate the backlog exists and is in a promotable status before any mutations
- ALWAYS create the feature YAML before moving the backlog (fail-safe ordering)
- ALWAYS update bidirectional links: backlog → feature AND feedback → feature
- ALWAYS use the next sequential feature number from `.features/`
- NEVER modify feedbacks beyond adding to `linked_to.features[]` and updating `updated`
- NEVER promote backlogs in `done/` or `cancelled/` status
- NEVER overwrite an existing feature YAML
- Feature name derivation MUST produce valid kebab-case (lowercase, hyphens only)
