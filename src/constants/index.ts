import type { EILConfig, Severity } from "../types/index.js";

// ─────────────────────────────────────────────
// Default global configuration
// ─────────────────────────────────────────────

export const DEFAULT_CONFIG: Readonly<EILConfig> = Object.freeze({
  defaultFormat: "json",
  includeEnv: true,
  sensitiveKeys: [
    "password",
    "passwd",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "apikey",
    "api_key",
    "authorization",
    "cookie",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
  ],
  maxMetadataValueSize: 2048,
  maxCauseDepth: 10,
  enablePlugins: true,
});

// ─────────────────────────────────────────────
// Severity mapping
// ─────────────────────────────────────────────

/**
 * Maps well-known Error constructor names to a default severity.
 * The intelligence layer consults this before falling back to "medium".
 */
export const SEVERITY_MAP: Readonly<Record<string, Severity>> = Object.freeze({
  SyntaxError: "critical",
  ReferenceError: "critical",
  TypeError: "high",
  RangeError: "high",
  URIError: "medium",
  EvalError: "medium",
  Error: "medium",
  AggregateError: "high",
});

// ─────────────────────────────────────────────
// Stack frame parsing
// ─────────────────────────────────────────────

/**
 * Matches V8 / Node.js stack frames in two forms:
 *   at functionName (file.ts:10:5)
 *   at file.ts:10:5
 */
export const STACK_FRAME_RE =
  /^\s*at\s+(?:(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))\s*$/;

/**
 * Detects native frames (no file path, or file starts with "node:").
 */
export const NATIVE_FRAME_RE = /\(native\)|^node:/;

/**
 * Column threshold above which a frame is heuristically considered minified.
 */
export const MINIFIED_COLUMN_THRESHOLD = 500;

// ─────────────────────────────────────────────
// Suggestion patterns
// ─────────────────────────────────────────────

/**
 * Ordered list of `[regex, suggestion]` tuples.
 * The intelligence layer iterates these against the error message and type.
 * First match wins per pattern (all matching patterns are collected).
 */
export const SUGGESTION_PATTERNS: ReadonlyArray<
  readonly [pattern: RegExp, suggestion: string]
> = Object.freeze([
  [
    /cannot\s+read\s+propert(?:y|ies)\s+of\s+(?:undefined|null)/i,
    "Use optional chaining (?.) or add a null/undefined guard before accessing the property.",
  ],
  [
    /is\s+not\s+a\s+function/i,
    "Verify the value is callable before invoking it. It may be undefined or the wrong type.",
  ],
  [
    /is\s+not\s+defined/i,
    "Check that the variable is declared and in scope. Look for typos or missing imports.",
  ],
  [
    /unexpected\s+token|expected\s+property\s+name|invalid\s+json|json\s+at\s+position/i,
    "Validate the JSON or source input before parsing. Use a try/catch around JSON.parse().",
  ],
  [
    /JSON\.parse/i,
    "Wrap JSON.parse() in a try/catch and validate the input string first.",
  ],
  [
    /econnrefused/i,
    "The target service refused the connection. Check that it is running and the host/port are correct.",
  ],
  [
    /etimedout|timed\s+out/i,
    "The operation timed out. Check network connectivity or increase the timeout threshold.",
  ],
  [
    /enoent|no\s+such\s+file/i,
    "File or directory not found. Verify the path exists and check for typos.",
  ],
  [
    /permission\s+denied|eacces/i,
    "Insufficient permissions. Check file/resource ownership and permission bits.",
  ],
  [
    /eaddrinuse/i,
    "The port is already in use. Stop the conflicting process or change the port.",
  ],
  [
    /heap\s+out\s+of\s+memory|javascript\s+heap/i,
    "Node.js ran out of heap memory. Increase --max-old-space-size or look for memory leaks.",
  ],
  [
    /maximum\s+call\s+stack/i,
    "Stack overflow detected. Check for unintended infinite recursion.",
  ],
  [
    /invalid\s+argument/i,
    "An invalid argument was passed. Check the function signature and the value types.",
  ],
  [
    /undefined\s+is\s+not\s+an\s+object/i,
    "A property was accessed on undefined. Add a null/undefined check or use optional chaining.",
  ],
  [
    /network\s+error|fetch\s+failed/i,
    "A network request failed. Check internet connectivity and the target URL.",
  ],
]) as ReadonlyArray<readonly [RegExp, string]>;

// ─────────────────────────────────────────────
// Sensitive data redaction
// ─────────────────────────────────────────────

/** Placeholder used in place of a redacted value. */
export const REDACTED_VALUE = "[REDACTED]";

// ─────────────────────────────────────────────
// Metadata / serialisation limits
// ─────────────────────────────────────────────

/** Maximum length (chars) for a truncated string metadata value. */
export const TRUNCATED_SUFFIX = "…[truncated]";

/** Max characters kept in a response body / large metadata value. */
export const MAX_RESPONSE_BODY_CHARS = 500;

// ─────────────────────────────────────────────
// Fingerprinting
// ─────────────────────────────────────────────

/** Separator used when joining fingerprint components before hashing. */
export const FINGERPRINT_SEPARATOR = ":";
