/**
 * move command — Move backlog item(s) to a new status.
 */

import { access, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { scanProduct, findBacklog } from "../scanner.js";
import { writeIndex } from "../index-writer.js";
import { parseFrontmatter, serializeFrontmatter, reconstructFile } from "../yaml-parser.js";
import { productDirNotFound, validationError } from "../errors.js";

const VALID_STATUSES = ["open", "in-progress", "done", "promoted", "cancelled"];

/**
 * @param {string[]} args - [ids, targetStatus]
 * @param {{ productDir?: string }} options
 */
export async function move(args, options = {}) {
  const productDir = options.productDir || join(process.cwd(), ".product");

  try {
    await access(productDir);
  } catch {
    productDirNotFound(productDir);
  }

  if (args.length < 2) {
    throw new Error("move requires <ids> <status> arguments. Usage: product-manager move BL-001,BL-002 done");
  }

  const ids = args[0].split(",").map(s => s.trim()).filter(Boolean);
  const targetStatus = args[1];

  // Validate target status
  if (!VALID_STATUSES.includes(targetStatus)) {
    throw new Error(`Invalid status '${targetStatus}'. Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  // Validate all IDs exist (all-or-nothing)
  const found = [];
  const missing = [];
  for (const id of ids) {
    const bl = await findBacklog(productDir, id);
    if (bl) {
      found.push(bl);
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    throw new Error(`${missing.join(", ")} not found in .product/backlogs/`);
  }

  // Check if any are already at target status
  const toMove = [];
  for (const bl of found) {
    if (bl.status === targetStatus) {
      console.log(`${bl.id} is already in status '${targetStatus}'. No changes made.`);
    } else {
      toMove.push(bl);
    }
  }

  if (toMove.length === 0) {
    return; // exit 0
  }

  const today = new Date().toISOString().split("T")[0];

  console.log(`Moving ${toMove.map(b => b.id).join(", ")} to ${targetStatus}...`);

  for (const bl of toMove) {
    const oldPath = bl._filePath;
    const newDir = join(productDir, "backlogs", targetStatus);
    const newPath = join(newDir, `${bl.id}.md`);

    // Read file, update frontmatter
    const content = await readFile(oldPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    const oldStatus = frontmatter.status;
    frontmatter.status = targetStatus;
    frontmatter.updated = today;

    const newContent = reconstructFile(frontmatter, body);

    // Ensure target directory exists
    await mkdir(newDir, { recursive: true });

    // Write to new location, then remove old
    await writeFile(newPath, newContent, "utf-8");
    if (oldPath !== newPath) {
      const { unlink } = await import("node:fs/promises");
      await unlink(oldPath);
    }

    console.log(`  ${bl.id}: ${oldStatus} → ${targetStatus} ✓`);
  }

  // Regenerate index
  console.log("Updating index.yaml... done");
  const { feedbacks, backlogs } = await scanProduct(productDir);
  await writeIndex(productDir, feedbacks, backlogs);
}
