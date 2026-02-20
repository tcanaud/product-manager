/**
 * triage command — Triage new feedbacks.
 * Two phases: --plan (read-only JSON output) and --apply (apply plan atomically).
 */

import { access, readdir, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { scanProduct, findBacklog, findFeedback } from "../scanner.js";
import { writeIndex } from "../index-writer.js";
import { parseFrontmatter, reconstructFile } from "../yaml-parser.js";
import { productDirNotFound } from "../errors.js";

/**
 * triage --plan: Output JSON of new feedbacks.
 */
export async function triagePlan(options = {}) {
  const productDir = options.productDir || join(process.cwd(), ".product");

  try {
    await access(productDir);
  } catch {
    productDirNotFound(productDir);
  }

  const newDir = join(productDir, "feedbacks", "new");
  let files = [];
  try {
    files = (await readdir(newDir)).filter(f => f.endsWith(".md"));
  } catch {}

  const feedbacks = [];
  const now = new Date();

  for (const file of files) {
    const filePath = join(newDir, file);
    const content = await readFile(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    if (!frontmatter.id) continue;

    const created = new Date(frontmatter.created || now);
    const daysOld = Math.floor((now - created) / (1000 * 60 * 60 * 24));

    feedbacks.push({
      id: frontmatter.id,
      title: frontmatter.title || "",
      body: body.trim(),
      created: frontmatter.created || "",
      days_old: daysOld
    });
  }

  const output = {
    version: "1.0",
    generated_at: now.toISOString(),
    feedbacks,
    plan: []
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * triage --apply: Apply a triage plan file atomically.
 */
export async function triageApply(planFile, options = {}) {
  const productDir = options.productDir || join(process.cwd(), ".product");

  try {
    await access(productDir);
  } catch {
    productDirNotFound(productDir);
  }

  // Read plan
  let planData;
  try {
    const raw = await readFile(planFile, "utf-8");
    planData = JSON.parse(raw);
  } catch (err) {
    console.error(`Error: Failed to read plan file: ${err.message}`);
    process.exit(1);
  }

  // Validate plan
  const errors = await validatePlan(planData, productDir);
  if (errors.length > 0) {
    for (const e of errors) console.error(`Error: ${e}`);
    process.exit(1);
  }

  const today = new Date().toISOString().split("T")[0];
  let backlogsCreated = 0;
  let backlogsLinked = 0;
  let feedbacksProcessed = 0;

  console.log("Applying triage plan...");

  // Determine starting BL number
  let nextBlNum = await determineNextBacklogNumber(productDir);

  for (const entry of planData.plan) {
    if (entry.action === "create_backlog") {
      const blId = `BL-${String(nextBlNum).padStart(3, "0")}`;
      nextBlNum++;

      // Create backlog file
      const blDir = join(productDir, "backlogs", "open");
      await mkdir(blDir, { recursive: true });

      const bodyParts = [];
      if (entry.regression) bodyParts.push("> **Regression**: This backlog tracks a regression.\n");
      if (entry.notes) bodyParts.push(entry.notes);
      const blBody = bodyParts.length > 0 ? "\n" + bodyParts.join("\n") + "\n" : "\n";

      const blFm = {
        id: blId,
        title: entry.backlog_title,
        status: "open",
        category: entry.category || "new-feature",
        priority: entry.priority || "medium",
        created: today,
        updated: today,
        owner: entry.owner || "",
        feedbacks: entry.feedback_ids || [],
        features: [],
        tags: [],
        promotion: { promoted_date: "", feature_id: "" },
        cancellation: { cancelled_date: "", reason: "" }
      };

      await writeFile(join(blDir, `${blId}.md`), reconstructFile(blFm, blBody), "utf-8");

      // Move feedbacks to triaged/
      for (const fbId of (entry.feedback_ids || [])) {
        await moveFeedbackToTriaged(productDir, fbId, blId, today);
        feedbacksProcessed++;
      }

      const fbNames = (entry.feedback_ids || []).join(", ");
      console.log(`  create_backlog: "${entry.backlog_title}" ← ${fbNames} → ${blId} ✓`);
      backlogsCreated++;

    } else if (entry.action === "link_existing") {
      const bl = await findBacklog(productDir, entry.backlog_id);
      if (!bl) continue;

      // Update backlog feedbacks list
      const blContent = await readFile(bl._filePath, "utf-8");
      const { frontmatter: blFm, body: blBody } = parseFrontmatter(blContent);
      if (!blFm.feedbacks) blFm.feedbacks = [];
      for (const fbId of (entry.feedback_ids || [])) {
        if (!blFm.feedbacks.includes(fbId)) blFm.feedbacks.push(fbId);
      }
      blFm.updated = today;
      await writeFile(bl._filePath, reconstructFile(blFm, blBody), "utf-8");

      // Move feedbacks to triaged/
      for (const fbId of (entry.feedback_ids || [])) {
        await moveFeedbackToTriaged(productDir, fbId, entry.backlog_id, today);
        feedbacksProcessed++;
      }

      const fbNames = (entry.feedback_ids || []).join(", ");
      console.log(`  link_existing: ${entry.backlog_id} ← ${fbNames} ✓`);
      backlogsLinked++;

    } else if (entry.action === "exclude") {
      for (const fbId of (entry.feedback_ids || [])) {
        await moveFeedbackToExcluded(productDir, fbId, entry.reason, today);
        feedbacksProcessed++;
      }
      const fbNames = (entry.feedback_ids || []).join(", ");
      console.log(`  exclude: ${fbNames} (${entry.reason}) ✓`);
    }
  }

  // Regenerate index
  const { feedbacks, backlogs } = await scanProduct(productDir);
  await writeIndex(productDir, feedbacks, backlogs);
  console.log(`  Updating index.yaml... ✓`);

  console.log("");
  console.log(`Triage complete: ${feedbacksProcessed} feedbacks processed, ${backlogsCreated} backlog${backlogsCreated !== 1 ? "s" : ""} created, ${backlogsLinked} linked.`);
}

/**
 * Validate a triage plan before applying.
 */
async function validatePlan(plan, productDir) {
  const errors = [];

  if (plan.version !== "1.0") {
    errors.push(`Invalid plan version: "${plan.version}" (expected "1.0")`);
  }

  if (!Array.isArray(plan.plan)) {
    errors.push("Plan must contain a 'plan' array");
    return errors;
  }

  const seenFeedbackIds = new Set();

  for (let i = 0; i < plan.plan.length; i++) {
    const entry = plan.plan[i];

    for (const fbId of (entry.feedback_ids || [])) {
      // Check for duplicates
      if (seenFeedbackIds.has(fbId)) {
        errors.push(`Feedback ${fbId} appears in multiple plan entries`);
      }
      seenFeedbackIds.add(fbId);

      // Check exists in feedbacks/new/
      const fb = await findFeedbackInNew(productDir, fbId);
      if (!fb) {
        errors.push(`Feedback ${fbId} not found in feedbacks/new/`);
      }
    }

    if (entry.action === "create_backlog" && !entry.backlog_title) {
      errors.push(`Plan entry ${i}: create_backlog requires backlog_title`);
    }

    if (entry.action === "link_existing") {
      if (!entry.backlog_id) {
        errors.push(`Plan entry ${i}: link_existing requires backlog_id`);
      } else {
        const bl = await findBacklog(productDir, entry.backlog_id);
        if (!bl) {
          errors.push(`Backlog ${entry.backlog_id} not found`);
        }
      }
    }

    if (entry.action === "exclude" && !entry.reason) {
      errors.push(`Plan entry ${i}: exclude requires reason`);
    }
  }

  return errors;
}

/**
 * Check if feedback exists specifically in feedbacks/new/.
 */
async function findFeedbackInNew(productDir, id) {
  const filePath = join(productDir, "feedbacks", "new", `${id}.md`);
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Move a feedback to triaged/ and update its frontmatter.
 */
async function moveFeedbackToTriaged(productDir, fbId, blId, today) {
  const fb = await findFeedback(productDir, fbId);
  if (!fb) return;

  const content = await readFile(fb._filePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  frontmatter.status = "triaged";
  frontmatter.updated = today;
  if (!frontmatter.linked_to) frontmatter.linked_to = {};
  if (!frontmatter.linked_to.backlog) frontmatter.linked_to.backlog = [];
  if (!frontmatter.linked_to.backlog.includes(blId)) {
    frontmatter.linked_to.backlog.push(blId);
  }

  const newDir = join(productDir, "feedbacks", "triaged");
  await mkdir(newDir, { recursive: true });
  const newPath = join(newDir, `${fbId}.md`);
  await writeFile(newPath, reconstructFile(frontmatter, body), "utf-8");

  if (fb._filePath !== newPath) {
    const { unlink } = await import("node:fs/promises");
    await unlink(fb._filePath);
  }
}

/**
 * Move a feedback to excluded/ and update its frontmatter.
 */
async function moveFeedbackToExcluded(productDir, fbId, reason, today) {
  const fb = await findFeedback(productDir, fbId);
  if (!fb) return;

  const content = await readFile(fb._filePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  frontmatter.status = "excluded";
  frontmatter.updated = today;
  frontmatter.exclusion_reason = reason;

  const newDir = join(productDir, "feedbacks", "excluded");
  await mkdir(newDir, { recursive: true });
  const newPath = join(newDir, `${fbId}.md`);
  await writeFile(newPath, reconstructFile(frontmatter, body), "utf-8");

  if (fb._filePath !== newPath) {
    const { unlink } = await import("node:fs/promises");
    await unlink(fb._filePath);
  }
}

/**
 * Determine next backlog number.
 */
async function determineNextBacklogNumber(productDir) {
  const numbers = [];
  const statuses = ["open", "in-progress", "done", "promoted", "cancelled"];

  for (const status of statuses) {
    try {
      const files = await readdir(join(productDir, "backlogs", status));
      for (const file of files) {
        const match = file.match(/^BL-(\d+)\.md$/);
        if (match) numbers.push(parseInt(match[1], 10));
      }
    } catch {}
  }

  if (numbers.length === 0) return 1;
  return Math.max(...numbers) + 1;
}
