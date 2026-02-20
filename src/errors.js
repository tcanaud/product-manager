/**
 * Shared error/exit helpers for product-manager commands.
 */

import { exit } from "node:process";

/**
 * Print error about missing .product/ directory and exit.
 */
export function productDirNotFound(dir) {
  throw new Error(`.product/ directory not found${dir ? ` at ${dir}` : ""}. Run \`product-manager init\` to set up.`);
}

/**
 * Print structured validation errors to stderr.
 */
export function validationError(messages) {
  for (const msg of messages) {
    console.error(`Error: ${msg}`);
  }
}

/**
 * Print parse error with file path to stderr.
 */
export function parseError(filePath, message) {
  console.error(`Parse error in ${filePath}: ${message}`);
}
