import type { NormalizedError } from "../../types/index.js";
import {
  MAX_RESPONSE_BODY_CHARS,
  TRUNCATED_SUFFIX,
} from "../../constants/index.js";
import {
  isAxiosError,
  isErrorInstance,
  isPlainObject,
  safeStringify,
  truncate,
} from "../../utils/index.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Extract a message string from any value. */
function extractMessage(value: unknown): string {
  if (typeof value === "string") return value || "Empty string thrown";
  if (typeof value === "number") return `Number thrown: ${value}`;
  if (typeof value === "boolean") return `Boolean thrown: ${value}`;
  if (value === null) return "null was thrown";
  if (value === undefined) return "undefined was thrown";
  if (isErrorInstance(value)) return value.message || value.toString();
  if (isPlainObject(value)) {
    const msg = (value as Record<string, unknown>)["message"];
    if (typeof msg === "string" && msg) return msg;
    return (
      truncate(safeStringify(value), MAX_RESPONSE_BODY_CHARS) + TRUNCATED_SUFFIX
    );
  }
  try {
    return String(value);
  } catch {
    return "Unknown error";
  }
}

/** Extract the constructor type name from any value. */
function extractType(value: unknown): string {
  if (isErrorInstance(value)) {
    return value.constructor?.name || value.name || "Error";
  }
  if (typeof value === "string") return "StringError";
  if (typeof value === "number") return "NumberError";
  if (typeof value === "boolean") return "BooleanError";
  if (value === null) return "NullError";
  if (value === undefined) return "UndefinedError";
  if (isPlainObject(value)) return "ObjectError";
  return "UnknownError";
}

/** Extract machine-readable code from an error-like value. */
function extractCode(value: unknown): string | null {
  if (!isPlainObject(value) && !isErrorInstance(value)) return null;
  const raw = (value as Record<string, unknown>)["code"];
  return typeof raw === "string" ? raw : null;
}

/** Extract the raw stack string. */
function extractRawStack(value: unknown): string | null {
  if (isErrorInstance(value) && typeof value.stack === "string") {
    return value.stack;
  }
  if (isPlainObject(value)) {
    const s = (value as Record<string, unknown>)["stack"];
    if (typeof s === "string") return s;
  }
  return null;
}

// ─────────────────────────────────────────────
// Axios-specific metadata harvesting
// ─────────────────────────────────────────────

function harvestAxiosMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  const response = value["response"];
  if (isPlainObject(response)) {
    const r = response as Record<string, unknown>;
    if (typeof r["status"] === "number") meta["httpStatus"] = r["status"];
    if (typeof r["statusText"] === "string")
      meta["httpStatusText"] = r["statusText"];
    if (r["data"] !== undefined) {
      meta["responseBody"] = truncate(
        safeStringify(r["data"]),
        MAX_RESPONSE_BODY_CHARS,
      );
    }
  }

  const config = value["config"];
  if (isPlainObject(config)) {
    const c = config as Record<string, unknown>;
    if (typeof c["url"] === "string") meta["requestUrl"] = c["url"];
    if (typeof c["method"] === "string")
      meta["requestMethod"] = c["method"].toUpperCase();
  }

  return meta;
}

// ─────────────────────────────────────────────
// General metadata harvesting (plain objects)
// ─────────────────────────────────────────────

const SKIP_KEYS = new Set([
  "message",
  "stack",
  "name",
  "cause",
  // Axios internals already handled above
  "isAxiosError",
  "config",
  "request",
  "response",
  "toJSON",
  // createError internal fields — handled specially
  "metadata",
  "severity",
  "__eil",
]);

function harvestObjectMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SKIP_KEYS.has(k)) continue;
    meta[k] = v;
  }
  return meta;
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────

/**
 * Normalization layer — accepts **any** thrown value and returns a
 * `NormalizedError` that all subsequent pipeline stages can rely on.
 *
 * Handles:
 *  - native Error / Error subclasses
 *  - strings, numbers, booleans
 *  - null / undefined
 *  - plain objects
 *  - Axios errors
 *  - errors with .code (ENOENT, ERR_HTTP2_…)
 *  - framework-wrapped errors (.originalError / .inner)
 */
export function normalizeError(value: unknown): NormalizedError {
  // ── 1. Unwrap one level of framework wrapper ─────────────────────────────
  // Some frameworks (Express 5, Fastify internals) wrap errors in their own
  // objects. We peek at .originalError / .inner to get the real error first.
  const unwrapped = tryUnwrap(value);

  // ── 2. Delegate to the right handler ─────────────────────────────────────
  if (isAxiosError(unwrapped)) return normalizeAxiosError(unwrapped);
  if (isErrorInstance(unwrapped)) return normalizeNativeError(unwrapped);
  if (isPlainObject(unwrapped)) return normalizePlainObject(unwrapped);

  // Primitives and other non-object types
  return normalizePrimitive(value);
}

// ─────────────────────────────────────────────
// Sub-normalizers
// ─────────────────────────────────────────────

function tryUnwrap(value: unknown): unknown {
  if (!isPlainObject(value) && !isErrorInstance(value)) return value;
  // Never unwrap Axios errors — they carry their own rich structure
  if (isAxiosError(value)) return value;
  const obj = value as Record<string, unknown>;
  // Only unwrap framework wrappers (plain Error base class, not subclasses)
  if (isErrorInstance(value) && value.constructor !== Error) return value;
  if (obj["originalError"] != null) return obj["originalError"];
  if (obj["inner"] != null && isErrorInstance(obj["inner"]))
    return obj["inner"];
  return value;
}

function normalizeNativeError(err: Error): NormalizedError {
  const obj = err as unknown as Record<string, unknown>;
  const harvested = harvestObjectMetadata(obj);

  // Merge .metadata set by createError({ metadata }) into the top level
  // instead of nesting it as metadata.metadata.
  const errMeta = obj["metadata"];
  const metadata: Record<string, unknown> =
    errMeta !== null &&
    errMeta !== undefined &&
    typeof errMeta === "object" &&
    !Array.isArray(errMeta)
      ? { ...harvested, ...(errMeta as Record<string, unknown>) }
      : harvested;

  return {
    type: extractType(err),
    message: err.message || err.toString(),
    rawStack: extractRawStack(err),
    originalError: err,
    metadata,
    code: extractCode(err),
  };
}

function normalizeAxiosError(raw: unknown): NormalizedError {
  const value = raw as Record<string, unknown>;
  return {
    type: "AxiosError",
    message: extractMessage(value),
    rawStack: extractRawStack(value),
    originalError: value,
    metadata: harvestAxiosMetadata(value),
    code: extractCode(value),
  };
}

function normalizePlainObject(value: Record<string, unknown>): NormalizedError {
  return {
    type: extractType(value),
    message: extractMessage(value),
    rawStack: extractRawStack(value),
    originalError: value,
    metadata: harvestObjectMetadata(value),
    code: extractCode(value),
  };
}

function normalizePrimitive(value: unknown): NormalizedError {
  return {
    type: extractType(value),
    message: extractMessage(value),
    rawStack: null,
    originalError: value,
    metadata: {},
    code: null,
  };
}
