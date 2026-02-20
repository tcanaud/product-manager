/**
 * reindex command — Regenerate index.yaml from filesystem scan.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";
import { scanProduct } from "../scanner.js";
import { writeIndex } from "../index-writer.js";
import { productDirNotFound } from "../errors.js";

/**
 * @param {{ productDir?: string }} options
 */
export async function reindex(options = {}) {
  const productDir = options.productDir || join(process.cwd(), ".product");

  // Validate .product/ exists
  try {
    await access(productDir);
  } catch {
    productDirNotFound(productDir);
  }

  console.log("Scanning .product/...");

  const { feedbacks, backlogs } = await scanProduct(productDir);

  // Count by status
  const fbByStatus = { new: 0, triaged: 0, excluded: 0, resolved: 0 };
  for (const fb of feedbacks) {
    if (fb.status in fbByStatus) fbByStatus[fb.status]++;
  }

  const blByStatus = { open: 0, "in-progress": 0, done: 0, promoted: 0, cancelled: 0 };
  for (const bl of backlogs) {
    if (bl.status in blByStatus) blByStatus[bl.status]++;
  }

  const fbSummary = Object.entries(fbByStatus).map(([k, v]) => `${k}: ${v}`).join(", ");
  const blSummary = Object.entries(blByStatus).map(([k, v]) => `${k}: ${v}`).join(", ");

  console.log(`  feedbacks: ${feedbacks.length} (${fbSummary})`);
  console.log(`  backlogs:  ${backlogs.length} (${blSummary})`);

  await writeIndex(productDir, feedbacks, backlogs);

  console.log("index.yaml updated.");
}
