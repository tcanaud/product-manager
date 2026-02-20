# /product.check — Check product integrity

Run integrity checks on the `.product/` directory.

## Instructions

```bash
# Human-readable output
npx @tcanaud/product-manager check

# JSON output for programmatic use
npx @tcanaud/product-manager check --json
```

## Checks Performed

1. **Status/directory desync**: File location vs frontmatter `status` field
2. **Stale feedbacks**: Items in `feedbacks/new/` older than 14 days
3. **Broken traceability**: Links to non-existent items
4. **Orphaned backlogs**: Open backlogs with no linked feedbacks
5. **Index desync**: `index.yaml` counts vs actual filesystem

If issues are found, suggest appropriate remediation (e.g., `product-manager reindex` for index desync).
