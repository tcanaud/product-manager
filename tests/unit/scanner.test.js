import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanProduct, findBacklog, findFeedback } from "../../src/scanner.js";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "product-manager-test-"));
  const product = join(root, ".product");

  for (const status of ["new", "triaged", "excluded", "resolved"]) {
    mkdirSync(join(product, "feedbacks", status), { recursive: true });
  }
  for (const status of ["open", "in-progress", "done", "promoted", "cancelled"]) {
    mkdirSync(join(product, "backlogs", status), { recursive: true });
  }

  return { root, product };
}

function writeFeedback(product, status, id, extra = {}) {
  const fm = {
    id, title: `Feedback ${id}`, status, category: "bug", priority: "high",
    created: "2026-02-20", updated: "2026-02-20", tags: [],
    exclusion_reason: "", ...extra
  };
  const content = `---
id: "${fm.id}"
title: "${fm.title}"
status: "${fm.status}"
category: "${fm.category}"
priority: "${fm.priority}"
created: "${fm.created}"
updated: "${fm.updated}"
tags: []
exclusion_reason: "${fm.exclusion_reason}"
linked_to:
  backlog: []
  features: []
  feedbacks: []
resolution:
  resolved_date: ""
  resolved_by_feature: ""
  resolved_by_backlog: ""
---

Body of ${id}.
`;
  writeFileSync(join(product, "feedbacks", status, `${id}.md`), content);
}

function writeBacklog(product, status, id) {
  const content = `---
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

Body of ${id}.
`;
  writeFileSync(join(product, "backlogs", status, `${id}.md`), content);
}

describe("scanProduct", () => {
  it("returns correct counts for seeded fixture", async () => {
    const { product } = createFixture();
    writeFeedback(product, "new", "FB-001");
    writeFeedback(product, "triaged", "FB-002");
    writeBacklog(product, "open", "BL-001");
    writeBacklog(product, "done", "BL-002");

    const result = await scanProduct(product);
    assert.equal(result.feedbacks.length, 2);
    assert.equal(result.backlogs.length, 2);
  });

  it("returns empty arrays for empty product dir", async () => {
    const { product } = createFixture();
    const result = await scanProduct(product);
    assert.equal(result.feedbacks.length, 0);
    assert.equal(result.backlogs.length, 0);
  });

  it("skips malformed file with warning", async () => {
    const { product } = createFixture();
    writeFileSync(join(product, "feedbacks", "new", "FB-BAD.md"), "no frontmatter here");
    writeFeedback(product, "new", "FB-001");

    const result = await scanProduct(product);
    assert.equal(result.feedbacks.length, 1);
    assert.equal(result.feedbacks[0].id, "FB-001");
  });
});

describe("findBacklog", () => {
  it("finds backlog across status dirs", async () => {
    const { product } = createFixture();
    writeBacklog(product, "done", "BL-005");
    const bl = await findBacklog(product, "BL-005");
    assert.ok(bl);
    assert.equal(bl.id, "BL-005");
  });

  it("returns null for missing ID", async () => {
    const { product } = createFixture();
    const bl = await findBacklog(product, "BL-999");
    assert.equal(bl, null);
  });
});

describe("findFeedback", () => {
  it("finds feedback across status dirs", async () => {
    const { product } = createFixture();
    writeFeedback(product, "triaged", "FB-010");
    const fb = await findFeedback(product, "FB-010");
    assert.ok(fb);
    assert.equal(fb.id, "FB-010");
  });

  it("returns null for missing feedback", async () => {
    const { product } = createFixture();
    const fb = await findFeedback(product, "FB-999");
    assert.equal(fb, null);
  });
});
