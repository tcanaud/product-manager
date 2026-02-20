# /product.reindex — Regenerate product index

Regenerate the `.product/index.yaml` file from the current filesystem state.

## Instructions

Run the following command:

```bash
npx @tcanaud/product-manager reindex
```

This scans all files in `.product/feedbacks/` and `.product/backlogs/`, aggregates counts by status and category, and writes a fresh `index.yaml`.

Use this after manual file edits or when the index appears stale.
