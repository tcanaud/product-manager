/**
 * check command — Check product directory integrity.
 */

import { access, readFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { scanProduct } from "../scanner.js";
import { parseFrontmatter } from "../yaml-parser.js";
import { productDirNotFound } from "../errors.js";

/**
 * @param {{ productDir?: string, json?: boolean }} options
 */
export async function check(options = {}) {
  const productDir = options.productDir || join(process.cwd(), ".product");

  try {
    await access(productDir);
  } catch {
    productDirNotFound(productDir);
  }

  const { feedbacks, backlogs } = await scanProduct(productDir);
  const issues = [];

  // Build ID sets for lookups
  const feedbackIds = new Set(feedbacks.map(f => f.id));
  const backlogIds = new Set(backlogs.map(b => b.id));

  // 1. Status/directory desync
  for (const item of [...feedbacks, ...backlogs]) {
    const dirStatus = basename(dirname(item._filePath));
    if (item.status !== dirStatus) {
      issues.push({
        type: "status_dir_desync",
        severity: "error",
        id: item.id,
        file: item._filePath.replace(/^.*?(\.product\/)/, ".product/"),
        message: `File in '${dirStatus}/' but frontmatter status is '${item.status}'`
      });
    }
  }

  // 2. Stale feedbacks (in new/ for >= 14 days)
  const now = new Date();
  for (const fb of feedbacks) {
    if (fb.status === "new" && fb.created) {
      const created = new Date(fb.created);
      const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      if (days >= 14) {
        issues.push({
          type: "stale_feedback",
          severity: "warning",
          id: fb.id,
          file: fb._filePath.replace(/^.*?(\.product\/)/, ".product/"),
          message: `Feedback in 'new' for ${days} days (threshold: 14)`,
          days_stale: days
        });
      }
    }
  }

  // 3. Broken traceability
  for (const fb of feedbacks) {
    const blLinks = fb.linked_to?.backlog || [];
    for (const blId of blLinks) {
      if (!backlogIds.has(blId)) {
        issues.push({
          type: "broken_chain",
          severity: "error",
          id: fb.id,
          file: fb._filePath.replace(/^.*?(\.product\/)/, ".product/"),
          message: `Feedback ${fb.id} links to non-existent backlog ${blId}`
        });
      }
    }
  }
  for (const bl of backlogs) {
    const fbLinks = bl.feedbacks || [];
    for (const fbId of fbLinks) {
      if (!feedbackIds.has(fbId)) {
        issues.push({
          type: "broken_chain",
          severity: "error",
          id: bl.id,
          file: bl._filePath.replace(/^.*?(\.product\/)/, ".product/"),
          message: `Backlog ${bl.id} links to non-existent feedback ${fbId}`
        });
      }
    }
  }

  // 4. Orphaned backlogs (open/ with no linked feedbacks)
  for (const bl of backlogs) {
    if (bl.status === "open") {
      const fbLinks = bl.feedbacks || [];
      if (fbLinks.length === 0) {
        issues.push({
          type: "orphaned_backlog",
          severity: "warning",
          id: bl.id,
          file: bl._filePath.replace(/^.*?(\.product\/)/, ".product/"),
          message: `Backlog ${bl.id} in 'open' with no linked feedbacks`
        });
      }
    }
  }

  // 5. Index desync
  try {
    const indexContent = await readFile(join(productDir, "index.yaml"), "utf-8");
    const { frontmatter: idx } = parseFrontmatter(`---\n${indexContent}\n---`);
    // Parse the index to find total counts
    const indexFbTotal = parseIndexTotal(indexContent, "feedbacks");
    const indexBlTotal = parseIndexTotal(indexContent, "backlogs");

    if (indexFbTotal !== null && indexFbTotal !== feedbacks.length) {
      issues.push({
        type: "index_desync",
        severity: "error",
        message: `index.yaml reports ${indexFbTotal} feedbacks, ${feedbacks.length} found on disk`
      });
    }
    if (indexBlTotal !== null && indexBlTotal !== backlogs.length) {
      issues.push({
        type: "index_desync",
        severity: "error",
        message: `index.yaml reports ${indexBlTotal} backlogs, ${backlogs.length} found on disk`
      });
    }
  } catch {
    // No index.yaml exists — that's an issue if there are items
    if (feedbacks.length > 0 || backlogs.length > 0) {
      issues.push({
        type: "index_desync",
        severity: "error",
        message: `index.yaml missing but ${feedbacks.length} feedbacks and ${backlogs.length} backlogs found on disk`
      });
    }
  }

  // Output
  if (options.json) {
    const warnings = issues.filter(i => i.severity === "warning").length;
    const errors = issues.filter(i => i.severity === "error").length;
    const output = {
      version: "1.0",
      checked_at: new Date().toISOString(),
      ok: issues.length === 0,
      issues,
      summary: {
        total_issues: issues.length,
        warnings,
        errors
      }
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log("Checking .product/ integrity...");
    console.log("");

    // Group by type
    const byType = {
      status_dir_desync: { label: "Status/directory sync", issues: [] },
      stale_feedback: { label: "Stale feedbacks", issues: [] },
      broken_chain: { label: "Traceability chains", issues: [] },
      orphaned_backlog: { label: "Orphaned backlogs", issues: [] },
      index_desync: { label: "Index desync", issues: [] }
    };

    for (const issue of issues) {
      if (byType[issue.type]) byType[issue.type].issues.push(issue);
    }

    for (const [, group] of Object.entries(byType)) {
      if (group.issues.length === 0) {
        console.log(`  ✓ ${group.label}: OK`);
      } else {
        console.log(`  ✗ ${group.label}: ${group.issues.length} issue${group.issues.length > 1 ? "s" : ""}`);
        for (const issue of group.issues) {
          console.log(`    - ${issue.message}`);
        }
      }
    }

    if (issues.length > 0) {
      console.log("");
      console.log(`${issues.length} issue${issues.length > 1 ? "s" : ""} found. Run \`product-manager reindex\` to fix index desync.`);
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Parse a total count from index.yaml content for a given section.
 */
function parseIndexTotal(content, section) {
  const regex = new RegExp(`${section}:\\s*\\n\\s*total:\\s*(\\d+)`);
  const match = content.match(regex);
  return match ? parseInt(match[1], 10) : null;
}
