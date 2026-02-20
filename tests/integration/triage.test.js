import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { triagePlan, triageApply } from "../../src/commands/triage.js";
import { parseFrontmatter } from "../../src/yaml-parser.js";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "product-manager-triage-"));
  const product = join(root, ".product");
  for (const status of ["new", "triaged", "excluded", "resolved"]) {
    mkdirSync(join(product, "feedbacks", status), { recursive: true });
  }
  for (const status of ["open", "in-progress", "done", "promoted", "cancelled"]) {
    mkdirSync(join(product, "backlogs", status), { recursive: true });
  }
  return { root, product };
}

function writeFeedback(product, status, id, opts = {}) {
  writeFileSync(join(product, "feedbacks", status, `${id}.md`), `---
id: "${id}"
title: "${opts.title || `Feedback ${id}`}"
status: "${status}"
category: "bug"
priority: "high"
source: ""
reporter: ""
created: "${opts.created || "2026-02-20"}"
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

Body of ${id}.
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

function writePlanFile(root, plan) {
  const planPath = join(root, "plan.json");
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  return planPath;
}

describe("triage integration", () => {
  it("scenario 1: create_backlog plan", async () => {
    const { root, product } = createFixture();
    writeFeedback(product, "new", "FB-010");
    writeFeedback(product, "new", "FB-011");
    writeFeedback(product, "new", "FB-012");

    const planPath = writePlanFile(root, {
      version: "1.0",
      plan: [{
        action: "create_backlog",
        backlog_title: "New auth bug",
        feedback_ids: ["FB-010", "FB-011"],
        priority: "high",
        category: "bug"
      }]
    });

    await triageApply(planPath, { productDir: product });

    // BL-001 should be created
    assert.ok(existsSync(join(product, "backlogs", "open", "BL-001.md")));
    const blContent = readFileSync(join(product, "backlogs", "open", "BL-001.md"), "utf-8");
    const { frontmatter: blFm } = parseFrontmatter(blContent);
    assert.equal(blFm.title, "New auth bug");
    assert.ok(blFm.feedbacks.includes("FB-010"));
    assert.ok(blFm.feedbacks.includes("FB-011"));

    // FB-010, FB-011 should be in triaged/
    assert.ok(existsSync(join(product, "feedbacks", "triaged", "FB-010.md")));
    assert.ok(existsSync(join(product, "feedbacks", "triaged", "FB-011.md")));
    assert.ok(!existsSync(join(product, "feedbacks", "new", "FB-010.md")));

    // FB-012 should still be in new/ (not in plan)
    assert.ok(existsSync(join(product, "feedbacks", "new", "FB-012.md")));

    // Index should exist
    assert.ok(existsSync(join(product, "index.yaml")));
  });

  it("scenario 2: link_existing plan entry", async () => {
    const { root, product } = createFixture();
    writeFeedback(product, "new", "FB-020");
    writeBacklog(product, "open", "BL-005");

    const planPath = writePlanFile(root, {
      version: "1.0",
      plan: [{
        action: "link_existing",
        backlog_id: "BL-005",
        feedback_ids: ["FB-020"]
      }]
    });

    await triageApply(planPath, { productDir: product });

    // BL-005 should have FB-020 in feedbacks
    const blContent = readFileSync(join(product, "backlogs", "open", "BL-005.md"), "utf-8");
    const { frontmatter: blFm } = parseFrontmatter(blContent);
    assert.ok(blFm.feedbacks.includes("FB-020"));

    // FB-020 should be in triaged/
    assert.ok(existsSync(join(product, "feedbacks", "triaged", "FB-020.md")));
  });

  it("scenario 3: exclude entry", async () => {
    const { root, product } = createFixture();
    writeFeedback(product, "new", "FB-030");

    const planPath = writePlanFile(root, {
      version: "1.0",
      plan: [{
        action: "exclude",
        feedback_ids: ["FB-030"],
        reason: "duplicate"
      }]
    });

    await triageApply(planPath, { productDir: product });

    // FB-030 should be in excluded/
    assert.ok(existsSync(join(product, "feedbacks", "excluded", "FB-030.md")));
    const fbContent = readFileSync(join(product, "feedbacks", "excluded", "FB-030.md"), "utf-8");
    const { frontmatter: fbFm } = parseFrontmatter(fbContent);
    assert.equal(fbFm.status, "excluded");
    assert.equal(fbFm.exclusion_reason, "duplicate");
  });

  it("scenario 4: --plan with no new feedbacks outputs empty array", async () => {
    const { product } = createFixture();

    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));

    await triagePlan({ productDir: product });

    console.log = origLog;
    const output = JSON.parse(logs.join("\n"));
    assert.equal(output.version, "1.0");
    assert.deepEqual(output.feedbacks, []);
    assert.deepEqual(output.plan, []);
  });

  it("scenario 5: invalid plan with missing feedback exits 1", async () => {
    const { root, product } = createFixture();
    // No feedbacks in new/

    const planPath = writePlanFile(root, {
      version: "1.0",
      plan: [{
        action: "create_backlog",
        backlog_title: "Ghost",
        feedback_ids: ["FB-999"]
      }]
    });

    // Should call process.exit(1)
    const origExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error("EXIT"); };

    try {
      await triageApply(planPath, { productDir: product });
    } catch (e) {
      if (e.message !== "EXIT") throw e;
    }

    process.exit = origExit;
    assert.equal(exitCode, 1);
  });

  it("scenario 6: feedback ID in two plan entries is rejected", async () => {
    const { root, product } = createFixture();
    writeFeedback(product, "new", "FB-040");

    const planPath = writePlanFile(root, {
      version: "1.0",
      plan: [
        { action: "create_backlog", backlog_title: "A", feedback_ids: ["FB-040"] },
        { action: "exclude", feedback_ids: ["FB-040"], reason: "dup" }
      ]
    });

    const origExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error("EXIT"); };

    try {
      await triageApply(planPath, { productDir: product });
    } catch (e) {
      if (e.message !== "EXIT") throw e;
    }

    process.exit = origExit;
    assert.equal(exitCode, 1);
  });
});
