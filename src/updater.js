/**
 * update command — Refresh slash commands and artifact templates without modifying .product/ data.
 */

import { mkdir, copyFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");

export async function update() {
  const cwd = process.cwd();
  const productDir = join(cwd, ".product");

  console.log("\n  product-manager update\n");

  // Guard: .product/ must exist
  try {
    await access(productDir);
  } catch {
    console.error("  Error: .product/ not found. Run 'product-manager init' first.");
    process.exit(1);
  }

  // Update artifact templates
  console.log("  Updating artifact templates...");
  try {
    await mkdir(join(productDir, "_templates"), { recursive: true });
    await copyFile(
      join(TEMPLATES_DIR, "core", "feedback.tpl.md"),
      join(productDir, "_templates", "feedback.tpl.md")
    );
    console.log("    update .product/_templates/feedback.tpl.md");
    await copyFile(
      join(TEMPLATES_DIR, "core", "backlog.tpl.md"),
      join(productDir, "_templates", "backlog.tpl.md")
    );
    console.log("    update .product/_templates/backlog.tpl.md");
  } catch (err) {
    console.log("    note: could not update artifact templates:", err.message);
  }

  // Update Claude Code commands
  console.log("  Updating Claude Code commands...");
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
      console.log(`    update .claude/commands/${template}`);
    }
  } catch (err) {
    console.error(`  Error: Could not read templates: ${err.message}`);
    process.exit(1);
  }

  console.log();
  console.log("  Done! Commands and templates updated.");
  console.log("  Your feedbacks, backlogs, inbox, and index.yaml are untouched.\n");
}
