import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reindex } from "../../src/commands/reindex.js";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "product-manager-reindex-"));
  const product = join(root, ".product");
  for (const status of ["new", "triaged", "excluded", "resolved"]) {
    mkdirSync(join(product, "feedbacks", status), { recursive: true });
  }
  for (const status of ["open", "in-progress", "done", "promoted", "cancelled"]) {
    mkdirSync(join(product, "backlogs", status), { recursive: true });
  }
  return { root, product };
}

function writeFeedback(product, status, id, category = "bug") {
  writeFileSync(join(product, "feedbacks", status, `${id}.md`), `---
id: "${id}"
title: "Feedback ${id}"
status: "${status}"
category: "${category}"
priority: "high"
source: ""
reporter: ""
created: "2026-02-20"
updated: "2026-02-20"
tags: []
exclusion_reason: ""
linked_to:
  backlog: []
  features: []
  feedbacks: []
resolution:
  resolved_date: ""
  resolved_by_feature: ""
  resolved_by_backlog: ""
---

Body.
`);
}

function writeBacklog(product, status, id) {
  writeFileSync(join(product, "backlogs", status, `${id}.md`), `---
id: "${id}"
title: "Backlog ${id}"
status: "${status}"
category: "new-feature"
priority: "high"
created: "2026-02-20"
updated: "2026-02-20"
owner: ""
feedbacks: []
features: []
tags: []
promotion:
  promoted_date: ""
  feature_id: ""
cancellation:
  cancelled_date: ""
  reason: ""
---

Body.
`);
}

describe("reindex integration", () => {
  it("scenario 1: fixture with feedbacks + backlogs across all statuses", async () => {
    const { product } = createFixture();
    writeFeedback(product, "new", "FB-001");
    writeFeedback(product, "triaged", "FB-002");
    writeFeedback(product, "excluded", "FB-003");
    writeBacklog(product, "open", "BL-001");
    writeBacklog(product, "done", "BL-002");
    writeBacklog(product, "promoted", "BL-003");

    await reindex({ productDir: product });

    const content = readFileSync(join(product, "index.yaml"), "utf-8");
    assert.ok(content.includes("total: 3"), "should have 3 feedbacks");
    assert.ok(content.includes("new: 1"));
    assert.ok(content.includes("triaged: 1"));
    assert.ok(content.includes("excluded: 1"));
    assert.ok(content.includes("open: 1"));
    assert.ok(content.includes("done: 1"));
    assert.ok(content.includes("promoted: 1"));
  });

  it("scenario 2: stale index.yaml overwritten with correct data", async () => {
    const { product } = createFixture();
    writeFileSync(join(product, "index.yaml"), "stale content");
    writeFeedback(product, "new", "FB-001");

    await reindex({ productDir: product });

    const content = readFileSync(join(product, "index.yaml"), "utf-8");
    assert.ok(content.includes('product_version: "1.0"'));
    assert.ok(!content.includes("stale content"));
  });

  it("scenario 3: empty .product/ results in all counts zero", async () => {
    const { product } = createFixture();

    await reindex({ productDir: product });

    const content = readFileSync(join(product, "index.yaml"), "utf-8");
    assert.ok(content.includes("total: 0"));
    assert.ok(content.includes("feedback_to_backlog_rate: 0.00"));
  });
});
