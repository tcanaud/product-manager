import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, serializeFrontmatter, reconstructFile } from "../../src/yaml-parser.js";

describe("parseFrontmatter", () => {
  it("parses feedback frontmatter", () => {
    const content = `---
id: "FB-102"
title: "Auth bug on login"
status: "triaged"
category: "bug"
priority: "high"
source: "user"
reporter: "John"
created: "2026-02-20"
updated: "2026-02-20"
tags: ["auth", "login"]
exclusion_reason: ""
linked_to:
  backlog:
    - "BL-007"
  features: []
  feedbacks: []
resolution:
  resolved_date: ""
  resolved_by_feature: ""
  resolved_by_backlog: ""
---

Body text here.
`;
    const { frontmatter, body } = parseFrontmatter(content);
    assert.equal(frontmatter.id, "FB-102");
    assert.equal(frontmatter.title, "Auth bug on login");
    assert.equal(frontmatter.status, "triaged");
    assert.equal(frontmatter.category, "bug");
    assert.equal(frontmatter.priority, "high");
    assert.deepEqual(frontmatter.tags, ["auth", "login"]);
    assert.equal(frontmatter.exclusion_reason, "");
    assert.deepEqual(frontmatter.linked_to.backlog, ["BL-007"]);
    assert.deepEqual(frontmatter.linked_to.features, []);
    assert.deepEqual(frontmatter.linked_to.feedbacks, []);
    assert.equal(frontmatter.resolution.resolved_date, "");
    assert.ok(body.includes("Body text here."));
  });

  it("parses backlog frontmatter", () => {
    const content = `---
id: "BL-007"
title: "Implement feature X"
status: "open"
category: "new-feature"
priority: "high"
created: "2026-02-20"
updated: "2026-02-20"
owner: "Thibaud Canaud"
feedbacks:
  - "FB-102"
  - "FB-103"
features: []
tags: []
promotion:
  promoted_date: ""
  feature_id: ""
cancellation:
  cancelled_date: ""
  reason: ""
---

Backlog body.
`;
    const { frontmatter, body } = parseFrontmatter(content);
    assert.equal(frontmatter.id, "BL-007");
    assert.equal(frontmatter.status, "open");
    assert.equal(frontmatter.owner, "Thibaud Canaud");
    assert.deepEqual(frontmatter.feedbacks, ["FB-102", "FB-103"]);
    assert.deepEqual(frontmatter.features, []);
    assert.equal(frontmatter.promotion.promoted_date, "");
    assert.equal(frontmatter.cancellation.reason, "");
    assert.ok(body.includes("Backlog body."));
  });

  it("handles empty/missing frontmatter gracefully", () => {
    const { frontmatter, body } = parseFrontmatter("Just text, no frontmatter.");
    assert.deepEqual(frontmatter, {});
    assert.equal(body, "Just text, no frontmatter.");
  });

  it("handles null/undefined input", () => {
    assert.deepEqual(parseFrontmatter(null), { frontmatter: {}, body: "" });
    assert.deepEqual(parseFrontmatter(undefined), { frontmatter: {}, body: "" });
  });

  it("handles empty block lists []", () => {
    const content = `---
id: "FB-001"
tags: []
linked_to:
  backlog: []
  features: []
  feedbacks: []
---
`;
    const { frontmatter } = parseFrontmatter(content);
    assert.deepEqual(frontmatter.tags, []);
    assert.deepEqual(frontmatter.linked_to.backlog, []);
  });

  it("parses priority null as null", () => {
    const content = `---
id: "FB-001"
priority: null
---
`;
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(frontmatter.priority, null);
  });

  it("handles nested objects with indent tracking", () => {
    const content = `---
id: "BL-001"
promotion:
  promoted_date: "2026-02-20"
  feature_id: "019-something"
cancellation:
  cancelled_date: ""
  reason: ""
---
`;
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(frontmatter.promotion.promoted_date, "2026-02-20");
    assert.equal(frontmatter.promotion.feature_id, "019-something");
    assert.equal(frontmatter.cancellation.cancelled_date, "");
  });
});

describe("serializeFrontmatter", () => {
  it("serializes feedback frontmatter", () => {
    const fm = {
      id: "FB-102",
      title: "Auth bug",
      status: "triaged",
      category: "bug",
      priority: "high",
      source: "user",
      reporter: "John",
      created: "2026-02-20",
      updated: "2026-02-20",
      tags: [],
      exclusion_reason: "",
      linked_to: { backlog: ["BL-007"], features: [], feedbacks: [] },
      resolution: { resolved_date: "", resolved_by_feature: "", resolved_by_backlog: "" }
    };
    const yaml = serializeFrontmatter(fm);
    assert.ok(yaml.includes('id: "FB-102"'));
    assert.ok(yaml.includes('title: "Auth bug"'));
    assert.ok(yaml.includes("tags: []"));
    assert.ok(yaml.includes('- "BL-007"'));
  });

  it("serializes backlog frontmatter in correct field order", () => {
    const fm = {
      id: "BL-007",
      title: "Feature X",
      status: "open",
      category: "new-feature",
      priority: "high",
      created: "2026-02-20",
      updated: "2026-02-20",
      owner: "TC",
      feedbacks: ["FB-102"],
      features: [],
      tags: [],
      promotion: { promoted_date: "", feature_id: "" },
      cancellation: { cancelled_date: "", reason: "" }
    };
    const yaml = serializeFrontmatter(fm);
    const idPos = yaml.indexOf("id:");
    const titlePos = yaml.indexOf("title:");
    const statusPos = yaml.indexOf("status:");
    assert.ok(idPos < titlePos);
    assert.ok(titlePos < statusPos);
  });

  it("round-trips feedback correctly", () => {
    const original = `---
id: "FB-001"
title: "Test"
status: "new"
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
`;
    const { frontmatter, body } = parseFrontmatter(original);
    const reconstructed = reconstructFile(frontmatter, body);
    const { frontmatter: fm2 } = parseFrontmatter(reconstructed);
    assert.deepEqual(fm2, frontmatter);
  });

  it("round-trips backlog correctly", () => {
    const original = `---
id: "BL-001"
title: "Test backlog"
status: "open"
category: "new-feature"
priority: "high"
created: "2026-02-20"
updated: "2026-02-20"
owner: "TC"
feedbacks:
  - "FB-001"
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
`;
    const { frontmatter, body } = parseFrontmatter(original);
    const reconstructed = reconstructFile(frontmatter, body);
    const { frontmatter: fm2 } = parseFrontmatter(reconstructed);
    assert.deepEqual(fm2, frontmatter);
  });

  it("serializes priority null correctly", () => {
    const fm = { id: "FB-001", priority: null, linked_to: {} };
    const yaml = serializeFrontmatter(fm);
    assert.ok(yaml.includes("priority: null"));
  });

  it("handles empty/null input", () => {
    assert.equal(serializeFrontmatter(null), "");
    assert.equal(serializeFrontmatter({}), "");
  });

  it("preserves unknown fields", () => {
    const fm = {
      id: "FB-001",
      linked_to: {},
      custom_field: "preserved"
    };
    const yaml = serializeFrontmatter(fm);
    assert.ok(yaml.includes('custom_field: "preserved"'));
  });
});
