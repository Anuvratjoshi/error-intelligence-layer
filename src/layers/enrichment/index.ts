import type {
  AnalyzeOptions,
  EnvironmentInfo,
  NormalizedError,
  RequestContext,
  StackFrame,
} from "../../types/index.js";
import {
  DEFAULT_CONFIG,
  FINGERPRINT_SEPARATOR,
  REDACTED_VALUE,
} from "../../constants/index.js";
import { hashString, redactSensitiveKeys } from "../../utils/index.js";

// ─────────────────────────────────────────────
// Environment enrichment
// ─────────────────────────────────────────────

/**
 * Capture a snapshot of the current Node.js process state.
 * Returns null when `includeEnv` is false or when process is unavailable
 * (e.g. browser / edge runtime).
 */
export function captureEnvironment(
  includeEnv: boolean,
): EnvironmentInfo | null {
  if (!includeEnv) return null;
  // Guard: process may not exist in all runtimes
  if (typeof process === "undefined") return null;

  return {
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  };
}

// ─────────────────────────────────────────────
// Fingerprinting
// ─────────────────────────────────────────────

/**
 * Generate a stable, short fingerprint for an error.
 * Identical logical errors (same type + message + origin frame) always
 * produce the same fingerprint — regardless of when they occur.
 *
 * Components used (in order):
 *   1. Error type   (e.g. "TypeError")
 *   2. Normalised message (whitespace collapsed)
 *   3. First stack frame file  (or "no-file")
 *   4. First stack frame line  (or "no-line")
 */
export function buildFingerprint(
  type: string,
  message: string,
  frames: StackFrame[],
): string {
  const firstFrame = frames[0] ?? null;
  const file = firstFrame?.file ?? "no-file";
  const line = firstFrame?.line != null ? String(firstFrame.line) : "no-line";

  // Normalise message: collapse whitespace, lowercase for stability
  const normMsg = message.replace(/\s+/g, " ").trim().toLowerCase();

  const parts = [type, normMsg, file, line];
  const raw = parts.join(FINGERPRINT_SEPARATOR);
  return hashString(raw);
}

// ─────────────────────────────────────────────
// Request context enrichment
// ─────────────────────────────────────────────

/** Headers that are always redacted regardless of sensitiveKeys config. */
const ALWAYS_REDACT_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "proxy-authorization",
]);

/**
 * Sanitise and attach the caller-supplied RequestContext.
 * - Strips sensitive headers unconditionally
 * - Redacts user-configured sensitive keys from params and body
 * - Truncates body to MAX_RESPONSE_BODY_CHARS
 * Returns null when no context was provided.
 */
export function enrichRequest(
  context: RequestContext | undefined,
  sensitiveKeys: readonly string[] = DEFAULT_CONFIG.sensitiveKeys,
): RequestContext | null {
  if (!context) return null;

  const safeHeaders: Record<string, string> = {};
  if (context.headers) {
    for (const [k, v] of Object.entries(context.headers)) {
      safeHeaders[k] = ALWAYS_REDACT_HEADERS.has(k.toLowerCase())
        ? REDACTED_VALUE
        : v;
    }
  }

  const safeParams = context.params
    ? (redactSensitiveKeys(context.params, sensitiveKeys) as Record<
        string,
        unknown
      >)
    : undefined;

  const safeBody =
    context.body !== undefined
      ? redactSensitiveKeys(context.body, sensitiveKeys)
      : undefined;

  return {
    method: context.method,
    url: context.url,
    headers: Object.keys(safeHeaders).length > 0 ? safeHeaders : undefined,
    params: safeParams,
    body: safeBody,
  };
}

// ─────────────────────────────────────────────
// Metadata sanitisation
// ─────────────────────────────────────────────

/**
 * Sanitise the metadata bag from the normalisation layer:
 * - Redact sensitive keys
 * - Truncate oversized string values
 */
export function sanitiseMetadata(
  metadata: Record<string, unknown>,
  sensitiveKeys: readonly string[] = DEFAULT_CONFIG.sensitiveKeys,
  maxValueSize = DEFAULT_CONFIG.maxMetadataValueSize,
): Record<string, unknown> {
  const redacted = redactSensitiveKeys(metadata, sensitiveKeys) as Record<
    string,
    unknown
  >;

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(redacted)) {
    if (typeof v === "string" && v.length > maxValueSize) {
      result[k] = v.slice(0, maxValueSize) + "…[truncated]";
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// Composed enrichment entry point
// ─────────────────────────────────────────────

export interface EnrichmentResult {
  environment: EnvironmentInfo | null;
  request: RequestContext | null;
  fingerprint: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * Enrichment layer — attaches environment info, request context, fingerprint,
 * timestamp, and sanitised metadata to the error being assembled.
 */
export function enrich(
  normalized: NormalizedError,
  frames: StackFrame[],
  options: AnalyzeOptions,
  globalSensitiveKeys: readonly string[] = DEFAULT_CONFIG.sensitiveKeys,
  maxMetadataValueSize = DEFAULT_CONFIG.maxMetadataValueSize,
): EnrichmentResult {
  const includeEnv = options.includeEnv ?? DEFAULT_CONFIG.includeEnv;

  return {
    environment: captureEnvironment(includeEnv),
    request: enrichRequest(options.request, globalSensitiveKeys),
    fingerprint: buildFingerprint(normalized.type, normalized.message, frames),
    timestamp: new Date().toISOString(),
    metadata: sanitiseMetadata(
      normalized.metadata,
      globalSensitiveKeys,
      maxMetadataValueSize,
    ),
  };
}
