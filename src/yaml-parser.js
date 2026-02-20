/**
 * Regex-based YAML frontmatter parser for .product/ files.
 * Zero dependencies — Node.js built-ins only.
 */

/**
 * Known field order for feedback files (used in serialization).
 */
const FEEDBACK_FIELD_ORDER = [
  "id", "title", "status", "category", "priority", "source", "reporter",
  "created", "updated", "tags", "exclusion_reason", "linked_to", "resolution"
];

/**
 * Known field order for backlog files (used in serialization).
 */
const BACKLOG_FIELD_ORDER = [
  "id", "title", "status", "category", "priority", "created", "updated",
  "owner", "feedbacks", "features", "tags", "promotion", "cancellation"
];

/**
 * Parse YAML frontmatter from a Markdown file content.
 * @param {string} content - Full file content with --- delimiters
 * @returns {{ frontmatter: object, body: string }}
 */
export function parseFrontmatter(content) {
  if (!content || typeof content !== "string") {
    return { frontmatter: {}, body: "" };
  }

  const lines = content.split("\n");

  // Find opening ---
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      start = i;
      break;
    }
  }
  if (start === -1) {
    return { frontmatter: {}, body: content };
  }

  // Find closing ---
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlLines = lines.slice(start + 1, end);
  const body = lines.slice(end + 1).join("\n");

  const frontmatter = parseYamlLines(yamlLines);
  return { frontmatter, body };
}

/**
 * Parse YAML lines into an object.
 * Supports: scalars, block lists, inline lists [], nested objects via indent tracking.
 */
function parseYamlLines(lines) {
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // Only process top-level keys (indent 0)
    if (indent > 0) {
      i++;
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z_][\w_-]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();

    // Check if next lines are indented (nested object or block list)
    const childLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (nextLine.trim() === "" || nextLine.trim().startsWith("#")) {
        childLines.push(nextLine);
        j++;
        continue;
      }
      const nextIndent = nextLine.length - nextLine.trimStart().length;
      if (nextIndent > 0) {
        childLines.push(nextLine);
        j++;
      } else {
        break;
      }
    }

    if (rawValue === "" && childLines.length > 0) {
      // Could be nested object or block list
      const firstContent = childLines.find(l => l.trim() !== "" && !l.trim().startsWith("#"));
      if (firstContent && firstContent.trim().startsWith("- ")) {
        // Block list
        result[key] = parseBlockList(childLines);
      } else {
        // Nested object
        result[key] = parseNestedObject(childLines);
      }
      i = j;
    } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      // Inline list
      result[key] = parseInlineList(rawValue);
      i = j;
    } else {
      // Scalar value
      result[key] = parseScalar(rawValue);
      i = j;
    }
  }

  return result;
}

/**
 * Parse a nested YAML object from indented lines.
 */
function parseNestedObject(lines) {
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const trimmed = line.trimStart();
    const kvMatch = trimmed.match(/^([a-zA-Z_][\w_-]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();
    const currentIndent = line.length - line.trimStart().length;

    // Look for deeper children
    const childLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (nextLine.trim() === "" || nextLine.trim().startsWith("#")) {
        childLines.push(nextLine);
        j++;
        continue;
      }
      const nextIndent = nextLine.length - nextLine.trimStart().length;
      if (nextIndent > currentIndent) {
        childLines.push(nextLine);
        j++;
      } else {
        break;
      }
    }

    if (rawValue === "" && childLines.length > 0) {
      const firstContent = childLines.find(l => l.trim() !== "" && !l.trim().startsWith("#"));
      if (firstContent && firstContent.trim().startsWith("- ")) {
        result[key] = parseBlockList(childLines);
      } else {
        result[key] = parseNestedObject(childLines);
      }
    } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      result[key] = parseInlineList(rawValue);
    } else {
      result[key] = parseScalar(rawValue);
    }
    i = j;
  }

  return result;
}

/**
 * Parse a block list (lines starting with "- ").
 */
function parseBlockList(lines) {
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^-\s+(.*)/);
    if (match) {
      items.push(parseScalar(match[1].trim()));
    }
  }
  return items;
}

/**
 * Parse inline list like [a, b, c] or ["a", "b"].
 */
function parseInlineList(str) {
  const inner = str.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map(item => parseScalar(item.trim()));
}

/**
 * Parse a scalar YAML value.
 */
function parseScalar(value) {
  if (value === "" || value === '""' || value === "''") return "";
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;

  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

/**
 * Serialize a frontmatter object back to YAML string (between --- delimiters).
 * Preserves field order based on detected schema (feedback vs backlog).
 * Round-trip safe — unknown fields are appended at the end.
 *
 * @param {object} frontmatter - The frontmatter object
 * @returns {string} - The serialized YAML (without --- delimiters)
 */
export function serializeFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== "object") return "";

  // Detect schema by key presence
  const fieldOrder = frontmatter.linked_to !== undefined ? FEEDBACK_FIELD_ORDER : BACKLOG_FIELD_ORDER;

  const lines = [];
  const serializedKeys = new Set();

  // Serialize in order
  for (const key of fieldOrder) {
    if (key in frontmatter) {
      serializeField(lines, key, frontmatter[key], 0);
      serializedKeys.add(key);
    }
  }

  // Append unknown fields
  for (const key of Object.keys(frontmatter)) {
    if (!serializedKeys.has(key) && !key.startsWith("_")) {
      serializeField(lines, key, frontmatter[key], 0);
    }
  }

  return lines.join("\n");
}

/**
 * Serialize a single field at the given indent level.
 */
function serializeField(lines, key, value, indent) {
  const prefix = "  ".repeat(indent);

  if (value === null || value === undefined) {
    lines.push(`${prefix}${key}: null`);
  } else if (typeof value === "boolean") {
    lines.push(`${prefix}${key}: ${value}`);
  } else if (typeof value === "number") {
    lines.push(`${prefix}${key}: ${value}`);
  } else if (typeof value === "string") {
    if (value === "") {
      lines.push(`${prefix}${key}: ""`);
    } else {
      lines.push(`${prefix}${key}: "${value}"`);
    }
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${prefix}${key}: []`);
    } else {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        if (typeof item === "string") {
          lines.push(`${prefix}  - "${item}"`);
        } else {
          lines.push(`${prefix}  - ${item}`);
        }
      }
    }
  } else if (typeof value === "object") {
    lines.push(`${prefix}${key}:`);
    for (const [k, v] of Object.entries(value)) {
      serializeField(lines, k, v, indent + 1);
    }
  }
}

/**
 * Reconstruct a full file from frontmatter object and body text.
 * @param {object} frontmatter
 * @param {string} body
 * @returns {string}
 */
export function reconstructFile(frontmatter, body) {
  const yaml = serializeFrontmatter(frontmatter);
  return `---\n${yaml}\n---\n${body}`;
}
