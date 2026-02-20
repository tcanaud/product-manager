import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { check } from "../../src/commands/check.js";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "product-manager-check-"));
  const product = join(root, ".product");
  for (const status of ["new", "triaged", "excluded", "resolved"]) {
    mkdirSync(join(product, "feedbacks", status), { recursive: true });
  }
  for (const status of ["open", "in-progress", "done", "promoted", "cancelled"]) {
    mkdirSync(join(product, "backlogs", status), { recursive: true });
  }
  return { root, product };
}

function writeFeedback(product, status, id, overrides = {}) {
  const fm = {
    id, title: `Feedback ${id}`, status, category: "bug", priority: "high",
    created: overrides.created || "2026-02-20", updated: "2026-02-20",
    ...overrides
  };
  writeFileSync(join(product, "feedbacks", status, `${id}.md`), `---
id: "${fm.id}"
title: "${fm.title}"
status: "${fm.status}"
category: "${fm.category}"
priority: "${fm.priority}"
source: ""
reporter: ""
created: "${fm.created}"
updated: "${fm.updated}"
tags: []
exclusion_reason: ""
linked_to:
  backlog: [${fm.linkedBacklog ? `"${fm.linkedBacklog}"` : ""}]
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

function writeBacklog(product, status, id, overrides = {}) {
  const fbs = overrides.feedbacks || [];
  const fbList = fbs.length > 0 ? fbs.map(f => `  - "${f}"`).join("\n") : "";
  writeFileSync(join(product, "backlogs", status, `${id}.md`), `---
id: "${id}"
title: "Backlog ${id}"
status: "${overrides.fmStatus || status}"
category: "new-feature"
priority: "high"
created: "2026-02-20"
updated: "2026-02-20"
owner: ""
feedbacks: ${fbs.length === 0 ? "[]" : ""}
${fbList}
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

describe("check integration", () => {
  it("scenario 1: status desync detected", async () => {
    const { product } = createFixture();
    // File in open/ but frontmatter says done
    writeBacklog(product, "open", "BL-001", { fmStatus: "done" });

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    process.exitCode = 0;

    await check({ productDir: product, json: true });

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    assert.equal(output.ok, false);
    assert.ok(output.issues.some(i => i.type === "status_dir_desync"));
    process.exitCode = 0;
  });

  it("scenario 2: broken chain - feedback links to non-existent backlog", async () => {
    const { product } = createFixture();
    writeFeedback(product, "triaged", "FB-001", { linkedBacklog: "BL-999" });

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    process.exitCode = 0;

    await check({ productDir: product, json: true });

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    assert.ok(output.issues.some(i => i.type === "broken_chain"));
    process.exitCode = 0;
  });

  it("scenario 3: stale feedback older than 14 days", async () => {
    const { product } = createFixture();
    writeFeedback(product, "new", "FB-001", { created: "2026-01-01" });

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    process.exitCode = 0;

    await check({ productDir: product, json: true });

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    assert.ok(output.issues.some(i => i.type === "stale_feedback"));
    process.exitCode = 0;
  });

  it("scenario 4: fully consistent fixture returns exit 0", async () => {
    const { product } = createFixture();
    writeFeedback(product, "triaged", "FB-001");
    writeBacklog(product, "open", "BL-001", { feedbacks: ["FB-001"] });

    // Write a matching index
    const { reindex } = await import("../../src/commands/reindex.js");
    await reindex({ productDir: product });

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    process.exitCode = 0;

    await check({ productDir: product, json: true });

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    assert.equal(output.ok, true);
    assert.equal(output.issues.length, 0);
    assert.equal(process.exitCode, undefined || 0);
    process.exitCode = 0;
  });

  it("scenario 5: index desync detected", async () => {
    const { product } = createFixture();
    writeFeedback(product, "new", "FB-001");
    // Write index claiming 5 feedbacks
    writeFileSync(join(product, "index.yaml"), `product_version: "1.0"\nupdated: "2026-02-20T00:00:00Z"\nfeedbacks:\n  total: 5\n  by_status:\n    new: 5\nbacklogs:\n  total: 0\n`);

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    process.exitCode = 0;

    await check({ productDir: product, json: true });

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    assert.ok(output.issues.some(i => i.type === "index_desync"));
    process.exitCode = 0;
  });

  it("scenario 6: --json produces valid JSON matching schema", async () => {
    const { product } = createFixture();

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    process.exitCode = 0;

    await check({ productDir: product, json: true });

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    assert.ok("version" in output);
    assert.ok("checked_at" in output);
    assert.ok("ok" in output);
    assert.ok("issues" in output);
    assert.ok("summary" in output);
    assert.ok("total_issues" in output.summary);
    assert.ok("warnings" in output.summary);
    assert.ok("errors" in output.summary);
    process.exitCode = 0;
  });
});
