import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(__dirname, "..", "templates");

function copyTemplate(src, dest) {
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  copyFileSync(src, dest);
}

export function update(flags = []) {
  const projectRoot = process.cwd();

  console.log("\n  product-manager update\n");

  if (!existsSync(join(projectRoot, ".product"))) {
    console.error("  Error: .product/ not found. Run 'product-manager init' first.");
    process.exit(1);
  }

  // Update artifact templates
  console.log("  Updating templates...");
  copyTemplate(
    join(TEMPLATES, "core", "feedback.tpl.md"),
    join(projectRoot, ".product", "_templates", "feedback.tpl.md")
  );
  console.log("    update .product/_templates/feedback.tpl.md");

  copyTemplate(
    join(TEMPLATES, "core", "backlog.tpl.md"),
    join(projectRoot, ".product", "_templates", "backlog.tpl.md")
  );
  console.log("    update .product/_templates/backlog.tpl.md");

  // Update Claude Code commands
  console.log("  Updating Claude Code commands...");

  const commandMappings = [
    ["commands/product.intake.md", ".claude/commands/product.intake.md"],
    ["commands/product.triage.md", ".claude/commands/product.triage.md"],
    ["commands/product.backlog.md", ".claude/commands/product.backlog.md"],
    ["commands/product.promote.md", ".claude/commands/product.promote.md"],
    ["commands/product.check.md", ".claude/commands/product.check.md"],
    ["commands/product.dashboard.md", ".claude/commands/product.dashboard.md"],
  ];

  for (const [src, dest] of commandMappings) {
    const srcPath = join(TEMPLATES, src);
    if (existsSync(srcPath)) {
      copyTemplate(srcPath, join(projectRoot, dest));
      console.log(`    update ${dest}`);
    }
  }

  console.log();
  console.log("  Done! Commands and templates updated.");
  console.log("  Your feedbacks, backlogs, inbox, and index.yaml are untouched.\n");
}
