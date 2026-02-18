import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { detect } from "./detect.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(__dirname, "..", "templates");

function copyTemplate(src, dest) {
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  copyFileSync(src, dest);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function install(flags = []) {
  const projectRoot = process.cwd();
  const autoYes = flags.includes("--yes");

  console.log("\n  product-manager v1.0.0\n");

  // ── Detect environment ──────────────────────────────
  const env = detect(projectRoot);

  console.log("  Environment detected:");
  console.log(`    .product/:        ${env.hasProduct ? "yes" : "no"}`);
  console.log(`    .features/:       ${env.hasFeatures ? "yes" : "no"}`);
  console.log(`    Claude commands:   ${env.hasClaudeCommands ? "yes" : "no"}`);
  console.log();

  const productDir = join(projectRoot, ".product");

  if (existsSync(productDir) && !autoYes) {
    const answer = await ask("  .product/ already exists. Overwrite templates? (y/N) ");
    if (answer !== "y" && answer !== "yes") {
      console.log("  Skipping. Use 'product-manager update' to update commands only.\n");
      return;
    }
  }

  // ── Phase 1/3: Create .product/ directory structure ─
  console.log("  [1/3] Creating .product/ directory structure...");

  const dirs = [
    ".product/inbox",
    ".product/feedbacks/new",
    ".product/feedbacks/triaged",
    ".product/feedbacks/excluded",
    ".product/feedbacks/resolved",
    ".product/backlogs/open",
    ".product/backlogs/in-progress",
    ".product/backlogs/done",
    ".product/backlogs/promoted",
    ".product/backlogs/cancelled",
    ".product/_templates",
  ];

  for (const dir of dirs) {
    const fullPath = join(projectRoot, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      console.log(`    create ${dir}/`);
    }
  }

  // Copy artifact templates
  copyTemplate(
    join(TEMPLATES, "core", "feedback.tpl.md"),
    join(productDir, "_templates", "feedback.tpl.md")
  );
  console.log("    write .product/_templates/feedback.tpl.md");

  copyTemplate(
    join(TEMPLATES, "core", "backlog.tpl.md"),
    join(productDir, "_templates", "backlog.tpl.md")
  );
  console.log("    write .product/_templates/backlog.tpl.md");

  // Index
  const indexPath = join(productDir, "index.yaml");
  if (existsSync(indexPath)) {
    console.log("    skip .product/index.yaml (already exists)");
  } else {
    const template = readFileSync(join(TEMPLATES, "core", "index.yaml"), "utf-8");
    const content = template.replace("{{generated}}", new Date().toISOString());
    writeFileSync(indexPath, content);
    console.log("    write .product/index.yaml");
  }

  // ── Phase 2/3: Install Claude Code commands ─────────
  console.log("  [2/3] Installing Claude Code commands...");

  if (!env.hasClaudeCommands) {
    mkdirSync(join(projectRoot, ".claude", "commands"), { recursive: true });
    console.log("    create .claude/commands/");
  }

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
      console.log(`    write ${dest}`);
    }
  }

  // ── Phase 3/3: Summary ─────────────────────────────
  console.log("  [3/3] Verifying installation...");

  if (!env.hasFeatures) {
    console.log("    note: .features/ not found — /product.promote requires the feature lifecycle system");
  }

  // ── Done ────────────────────────────────────────────
  console.log();
  console.log("  Done! Product Manager installed.");
  console.log();
  console.log("  Next steps:");
  console.log("    1. Run /product.intake \"your feedback text\" to capture feedback");
  console.log("    2. Run /product.triage to process new feedbacks into backlogs");
  console.log("    3. Run /product.dashboard for a health overview");
  console.log();
}
