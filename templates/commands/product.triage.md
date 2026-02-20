# /product.triage — AI-assisted feedback triage

Triage new feedbacks using a two-phase workflow.

## Phase 1: Generate Plan

```bash
npx @tcanaud/product-manager triage --plan
```

This outputs a JSON object listing all feedbacks in `feedbacks/new/`. No files are modified.

## Phase 2: Annotate Plan (AI Step)

Review the JSON output. For each feedback, decide one of:
- `create_backlog`: Create a new backlog item and link the feedback(s)
- `link_existing`: Link feedback(s) to an existing backlog
- `exclude`: Exclude the feedback with a reason

Add your decisions to the `plan` array in the JSON, then save to a file.

## Phase 3: Apply Plan

```bash
npx @tcanaud/product-manager triage --apply /path/to/plan.json
```

This applies all plan entries atomically:
- Creates new backlogs in `backlogs/open/`
- Moves feedbacks to `feedbacks/triaged/` or `feedbacks/excluded/`
- Updates frontmatter with links
- Regenerates `index.yaml`
