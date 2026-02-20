/**
 * index.yaml writer for .product/ directory.
 * Generates the computed summary from scanned feedbacks and backlogs.
 */

import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

/**
 * Extract numeric portion of an ID like "FB-007" → 7, "BL-123" → 123.
 */
function numericId(id) {
  const match = id.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Write index.yaml from scanned data. Atomic write via tmp + rename.
 * @param {string} productDir - Absolute path to .product/
 * @param {object[]} feedbacks - Parsed feedback entities
 * @param {object[]} backlogs - Parsed backlog entities
 */
export async function writeIndex(productDir, feedbacks, backlogs) {
  const now = new Date().toISOString();

  // Sort by numeric ID
  const sortedFeedbacks = [...feedbacks].sort((a, b) => numericId(a.id) - numericId(b.id));
  const sortedBacklogs = [...backlogs].sort((a, b) => numericId(a.id) - numericId(b.id));

  // Count by status
  const fbByStatus = { new: 0, triaged: 0, excluded: 0, resolved: 0 };
  const fbByCategory = { "critical-bug": 0, bug: 0, optimization: 0, evolution: 0, "new-feature": 0 };
  for (const fb of sortedFeedbacks) {
    if (fb.status in fbByStatus) fbByStatus[fb.status]++;
    if (fb.category in fbByCategory) fbByCategory[fb.category]++;
  }

  const blByStatus = { open: 0, "in-progress": 0, done: 0, promoted: 0, cancelled: 0 };
  for (const bl of sortedBacklogs) {
    if (bl.status in blByStatus) blByStatus[bl.status]++;
  }

  // Metrics
  const totalFb = sortedFeedbacks.length;
  const totalBl = sortedBacklogs.length;
  const fbRate = totalFb > 0 ? (fbByStatus.triaged / totalFb) : 0;
  const blRate = totalBl > 0 ? (blByStatus.promoted / totalBl) : 0;

  // Build YAML
  const lines = [];
  lines.push(`product_version: "1.0"`);
  lines.push(`updated: "${now}"`);
  lines.push(``);

  // Feedbacks section
  lines.push(`feedbacks:`);
  lines.push(`  total: ${totalFb}`);
  lines.push(`  by_status:`);
  for (const [k, v] of Object.entries(fbByStatus)) {
    lines.push(`    ${k}: ${v}`);
  }
  lines.push(`  by_category:`);
  for (const [k, v] of Object.entries(fbByCategory)) {
    lines.push(`    ${k}: ${v}`);
  }
  lines.push(`  items:`);
  for (const fb of sortedFeedbacks) {
    lines.push(`    - id: "${fb.id}"`);
    lines.push(`      title: "${(fb.title || "").replace(/"/g, '\\"')}"`);
    lines.push(`      status: "${fb.status || ""}"`);
    lines.push(`      category: "${fb.category || ""}"`);
    lines.push(`      priority: ${fb.priority === null || fb.priority === undefined ? "null" : `"${fb.priority}"`}`);
    lines.push(`      created: "${fb.created || ""}"`);
  }

  lines.push(``);

  // Backlogs section
  lines.push(`backlogs:`);
  lines.push(`  total: ${totalBl}`);
  lines.push(`  by_status:`);
  for (const [k, v] of Object.entries(blByStatus)) {
    lines.push(`    ${k}: ${v}`);
  }
  lines.push(`  items:`);
  for (const bl of sortedBacklogs) {
    lines.push(`    - id: "${bl.id}"`);
    lines.push(`      title: "${(bl.title || "").replace(/"/g, '\\"')}"`);
    lines.push(`      status: "${bl.status || ""}"`);
    lines.push(`      category: "${bl.category || ""}"`);
    lines.push(`      priority: "${bl.priority || ""}"`);
    lines.push(`      created: "${bl.created || ""}"`);
  }

  lines.push(``);

  // Metrics section
  lines.push(`metrics:`);
  lines.push(`  feedback_to_backlog_rate: ${fbRate.toFixed(2)}`);
  lines.push(`  backlog_to_feature_rate: ${blRate.toFixed(2)}`);
  lines.push(``);

  const content = lines.join("\n");
  const indexPath = join(productDir, "index.yaml");
  const tmpPath = join(productDir, "index.yaml.tmp");

  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, indexPath);
}
