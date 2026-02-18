import { existsSync } from "node:fs";
import { join } from "node:path";

export function detect(projectRoot) {
  const productDir = join(projectRoot, ".product");
  const hasProduct = existsSync(productDir);
  const hasClaudeCommands = existsSync(join(projectRoot, ".claude", "commands"));
  const hasFeatures = existsSync(join(projectRoot, ".features"));

  return {
    hasProduct,
    productDir,
    hasClaudeCommands,
    hasFeatures,
  };
}
