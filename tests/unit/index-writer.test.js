import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeIndex } from "../../src/index-writer.js";

function createProductDir() {
  const root = mkdtempSync(join(tmpdir(), "product-manager-idx-"));
  const product = join(root, ".product");
  mkdirSync(product, { recursive: true });
  return product;
}

describe("writeIndex", () => {
  it("writes correct YAML for known fixture data", async () => {
    const product = createProductDir();
    const feedbacks = [
      { id: "FB-002", title: "Bug 2", status: "triaged", category: "bug", priority: "high", created: "2026-02-20" },
      { id: "FB-001", title: "Bug 1", status: "new", category: "critical-bug", priority: null, created: "2026-02-19" },
    ];
    const backlogs = [
      { id: "BL-010", title: "Feature", status: "promoted", category: "new-feature", priority: "high", created: "2026-02-20" },
      { id: "BL-001", title: "Fix", status: "open", category: "bug", priority: "medium", created: "2026-02-19" },
    ];

    await writeIndex(product, feedbacks, backlogs);
    const content = readFileSync(join(product, "index.yaml"), "utf-8");

    assert.ok(content.includes('product_version: "1.0"'));
    assert.ok(content.includes("feedbacks:"));
    assert.ok(content.includes("total: 2"));
    assert.ok(content.includes("new: 1"));
    assert.ok(content.includes("triaged: 1"));
    assert.ok(content.includes("backlogs:"));
    assert.ok(content.includes("open: 1"));
    assert.ok(content.includes("promoted: 1"));
  });

  it("sorts items by numeric ID", async () => {
    const product = createProductDir();
    const feedbacks = [
      { id: "FB-010", title: "Ten", status: "new", category: "bug", priority: "low", created: "2026-02-20" },
      { id: "FB-002", title: "Two", status: "new", category: "bug", priority: "low", created: "2026-02-20" },
      { id: "FB-001", title: "One", status: "new", category: "bug", priority: "low", created: "2026-02-20" },
    ];

    await writeIndex(product, feedbacks, []);
    const content = readFileSync(join(product, "index.yaml"), "utf-8");
    const fb1Pos = content.indexOf("FB-001");
    const fb2Pos = content.indexOf("FB-002");
    const fb10Pos = content.indexOf("FB-010");
    assert.ok(fb1Pos < fb2Pos);
    assert.ok(fb2Pos < fb10Pos);
  });

  it("computes metrics correctly", async () => {
    const product = createProductDir();
    const feedbacks = [
      { id: "FB-001", title: "A", status: "triaged", category: "bug", priority: "low", created: "2026-02-20" },
      { id: "FB-002", title: "B", status: "new", category: "bug", priority: "low", created: "2026-02-20" },
    ];
    const backlogs = [
      { id: "BL-001", title: "X", status: "promoted", category: "bug", priority: "low", created: "2026-02-20" },
      { id: "BL-002", title: "Y", status: "open", category: "bug", priority: "low", created: "2026-02-20" },
    ];

    await writeIndex(product, feedbacks, backlogs);
    const content = readFileSync(join(product, "index.yaml"), "utf-8");
    assert.ok(content.includes("feedback_to_backlog_rate: 0.50"));
    assert.ok(content.includes("backlog_to_feature_rate: 0.50"));
  });

  it("handles zero denominator for metrics", async () => {
    const product = createProductDir();
    await writeIndex(product, [], []);
    const content = readFileSync(join(product, "index.yaml"), "utf-8");
    assert.ok(content.includes("feedback_to_backlog_rate: 0.00"));
    assert.ok(content.includes("backlog_to_feature_rate: 0.00"));
  });

  it("uses atomic write (tmp then rename)", async () => {
    const product = createProductDir();
    await writeIndex(product, [], []);
    // After successful write, tmp should not exist, index.yaml should
    assert.ok(existsSync(join(product, "index.yaml")));
    assert.ok(!existsSync(join(product, "index.yaml.tmp")));
  });

  it("computes by_category aggregation", async () => {
    const product = createProductDir();
    const feedbacks = [
      { id: "FB-001", title: "A", status: "new", category: "bug", priority: "low", created: "2026-02-20" },
      { id: "FB-002", title: "B", status: "new", category: "bug", priority: "low", created: "2026-02-20" },
      { id: "FB-003", title: "C", status: "new", category: "new-feature", priority: "low", created: "2026-02-20" },
    ];

    await writeIndex(product, feedbacks, []);
    const content = readFileSync(join(product, "index.yaml"), "utf-8");
    assert.ok(content.includes("bug: 2"));
    assert.ok(content.includes("new-feature: 1"));
  });
});
