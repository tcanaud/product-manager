# /product.promote — Promote backlog to feature

Promote a backlog item to a kai feature, creating the `.features/` YAML and updating all linked items.

## Usage

The user will specify the backlog ID to promote.

```bash
npx @tcanaud/product-manager promote BL-007
```

## What Happens

1. Determines the next feature number (scans `.features/` and `specs/`)
2. Creates `.features/{NNN}-{slug}.yaml` with initial lifecycle state
3. Moves the backlog to `backlogs/promoted/`
4. Updates backlog frontmatter with promotion details
5. Updates linked feedbacks with the new feature reference
6. Regenerates `index.yaml`
