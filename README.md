# Product Manager

**Turn user complaints into shipped features — with full traceability.**

Product Manager is a file-based feedback system for the [kai](https://github.com/tcanaud/kai) governance stack. It captures raw feedback, triages it with AI-powered semantic clustering, manages a backlog, and promotes items into the kai feature pipeline.

Every state change is a `git mv`. Every query is an `ls`. Every artifact is a Markdown file you can read, diff, and review.

## The Loop

```
User says "search is slow"
  → /product.intake "search is slow on large repos"
    → .product/feedbacks/new/FB-001.md

  → /product.triage
    → Groups similar feedbacks together
    → .product/feedbacks/triaged/FB-001.md
    → .product/backlogs/open/BL-001.md

  → /product.promote BL-001
    → .product/backlogs/promoted/BL-001.md
    → .features/009-search-performance.yaml

  → /feature.workflow 009-search-performance
    → Brief → PRD → Spec → Tasks → Code → Release

  → Full traceability: FB-001 → BL-001 → feature 009 → release
```

## Getting Started

```bash
npx @tcanaud/product-manager init
```

That's it. You now have:
- `.product/` with all the directories for feedbacks and backlogs
- 6 Claude Code slash commands ready to use

## Commands

| Command | What it does |
|---------|-------------|
| `/product.intake` | Capture feedback from text or inbox files |
| `/product.triage` | AI-powered clustering and backlog creation |
| `/product.backlog` | Browse and inspect backlog items |
| `/product.promote` | Turn a backlog item into a kai feature |
| `/product.dashboard` | See the big picture at a glance |
| `/product.check` | Detect drift and broken links |

### Capture feedback

```
/product.intake Users report search takes 40 seconds on large repos
```

Or drop files in `.product/inbox/` and run `/product.intake` — it processes everything.

### Triage with AI

```
/product.triage
```

Claude reads all new feedbacks, groups them by meaning (not keywords), detects regressions against resolved issues, and creates backlog items. Want to review each action? Add `--supervised`.

### Promote to feature

```
/product.promote BL-001
```

Creates a full kai feature with bidirectional traceability links all the way back to the original feedback.

### Health check

```
/product.dashboard
/product.check
```

Dashboard shows counts, conversion rates, and warnings. Check finds broken links, stale feedbacks, and data inconsistencies.

## How It Works

The filesystem **is** the state machine:

```
.product/
├── inbox/                  Drop raw feedback here
├── feedbacks/
│   ├── new/                Captured, not yet triaged
│   ├── triaged/            Analyzed, linked to a backlog
│   ├── excluded/           Noise, duplicates, out of scope
│   └── resolved/           Problem solved
└── backlogs/
    ├── open/               Planned
    ├── in-progress/        Being worked on
    ├── done/               Completed
    ├── promoted/           Became a kai feature
    └── cancelled/          Dropped
```

Moving a file between directories **is** a state transition. `git log --follow` gives you the full lifecycle of any item.

## Updating

```bash
npx @tcanaud/product-manager update
```

Refreshes command templates and schemas. Never touches your feedbacks, backlogs, or index.

## Part of kai

Product Manager is the 8th module in the kai governance stack, alongside ADR, Agreements, Features, Knowledge, Mermaid, Spec Kit, and BMAD. Install everything at once with:

```bash
npx tcsetup init
```

## License

MIT
