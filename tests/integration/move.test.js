import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { move } from "../../src/commands/move.js";
import { parseFrontmatter } from "../../src/yaml-parser.js";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "product-manager-move-"));
  const product = join(root, ".product");
  for (const status of ["new", "triaged", "excluded", "resolved"]) {
    mkdirSync(join(product, "feedbacks", status), { recursive: true });
  }
  for (const status of ["open", "in-progress", "done", "promoted", "cancelled"]) {
    mkdirSync(join(product, "backlogs", status), { recursive: true });
  }
  return { root, product };
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

Body of ${id}.
`);
}

describe("move integration", () => {
  it("scenario 1: single move BL-005 open -> done", async () => {
    const { product } = createFixture();
    writeBacklog(product, "open", "BL-005");

    await move(["BL-005", "done"], { productDir: product });

    assert.ok(!existsSync(join(product, "backlogs", "open", "BL-005.md")));
    assert.ok(existsSync(join(product, "backlogs", "done", "BL-005.md")));

    const content = readFileSync(join(product, "backlogs", "done", "BL-005.md"), "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(frontmatter.status, "done");
    assert.ok(frontmatter.updated);

    assert.ok(existsSync(join(product, "index.yaml")));
  });

  it("scenario 2: bulk move BL-001,BL-002,BL-003 -> done", async () => {
    const { product } = createFixture();
    writeBacklog(product, "open", "BL-001");
    writeBacklog(product, "open", "BL-002");
    writeBacklog(product, "open", "BL-003");

    await move(["BL-001,BL-002,BL-003", "done"], { productDir: product });

    for (const id of ["BL-001", "BL-002", "BL-003"]) {
      assert.ok(!existsSync(join(product, "backlogs", "open", `${id}.md`)));
      assert.ok(existsSync(join(product, "backlogs", "done", `${id}.md`)));
    }
  });

  it("scenario 4: already-in-target-status results in no change, exit 0", async () => {
    const { product } = createFixture();
    writeBacklog(product, "done", "BL-010");

    // Should not throw
    await move(["BL-010", "done"], { productDir: product });
    assert.ok(existsSync(join(product, "backlogs", "done", "BL-010.md")));
  });
});
