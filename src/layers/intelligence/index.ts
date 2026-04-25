import type {
  AnalyzedError,
  NormalizedError,
  Severity,
  StackFrame,
} from "../../types/index.js";
import { SEVERITY_MAP, SUGGESTION_PATTERNS } from "../../constants/index.js";
import type { ExtractionResult } from "../extraction/index.js";
import type { EnrichmentResult } from "../enrichment/index.js";

// ─────────────────────────────────────────────
// Severity scoring
// ─────────────────────────────────────────────

/**
 * Infer severity from:
 *  1. An explicit override (e.g. from `createError` metadata)
 *  2. The SEVERITY_MAP for known Error constructor names
 *  3. Heuristics based on the error message
 *  4. Fallback: "low" for completely unknown types
 */
export function inferSeverity(
  normalized: NormalizedError,
  explicitOverride?: Severity,
): Severity {
  if (explicitOverride) return explicitOverride;

  // Check the static map first
  const mapped = SEVERITY_MAP[normalized.type];
  if (mapped) return mapped;

  // Message-based heuristics for errors not in the map
  const msg = normalized.message.toLowerCase();

  if (/out of memory|heap/.test(msg)) return "critical";
  if (/maximum call stack/.test(msg)) return "critical";
  if (/segfault|fatal/.test(msg)) return "critical";
  if (/econnrefused|etimedout|network error/.test(msg)) return "high";
  if (/enoent|permission denied|eacces/.test(msg)) return "medium";
  if (/deprecated|warning/.test(msg)) return "low";

  // Generic / unknown
  return "low";
}

// ─────────────────────────────────────────────
// Suggestion engine
// ─────────────────────────────────────────────

/**
 * Generate human-readable fix suggestions by matching SUGGESTION_PATTERNS
 * against the error message, type, and code.
 *
 * All matching patterns are collected (not just the first).
 * Deduplication is applied so the same suggestion never appears twice.
 */
export function buildSuggestions(normalized: NormalizedError): string[] {
  const haystack = [normalized.message, normalized.type, normalized.code ?? ""]
    .join(" ")
    .toLowerCase();

  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const [pattern, suggestion] of SUGGESTION_PATTERNS) {
    if (pattern.test(haystack) && !seen.has(suggestion)) {
      seen.add(suggestion);
      suggestions.push(suggestion);
    }
  }

  // Add cause-chain hint when there are nested causes
  if (suggestions.length === 0) {
    suggestions.push(
      "Review the error type and message for clues. Check logs immediately before this error for additional context.",
    );
  }

  return suggestions;
}

// ─────────────────────────────────────────────
// Root-cause re-scoring
// ─────────────────────────────────────────────

/**
 * When a root cause exists and its inferred severity is higher than the
 * top-level error's severity, escalate the top-level severity to match.
 * This ensures that a wrapped low-severity error can't hide a critical root.
 */
export function escalateSeverity(
  current: Severity,
  rootCause: AnalyzedError | null,
): Severity {
  if (!rootCause) return current;

  const order: Severity[] = ["low", "medium", "high", "critical"];
  const currentIdx = order.indexOf(current);
  const rootIdx = order.indexOf(rootCause.severity);

  return rootIdx > currentIdx ? rootCause.severity : current;
}

// ─────────────────────────────────────────────
// Intelligence layer input/output
// ─────────────────────────────────────────────

export interface IntelligenceResult {
  severity: Severity;
  suggestions: string[];
}

// ─────────────────────────────────────────────
// Composed entry point
// ─────────────────────────────────────────────

/**
 * Intelligence layer — derives severity and suggestions from the assembled
 * error context. Also escalates severity when the root cause is more severe
 * than the top-level error.
 *
 * Accepts an optional `severityOverride` (set by `createError` via metadata).
 */
export function analyze(
  normalized: NormalizedError,
  _frames: StackFrame[],
  extraction: ExtractionResult,
  _enrichment: EnrichmentResult,
  severityOverride?: Severity,
): IntelligenceResult {
  const rawSeverity = inferSeverity(normalized, severityOverride);
  const severity = escalateSeverity(rawSeverity, extraction.rootCause);
  const suggestions = buildSuggestions(normalized);

  return { severity, suggestions };
}
