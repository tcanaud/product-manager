#!/usr/bin/env node

import { argv, exit } from "node:process";

const command = argv[2];
const flags = argv.slice(3);

const HELP = `
product-manager — File-based product feedback & backlog system for the kai governance stack.

Usage:
  npx product-manager init      Scaffold .product/ directory and install slash commands
  npx product-manager update    Update commands and templates without touching user data
  npx product-manager help      Show this help message

Options (init):
  --yes             Skip confirmation prompts

Claude Code commands (after init):
  /product.intake [text]        Capture feedback from text or inbox files
  /product.triage [--supervised] Triage new feedbacks into backlogs
  /product.backlog [BL-xxx]     List or inspect backlog items
  /product.promote BL-xxx       Promote backlog to a kai feature
  /product.check                Detect drift and integrity issues
  /product.dashboard [--json]   View product health dashboard
`;

switch (command) {
  case "init": {
    const { install } = await import("../src/installer.js");
    install(flags);
    break;
  }
  case "update": {
    const { update } = await import("../src/updater.js");
    update(flags);
    break;
  }
  case "help":
  case "--help":
  case "-h":
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.log(HELP);
    exit(1);
}
