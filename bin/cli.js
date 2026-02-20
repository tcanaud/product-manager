#!/usr/bin/env node

import { argv, exit } from "node:process";

const command = argv[2];
const args = argv.slice(3);

// Global error handler for unhandled rejections from async commands
process.on("unhandledRejection", (reason) => {
  console.error(`Error: ${reason?.message || reason}`);
  process.exitCode = 1;
  exit(1);
});

const HELP = `product-manager — File-based product feedback & backlog system for the kai governance stack.

Usage:
  npx @tcanaud/product-manager init       Scaffold .product/ directory and install slash commands
  npx @tcanaud/product-manager update     Update commands and templates without touching user data
  npx @tcanaud/product-manager reindex    Regenerate index.yaml from filesystem scan
  npx @tcanaud/product-manager move       Move backlog item(s) to a new status
  npx @tcanaud/product-manager check      Check product directory integrity
  npx @tcanaud/product-manager promote    Promote a backlog item to a feature
  npx @tcanaud/product-manager triage     Triage new feedbacks
  npx @tcanaud/product-manager help       Show this help

Options (init):
  --yes             Skip confirmation prompts

Claude Code commands (after init):
  /product.intake [text]        Capture feedback from text or inbox files
  /product.triage [--supervised] Triage new feedbacks into backlogs
  /product.backlog [BL-xxx]     List or inspect backlog items
  /product.promote BL-xxx       Promote backlog to a kai feature
  /product.check                Detect drift and integrity issues
  /product.dashboard [--json]   View product health dashboard
  /product.move BL-xxx status   Move backlog item(s) to a new status
  /product.reindex              Regenerate index.yaml`;

switch (command) {
  case "reindex": {
    const { reindex } = await import("../src/commands/reindex.js");
    await reindex({ productDir: process.env.KAI_PRODUCT_DIR });
    break;
  }
  case "move": {
    const { move } = await import("../src/commands/move.js");
    await move(args, { productDir: process.env.KAI_PRODUCT_DIR });
    break;
  }
  case "check": {
    const jsonFlag = args.includes("--json");
    const { check } = await import("../src/commands/check.js");
    const result = await check({ productDir: process.env.KAI_PRODUCT_DIR, json: jsonFlag });
    if (result && !result.ok) process.exitCode = 1;
    break;
  }
  case "promote": {
    const { promote } = await import("../src/commands/promote.js");
    await promote(args, { productDir: process.env.KAI_PRODUCT_DIR });
    break;
  }
  case "triage": {
    const planFlag = args.includes("--plan");
    const applyIdx = args.indexOf("--apply");
    const { triagePlan, triageApply } = await import("../src/commands/triage.js");
    if (planFlag && applyIdx !== -1) {
      console.error("Error: --plan and --apply are mutually exclusive.");
      exit(1);
    } else if (planFlag) {
      await triagePlan({ productDir: process.env.KAI_PRODUCT_DIR });
    } else if (applyIdx !== -1) {
      const planFile = args[applyIdx + 1];
      if (!planFile) {
        console.error("Error: --apply requires a file path argument.");
        exit(1);
      }
      await triageApply(planFile, { productDir: process.env.KAI_PRODUCT_DIR });
    } else {
      console.error("Error: triage requires --plan or --apply <file>.");
      console.error("Usage:");
      console.error("  product-manager triage --plan              Output triage plan as JSON");
      console.error("  product-manager triage --apply <file>      Apply a triage plan");
      exit(1);
    }
    break;
  }
  case "init": {
    const yesFlag = args.includes("--yes");
    const { init } = await import("../src/installer.js");
    await init({ yes: yesFlag });
    break;
  }
  case "update": {
    const { update } = await import("../src/updater.js");
    await update();
    break;
  }
  case "help":
  case "--help":
  case "-h":
  case undefined: {
    console.log(HELP);
    break;
  }
  default: {
    console.error(`Unknown command: ${command}`);
    console.error(HELP);
    exit(1);
  }
}
