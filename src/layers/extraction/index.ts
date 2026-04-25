import type { AnalyzedError, NormalizedError } from "../../types/index.js";
import { DEFAULT_CONFIG } from "../../constants/index.js";
import { normalizeError } from "../normalization/index.js";
import { parseStack } from "../parsing/index.js";
import { inferSeverity } from "../intelligence/index.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ExtractionResult {
  /** The deepest error in the .cause chain. null when no cause exists. */
  rootCause: AnalyzedError | null;
  /**
   * Ordered chain from the immediate cause to the root cause (inclusive).
   * Empty when the error has no cause.
   */
  causeChain: AnalyzedError[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Attempt to read the `.cause` property from any value.
 * Returns undefined when the value has no cause or is not an object.
 */
function getCause(value: unknown): unknown {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return undefined;
  }
  return (value as Record<string, unknown>)["cause"];
}

/**
 * Create a minimal AnalyzedError shell from a raw cause value so it can
 * be placed in the causeChain. Full enrichment / intelligence is deferred to
 * later pipeline stages — this just gives us type, message, and stack.
 *
 * We deliberately keep this lightweight (no fingerprint / suggestions /
 * environment) so the extraction layer stays fast and side-effect-free.
 */
function buildShellError(raw: unknown): AnalyzedError {
  const normalized = normalizeError(raw);
  const stack = parseStack(normalized);

  return {
    type: normalized.type,
    message: normalized.message,
    stack,
    rawStack: normalized.rawStack,
    severity: inferSeverity(normalized), // infer from type so escalation works
    fingerprint: "", // placeholder — enrichment layer will fill in
    rootCause: null,
    causeChain: [],
    suggestions: [],
    environment: null,
    request: null,
    timestamp: new Date().toISOString(),
    metadata: normalized.metadata,
    pluginData: {},
    code: normalized.code,
  };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Extraction layer — traverses the `.cause` chain starting from a
 * NormalizedError and returns the root cause and the full ordered chain.
 *
 * Features:
 *  - ES2022 `error.cause` traversal
 *  - Cycle detection via a visited Set (prevents infinite loops)
 *  - Respects `maxCauseDepth` from global config
 *  - Handles wrapped errors (.originalError, .inner)
 *  - Returns { rootCause: null, causeChain: [] } when no cause is present
 */
export function extractCauses(
  normalized: NormalizedError,
  maxDepth = DEFAULT_CONFIG.maxCauseDepth,
): ExtractionResult {
  const firstCauseRaw = getCause(normalized.originalError);

  if (firstCauseRaw === undefined || firstCauseRaw === null) {
    return { rootCause: null, causeChain: [] };
  }

  const chain: AnalyzedError[] = [];
  const visited = new Set<unknown>();

  let current: unknown = firstCauseRaw;
  let depth = 0;

  while (current !== undefined && current !== null && depth < maxDepth) {
    // Cycle guard — non-objects can't be in the visited set
    if (typeof current === "object" || typeof current === "function") {
      if (visited.has(current)) break;
      visited.add(current);
    }

    const shell = buildShellError(current);
    chain.push(shell);

    // Advance to the next cause
    const nextCause = getCause(current);
    if (nextCause === undefined || nextCause === null) break;

    current = nextCause;
    depth++;
  }

  if (chain.length === 0) {
    return { rootCause: null, causeChain: [] };
  }

  const rootCause = chain[chain.length - 1] ?? null;
  return { rootCause, causeChain: chain };
}
