/**
 * promote command — Promote a backlog item to a feature.
 */

import { access, readdir, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { scanProduct, findBacklog, findFeedback } from "../scanner.js";
import { writeIndex } from "../index-writer.js";
import { parseFrontmatter, reconstructFile } from "../yaml-parser.js";
import { productDirNotFound } from "../errors.js";

/**
 * @param {string[]} args - [backlogId]
 * @param {{ productDir?: string }} options
 */
export async function promote(args, options = {}) {
  const productDir = options.productDir || join(process.cwd(), ".product");

  try {
    await access(productDir);
  } catch {
    productDirNotFound(productDir);
  }

  if (args.length < 1 || !args[0]) {
    throw new Error("promote requires a backlog ID argument. Usage: product-manager promote BL-007");
  }

  const backlogId = args[0];
  const bl = await findBacklog(productDir, backlogId);

  if (!bl) {
    throw new Error(`${backlogId} not found in .product/backlogs/`);
  }

  if (bl.status === "promoted") {
    const featureId = bl.promotion?.feature_id || "unknown";
    throw new Error(`${backlogId} is already promoted (feature: ${featureId})`);
  }

  const today = new Date().toISOString().split("T")[0];
  const nowIso = new Date().toISOString();

  console.log(`Promoting ${backlogId}...`);

  // Determine next feature number
  const nextNum = await determineNextFeatureNumber(productDir);
  const paddedNum = String(nextNum).padStart(3, "0");
  const slug = generateSlug(bl.title);
  const featureId = `${paddedNum}-${slug}`;

  console.log(`  Next feature number: ${paddedNum}`);
  console.log(`  Feature ID: ${featureId}`);

  // Create feature YAML
  const repoRoot = findRepoRoot(productDir);
  const featuresDir = options.featuresDir || join(repoRoot, ".features");
  await mkdir(featuresDir, { recursive: true });
  const featureYaml = generateFeatureYaml(featureId, bl, today, nowIso);
  const featurePath = join(featuresDir, `${featureId}.yaml`);
  await writeFile(featurePath, featureYaml, "utf-8");
  console.log(`  Creating .features/${featureId}.yaml... ✓`);

  // Move backlog to promoted/
  const oldPath = bl._filePath;
  const newDir = join(productDir, "backlogs", "promoted");
  await mkdir(newDir, { recursive: true });
  const newPath = join(newDir, `${backlogId}.md`);

  const blContent = await readFile(oldPath, "utf-8");
  const { frontmatter: blFm, body: blBody } = parseFrontmatter(blContent);
  blFm.status = "promoted";
  blFm.updated = today;
  if (!blFm.promotion) blFm.promotion = {};
  blFm.promotion.promoted_date = today;
  blFm.promotion.feature_id = featureId;
  if (!blFm.features) blFm.features = [];
  if (!blFm.features.includes(featureId)) blFm.features.push(featureId);

  await writeFile(newPath, reconstructFile(blFm, blBody), "utf-8");
  if (oldPath !== newPath) {
    const { unlink } = await import("node:fs/promises");
    await unlink(oldPath);
  }
  console.log(`  Moving ${backlogId} to promoted/... ✓`);

  // Update linked feedbacks
  const feedbackIds = bl.feedbacks || [];
  for (const fbId of feedbackIds) {
    const fb = await findFeedback(productDir, fbId);
    if (!fb) continue;

    const fbContent = await readFile(fb._filePath, "utf-8");
    const { frontmatter: fbFm, body: fbBody } = parseFrontmatter(fbContent);
    if (!fbFm.linked_to) fbFm.linked_to = {};
    if (!fbFm.linked_to.features) fbFm.linked_to.features = [];
    if (!fbFm.linked_to.features.includes(featureId)) {
      fbFm.linked_to.features.push(featureId);
    }
    fbFm.updated = today;
    await writeFile(fb._filePath, reconstructFile(fbFm, fbBody), "utf-8");
    console.log(`  Updating ${fbId} (linked feedback)... ✓`);
  }

  // Regenerate index
  const { feedbacks, backlogs } = await scanProduct(productDir);
  await writeIndex(productDir, feedbacks, backlogs);
  console.log(`  Updating index.yaml... ✓`);

  console.log("");
  console.log(`Promoted: ${backlogId} → ${featureId}`);
}

/**
 * Determine the next feature number by scanning .features/ and specs/.
 */
async function determineNextFeatureNumber(productDir) {
  const repoRoot = findRepoRoot(productDir);
  const numbers = [];

  // Scan .features/
  try {
    const files = await readdir(join(repoRoot, ".features"));
    for (const file of files) {
      const match = file.match(/^(\d+)-/);
      if (match) numbers.push(parseInt(match[1], 10));
    }
  } catch {}

  // Scan specs/
  try {
    const dirs = await readdir(join(repoRoot, "specs"));
    for (const dir of dirs) {
      const match = dir.match(/^(\d+)-/);
      if (match) numbers.push(parseInt(match[1], 10));
    }
  } catch {}

  if (numbers.length === 0) return 1;
  return Math.max(...numbers) + 1;
}

/**
 * Generate a URL-safe slug from a title.
 */
export function generateSlug(title) {
  return (title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

/**
 * Find repo root from product dir (go up from .product/).
 */
function findRepoRoot(productDir) {
  // productDir is /path/to/.product, parent is repo root
  return join(productDir, "..");
}

/**
 * Generate feature YAML content per file-schemas.md template.
 */
function generateFeatureYaml(featureId, backlog, today, nowIso) {
  return `feature_version: "1.0"

# ── Identity ──────────────────────────────────────────
feature_id: "${featureId}"
title: "${(backlog.title || "").replace(/"/g, '\\"')}"
status: "active"
owner: "${(backlog.owner || "").replace(/"/g, '\\"')}"
created: "${today}"
updated: "${today}"

# ── Dependencies ──────────────────────────────────────
depends_on: []
tags: ${backlog.tags && backlog.tags.length > 0 ? JSON.stringify(backlog.tags) : "[]"}

# ── Lifecycle (computed) ──────────────────────────────
lifecycle:
  stage: "ideation"
  stage_since: "${today}"
  progress: 0.0
  manual_override: null
  retroactive: false

# ── Artifacts (computed from scan) ────────────────────
artifacts:
  bmad:
    prd: false
    architecture: false
    epics: false
  speckit:
    spec: false
    plan: false
    research: false
    tasks: false
    contracts: false
    tasks_done: 0
    tasks_total: 0
  agreement:
    exists: false
    status: ""
    check: "NOT_APPLICABLE"
  adr:
    count: 0
    ids: []
  mermaid:
    count: 0
    layers:
      L0: 0
      L1: 0
      L2: 0

# ── Health (computed) ─────────────────────────────────
health:
  overall: "HEALTHY"
  agreement: "NOT_APPLICABLE"
  spec_completeness: 0.0
  task_progress: 0.0
  adr_coverage: 0
  diagram_coverage: 0
  warnings: []

# ── Regression Detection ─────────────────────────────
last_scan:
  timestamp: "${nowIso}"
  stage: "ideation"
  artifacts_snapshot:
    bmad_prd: false
    speckit_spec: false
    speckit_plan: false
    speckit_tasks: false
    agreement_exists: false

# ── Conventions ───────────────────────────────────────
conventions:
  - "conv-001-esm-zero-deps"
  - "conv-002-cli-entry-structure"
  - "conv-003-file-based-artifacts"
`;
}
