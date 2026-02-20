/**
 * init command — Scaffold .product/ directory and install slash commands.
 */

import { mkdir, writeFile, copyFile, readdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");

const FEEDBACK_STATUSES = ["new", "triaged", "excluded", "resolved"];
const BACKLOG_STATUSES = ["open", "in-progress", "done", "promoted", "cancelled"];

const EMPTY_INDEX = `product_version: "1.0"
updated: ""

feedbacks:
  total: 0
  by_status:
    new: 0
    triaged: 0
    excluded: 0
    resolved: 0
  by_category:
    critical-bug: 0
    bug: 0
    optimization: 0
    evolution: 0
    new-feature: 0
  items: []

backlogs:
  total: 0
  by_status:
    open: 0
    in-progress: 0
    done: 0
    promoted: 0
    cancelled: 0
  items: []

metrics:
  feedback_to_backlog_rate: 0.00
  backlog_to_feature_rate: 0.00
`;

/**
 * @param {{ yes?: boolean }} options
 */
export async function init(options = {}) {
  const cwd = process.cwd();
  const productDir = join(cwd, ".product");

  console.log("\n  @tcanaud/product-manager\n");

  // ── Detect environment ──────────────────────────────
  const hasProduct = existsSync(productDir);
  const hasFeatures = existsSync(join(cwd, ".features"));
  const hasClaudeCommands = existsSync(join(cwd, ".claude", "commands"));

  console.log("  Environment detected:");
  console.log(`    .product/:        ${hasProduct ? "yes" : "no"}`);
  console.log(`    .features/:       ${hasFeatures ? "yes" : "no"}`);
  console.log(`    Claude commands:   ${hasClaudeCommands ? "yes" : "no"}`);
  console.log();

  if (!options.yes) {
    const confirmed = await confirm("  This will scaffold .product/ and install slash commands. Continue? (y/N) ");
    if (!confirmed) {
      console.log("  Aborted.");
      return;
    }
  }

  // ── Phase 1/3: Create .product/ directory structure ─
  console.log("  [1/3] Creating .product/ directory structure...");

  for (const status of FEEDBACK_STATUSES) {
    const dir = join(productDir, "feedbacks", status);
    await mkdir(dir, { recursive: true });
    console.log(`    create feedbacks/${status}/`);
  }

  for (const status of BACKLOG_STATUSES) {
    const dir = join(productDir, "backlogs", status);
    await mkdir(dir, { recursive: true });
    console.log(`    create backlogs/${status}/`);
  }

  // Create inbox directory
  await mkdir(join(productDir, "inbox"), { recursive: true });
  console.log("    create inbox/");

  // Create _templates directory and copy artifact templates
  await mkdir(join(productDir, "_templates"), { recursive: true });
  try {
    await copyFile(
      join(TEMPLATES_DIR, "core", "feedback.tpl.md"),
      join(productDir, "_templates", "feedback.tpl.md")
    );
    console.log("    write .product/_templates/feedback.tpl.md");
    await copyFile(
      join(TEMPLATES_DIR, "core", "backlog.tpl.md"),
      join(productDir, "_templates", "backlog.tpl.md")
    );
    console.log("    write .product/_templates/backlog.tpl.md");
  } catch (err) {
    console.log("    note: could not copy artifact templates:", err.message);
  }

  // Write initial index.yaml if it doesn't exist
  const indexPath = join(productDir, "index.yaml");
  try {
    await access(indexPath);
    console.log("    skip .product/index.yaml (already exists)");
  } catch {
    await writeFile(indexPath, EMPTY_INDEX, "utf-8");
    console.log("    write .product/index.yaml");
  }

  // ── Phase 2/3: Install Claude Code commands ─────────
  console.log("  [2/3] Installing Claude Code commands...");
  const commandsDir = join(cwd, ".claude", "commands");
  await mkdir(commandsDir, { recursive: true });

  try {
    const commandsTemplateDir = join(TEMPLATES_DIR, "commands");
    const templates = await readdir(commandsTemplateDir);
    for (const template of templates) {
      if (!template.endsWith(".md")) continue;
      const src = join(commandsTemplateDir, template);
      const dest = join(commandsDir, template);
      await copyFile(src, dest);
      console.log(`    write .claude/commands/${template}`);
    }
  } catch (err) {
    console.error(`    Warning: Could not read templates: ${err.message}`);
  }

  // ── Phase 3/3: Summary ─────────────────────────────
  console.log("  [3/3] Verifying installation...");

  if (!hasFeatures) {
    console.log("    note: .features/ not found — /product.promote requires the feature lifecycle system");
  }

  console.log();
  console.log("  Done! Product Manager installed.");
  console.log();
  console.log("  Next steps:");
  console.log("    1. Run /product.intake \"your feedback text\" to capture feedback");
  console.log("    2. Run /product.triage to process new feedbacks into backlogs");
  console.log("    3. Run /product.dashboard for a health overview");
  console.log();
}

/**
 * Simple yes/no prompt.
 */
async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
