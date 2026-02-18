---
description: Capture feedback from free text or inbox files into structured .product/feedbacks/new/ entries.
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

Capture user feedback — either from free-text arguments or from files dropped in `.product/inbox/` — and create structured feedback entries in `.product/feedbacks/new/` with proper YAML frontmatter. This is the entry point for all product feedback.

## Execution Flow

### 1. Validate environment

- Check that `.product/` directory exists. If not → **ERROR**: "Product directory not initialized. Run `npx @tcanaud/product-manager init` first."
- Check that `.product/_templates/feedback.tpl.md` exists. If not → **ERROR**: "Feedback template missing. Run `npx @tcanaud/product-manager update` to restore templates."

### 2. Determine intake mode

- **If `$ARGUMENTS` is non-empty**: Free-text mode (Mode 1) is active
- **Check `.product/inbox/`**: If inbox has files, inbox mode (Mode 2) is active
- **If both**: Combined mode — process both
- **If neither**: **INFO**: "No feedback to process. Provide a description or drop files in `.product/inbox/`." → STOP

### 3. Assign next ID

Scan ALL `.product/feedbacks/` subdirectories (`new/`, `triaged/`, `excluded/`, `resolved/`) for existing feedback files. Extract the numeric portion from filenames matching `FB-xxx.md`. Find the highest number and increment by 1. Zero-pad to 3 digits.

Example: If highest existing is `FB-012.md` → next ID is `FB-013`.
If no feedbacks exist → start at `FB-001`.

### 4. Mode 1 — Free-text intake (if `$ARGUMENTS` provided)

1. Read `.product/_templates/feedback.tpl.md` for the schema
2. Analyze the free-text content to:
   - Extract a concise **title** (max 80 chars) summarizing the feedback
   - Propose a **category** from: `critical-bug`, `bug`, `optimization`, `evolution`, `new-feature`
   - Determine **source**: default to `user`
3. Create the feedback file at `.product/feedbacks/new/FB-{NNN}.md`:
   - Replace `{{id}}` with `FB-{NNN}`
   - Replace `{{title}}` with the extracted title
   - Replace `{{category}}` with the proposed category
   - Replace `{{source}}` with `user`
   - Replace `{{reporter}}` with the git user name (from `git config user.name`) or `unknown`
   - Replace `{{created}}` and `{{updated}}` with today's date (YYYY-MM-DD)
   - Replace `{{body}}` with the full free-text description
4. Record this feedback for the summary report

### 5. Mode 2 — Inbox processing (if `.product/inbox/` has files)

1. List all files in `.product/inbox/`
2. For each file:
   a. Read the file content
   b. If the file appears to be binary or empty → **WARN**: "Skipped {filename}: unrecognizable content. Left in inbox for manual review." → skip
   c. Check for YAML frontmatter (between `---` markers):
      - If present: extract `source`, `reporter`, `timestamp` fields
      - If absent: infer metadata from content
   d. Assign next sequential ID (continuing from Mode 1 if both modes active)
   e. Analyze content to propose category and extract title
   f. Create structured feedback in `.product/feedbacks/new/FB-{NNN}.md`:
      - Use extracted/inferred metadata for frontmatter fields
      - Use the file content (minus frontmatter) as the body
   g. Delete the processed inbox file
3. Record each created feedback for the summary report

### 6. Update index

Read `.product/index.yaml`. For each new feedback created:
- Increment `feedbacks.total` by 1
- Increment `feedbacks.by_status.new` by 1
- Increment the appropriate `feedbacks.by_category.{category}` by 1
- Add an entry to `feedbacks.items[]` with: id, title, status, category, priority, created
- Update the `updated` timestamp

Write the updated index back to `.product/index.yaml`.

### 7. Output report

Display a Markdown summary:

```markdown
## Intake Complete

**Created**: {count} new feedback(s)

| ID | Title | Category | Source |
|----|-------|----------|--------|
| FB-{NNN} | {title} | {category} | {source} |
| ... | ... | ... | ... |

**Next**: Run `/product.triage` when ready to process new feedbacks.
```

## Error Handling

- `.product/` does not exist → ERROR with initialization instructions
- No arguments AND empty inbox → INFO message, no action taken
- Inbox file is empty or binary → WARN, skip that file, continue with others
- Unreadable inbox file → WARN, leave file in inbox for manual review

## Rules

- ALWAYS assign IDs by scanning ALL feedbacks/ subdirectories — never reuse IDs
- ALWAYS use today's date for `created` and `updated`
- ALWAYS set `status: "new"` for newly created feedbacks
- ALWAYS update `index.yaml` after creating feedbacks
- ALWAYS delete successfully processed inbox files
- NEVER modify existing feedback files
- NEVER modify backlog files
- Category MUST be one of: `critical-bug`, `bug`, `optimization`, `evolution`, `new-feature`
