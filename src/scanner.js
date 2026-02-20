/**
 * .product/ directory scanner.
 * Walks all status subdirectories and parses feedback/backlog files.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./yaml-parser.js";

const FEEDBACK_STATUSES = ["new", "triaged", "excluded", "resolved"];
const BACKLOG_STATUSES = ["open", "in-progress", "done", "promoted", "cancelled"];

/**
 * Scan .product/ and return all parsed entities.
 * @param {string} productDir - Absolute path to .product/ directory
 * @returns {Promise<{ feedbacks: object[], backlogs: object[] }>}
 */
export async function scanProduct(productDir) {
  const feedbacks = [];
  const backlogs = [];

  // Scan feedbacks
  for (const status of FEEDBACK_STATUSES) {
    const dir = join(productDir, "feedbacks", status);
    const files = await safeReaddir(dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(dir, file);
      const entity = await parseFile(filePath);
      if (entity) {
        feedbacks.push(entity);
      }
    }
  }

  // Scan backlogs
  for (const status of BACKLOG_STATUSES) {
    const dir = join(productDir, "backlogs", status);
    const files = await safeReaddir(dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(dir, file);
      const entity = await parseFile(filePath);
      if (entity) {
        backlogs.push(entity);
      }
    }
  }

  return { feedbacks, backlogs };
}

/**
 * Find a specific backlog by ID across all status directories.
 * @param {string} productDir
 * @param {string} id - e.g. "BL-007"
 * @returns {Promise<object|null>}
 */
export async function findBacklog(productDir, id) {
  for (const status of BACKLOG_STATUSES) {
    const dir = join(productDir, "backlogs", status);
    const filePath = join(dir, `${id}.md`);
    const entity = await parseFile(filePath);
    if (entity) return entity;
  }
  return null;
}

/**
 * Find a specific feedback by ID across all status directories.
 * @param {string} productDir
 * @param {string} id - e.g. "FB-102"
 * @returns {Promise<object|null>}
 */
export async function findFeedback(productDir, id) {
  for (const status of FEEDBACK_STATUSES) {
    const dir = join(productDir, "feedbacks", status);
    const filePath = join(dir, `${id}.md`);
    const entity = await parseFile(filePath);
    if (entity) return entity;
  }
  return null;
}

/**
 * Read and parse a single file. Returns null if file doesn't exist or parse fails.
 */
async function parseFile(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    if (!frontmatter || Object.keys(frontmatter).length === 0) {
      console.error(`Warning: Malformed frontmatter in ${filePath}, skipping.`);
      return null;
    }
    return { ...frontmatter, _filePath: filePath, _body: body };
  } catch (err) {
    if (err.code === "ENOENT") return null;
    console.error(`Warning: Error reading ${filePath}: ${err.message}, skipping.`);
    return null;
  }
}

/**
 * Read directory entries, returning empty array if dir doesn't exist.
 */
async function safeReaddir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
