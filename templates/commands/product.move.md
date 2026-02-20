# /product.move — Move backlog items

Move one or more backlog items to a new status.

## Usage

The user will specify which backlog(s) to move and the target status.

```bash
# Single item
npx @tcanaud/product-manager move BL-007 done

# Multiple items
npx @tcanaud/product-manager move BL-001,BL-002,BL-003 in-progress
```

## Valid Statuses

`open`, `in-progress`, `done`, `promoted`, `cancelled`

## Behavior

- All IDs are validated before any file is moved (all-or-nothing).
- Each file is relocated to the target status directory.
- Frontmatter `status` and `updated` fields are updated.
- `index.yaml` is regenerated automatically.
