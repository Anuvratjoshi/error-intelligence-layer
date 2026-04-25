import {
  MAX_RESPONSE_BODY_CHARS,
  REDACTED_VALUE,
  TRUNCATED_SUFFIX,
} from "../constants/index.js";

// ─────────────────────────────────────────────
// Safe stringify (circular-safe)
// ─────────────────────────────────────────────

/**
 * JSON.stringify that never throws.
 * Circular references are replaced with "[Circular]".
 * Optionally pretty-prints with the given indent.
 */
export function safeStringify(value: unknown, indent?: number): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (val !== null && typeof val === "object") {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val as unknown;
      },
      indent,
    );
  } catch {
    return String(value);
  }
}

// ─────────────────────────────────────────────
// Truncation
// ─────────────────────────────────────────────

/** Truncate a string to maxChars, appending a suffix when cut. */
export function truncate(
  value: string,
  maxChars = MAX_RESPONSE_BODY_CHARS,
): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + TRUNCATED_SUFFIX;
}

// ─────────────────────────────────────────────
// Sensitive-key redaction
// ─────────────────────────────────────────────

/**
 * Recursively walk a plain object and replace values whose keys appear in
 * sensitiveKeys (case-insensitive) with REDACTED_VALUE.
 * Returns a new object — the original is never mutated.
 * Handles nested objects and arrays up to depth 10.
 */
export function redactSensitiveKeys(
  obj: unknown,
  sensitiveKeys: readonly string[],
  _depth = 0,
): unknown {
  if (_depth > 10) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      redactSensitiveKeys(item, sensitiveKeys, _depth + 1),
    );
  }
  if (obj !== null && typeof obj === "object") {
    // Use null-prototype object to prevent prototype pollution
    // (guards against __proto__, constructor, toString as keys)
    const result = Object.create(null) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // Skip keys that can pollute the prototype chain
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        continue;
      }
      if (sensitiveKeys.some((s) => s.toLowerCase() === k.toLowerCase())) {
        result[k] = REDACTED_VALUE;
      } else {
        result[k] = redactSensitiveKeys(v, sensitiveKeys, _depth + 1);
      }
    }
    return result;
  }
  return obj;
}

// ─────────────────────────────────────────────
// Simple non-crypto hash (djb2)
// ─────────────────────────────────────────────

/**
 * Fast, deterministic string hash (djb2).
 * Returns a lowercase hex string. Not cryptographic — used for fingerprinting.
 */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0; // keep as uint32
  }
  return hash.toString(16).padStart(8, "0");
}

// ─────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────

/** Returns true when value is a plain object (not an array, not null). */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Returns true when value looks like an Axios error.
 * Real Axios errors are Error instances (AxiosError extends Error),
 * so we check both plain objects AND Error instances.
 */
export function isAxiosError(
  value: unknown,
): value is Record<string, unknown> & { isAxiosError: true } {
  if (value === null || typeof value !== "object") return false;
  return (value as Record<string, unknown>)["isAxiosError"] === true;
}

/** Returns true when value is a native Error or Error subclass instance. */
export function isErrorInstance(value: unknown): value is Error {
  return value instanceof Error;
}
