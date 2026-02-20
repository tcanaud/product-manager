import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promote, generateSlug } from "../../src/commands/promote.js";
import { parseFrontmatter } from "../../src/yaml-parser.js";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "product-manager-promote-"));
  const product = join(root, ".product");
  for (const status of ["new", "triaged", "excluded", "resolved"]) {
    mkdirSync(join(product, "feedbacks", status), { recursive: true });
  }
  for (const status of ["open", "in-progress", "done", "promoted", "cancelled"]) {
    mkdirSync(join(product, "backlogs", status), { recursive: true });
  }
  mkdirSync(join(root, ".features"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  return { root, product };
}

function writeFeedback(product, status, id) {
  writeFileSync(join(product, "feedbacks", status, `${id}.md`), `---
id: "${id}"
title: "Feedback ${id}"
status: "${status}"
category: "bug"
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

function writeBacklog(product, status, id, opts = {}) {
  const fbs = opts.feedbacks || [];
  const fbList = fbs.length > 0 ? "\n" + fbs.map(f => `  - "${f}"`).join("\n") : " []";
  writeFileSync(join(product, "backlogs", status, `${id}.md`), `---
id: "${id}"
title: "${opts.title || `Backlog ${id}`}"
status: "${status}"
category: "new-feature"
priority: "high"
created: "2026-02-20"
updated: "2026-02-20"
owner: "Thibaud Canaud"
feedbacks:${fbList}
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

describe("promote integration", () => {
  it("scenario 1: open BL-007 with linked FB-102 promotes correctly", async () => {
    const { root, product } = createFixture();
    writeFeedback(product, "triaged", "FB-102");
    writeBacklog(product, "open", "BL-007", { feedbacks: ["FB-102"], title: "CLI Product Operations" });

    // Seed existing features to test numbering
    writeFileSync(join(root, ".features", "001-something.yaml"), "feature_version: \"1.0\"\n");

    await promote(["BL-007"], { productDir: product });

    // BL-007 should be in promoted/
    assert.ok(!existsSync(join(product, "backlogs", "open", "BL-007.md")));
    assert.ok(existsSync(join(product, "backlogs", "promoted", "BL-007.md")));

    // Check backlog frontmatter
    const blContent = readFileSync(join(product, "backlogs", "promoted", "BL-007.md"), "utf-8");
    const { frontmatter: blFm } = parseFrontmatter(blContent);
    assert.equal(blFm.status, "promoted");
    assert.ok(blFm.promotion.promoted_date);
    assert.ok(blFm.promotion.feature_id);
    assert.ok(blFm.features.length > 0);

    // Feature YAML should exist
    const featureFiles = readdirSync(join(root, ".features")).filter(f => f.startsWith("002-"));
    assert.equal(featureFiles.length, 1);
    const featureContent = readFileSync(join(root, ".features", featureFiles[0]), "utf-8");
    assert.ok(featureContent.includes('feature_version: "1.0"'));
    assert.ok(featureContent.includes('status: "active"'));
    assert.ok(featureContent.includes('stage: "ideation"'));

    // FB-102 should have feature link
    const fbContent = readFileSync(join(product, "feedbacks", "triaged", "FB-102.md"), "utf-8");
    const { frontmatter: fbFm } = parseFrontmatter(fbContent);
    assert.ok(fbFm.linked_to.features.length > 0);

    // index.yaml should exist
    assert.ok(existsSync(join(product, "index.yaml")));
  });

  it("scenario 3: backlog with no linked feedbacks still succeeds", async () => {
    const { root, product } = createFixture();
    writeBacklog(product, "open", "BL-001", { title: "No feedbacks" });

    await promote(["BL-001"], { productDir: product });

    assert.ok(existsSync(join(product, "backlogs", "promoted", "BL-001.md")));
  });

  it("scenario 4: feature number is max(existing) + 1 zero-padded", async () => {
    const { root, product } = createFixture();
    writeBacklog(product, "open", "BL-001", { title: "Test" });
    // Create feature 018 and spec 018
    writeFileSync(join(root, ".features", "018-something.yaml"), "");
    mkdirSync(join(root, "specs", "018-something"), { recursive: true });

    await promote(["BL-001"], { productDir: product });

    const featureFiles = readdirSync(join(root, ".features")).filter(f => f.startsWith("019-"));
    assert.equal(featureFiles.length, 1);
  });
});

describe("generateSlug", () => {
  it("lowercases and replaces special chars", () => {
    assert.equal(generateSlug("CLI Product Operations"), "cli-product-operations");
  });

  it("collapses multi-hyphens", () => {
    assert.equal(generateSlug("foo   bar"), "foo-bar");
  });

  it("strips leading/trailing hyphens", () => {
    assert.equal(generateSlug("  hello  "), "hello");
  });

  it("truncates to 60 chars", () => {
    const long = "a".repeat(100);
    assert.ok(generateSlug(long).length <= 60);
  });
});
