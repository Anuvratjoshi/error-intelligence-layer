import type {
  AnalyzedError,
  AnalyzeOptions,
  PluginContext,
  Severity,
} from "../types/index.js";
import { getConfig } from "./config.js";
import { getPlugins } from "./registry.js";
import { normalizeError } from "../layers/normalization/index.js";
import { parseStack } from "../layers/parsing/index.js";
import { extractCauses } from "../layers/extraction/index.js";
import { enrich } from "../layers/enrichment/index.js";
import { analyze } from "../layers/intelligence/index.js";

// ─────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────

/**
 * Run the full EIL pipeline for a single error value.
 *
 * Stages (in order):
 *   1. Normalize  — coerce unknown → NormalizedError
 *   2. Parse      — raw stack string → StackFrame[]
 *   3. Extract    — walk .cause chain → rootCause + causeChain
 *   4. Enrich     — environment, request, fingerprint, timestamp, metadata
 *   5. Analyze    — severity, suggestions (+ root-cause escalation)
 *   6. Assemble   — merge everything into AnalyzedError
 *   7. Plugins    — run registered onAnalyze hooks in order
 */
export function runPipeline(
  errorValue: unknown,
  options: AnalyzeOptions = {},
): AnalyzedError {
  const config = getConfig();

  // ── 1. Normalize ──────────────────────────────────────────────────────
  const normalized = normalizeError(errorValue);

  // ── 2. Parse stack ────────────────────────────────────────────────────
  const frames = parseStack(normalized);

  // ── 3. Extract causes ─────────────────────────────────────────────────
  const extraction = extractCauses(normalized, config.maxCauseDepth);

  // ── 4. Enrich ─────────────────────────────────────────────────────────
  const enrichment = enrich(
    normalized,
    frames,
    options,
    config.sensitiveKeys,
    config.maxMetadataValueSize,
  );

  // ── 5. Analyze (intelligence) ─────────────────────────────────────────
  // Pick up an explicit severity override when the original was created via
  // createError({ severity }) — stored in metadata under __eil_severity.
  const severityOverride = normalized.metadata["__eil_severity"] as
    | Severity
    | undefined;
  const intelligence = analyze(
    normalized,
    frames,
    extraction,
    enrichment,
    severityOverride,
  );

  // ── 6. Assemble ───────────────────────────────────────────────────────
  // Strip internal metadata keys before exposing to consumers.
  const {
    __eil_severity: _sv,
    __eil: _eil,
    ...publicMetadata
  } = enrichment.metadata as Record<string, unknown>;

  let result: AnalyzedError = {
    type: normalized.type,
    message: normalized.message,
    stack: frames,
    rawStack: normalized.rawStack,
    severity: intelligence.severity,
    fingerprint: enrichment.fingerprint,
    rootCause: extraction.rootCause,
    causeChain: extraction.causeChain,
    suggestions: intelligence.suggestions,
    environment: enrichment.environment,
    request: enrichment.request,
    timestamp: enrichment.timestamp,
    metadata: publicMetadata,
    pluginData: {},
    code: normalized.code,
  };

  // ── 7. Plugins ────────────────────────────────────────────────────────
  if (config.enablePlugins) {
    const ctx: PluginContext = { originalError: errorValue, options };

    for (const plugin of getPlugins()) {
      try {
        const override = plugin.onAnalyze(result, ctx);
        result = { ...result, ...override };
      } catch {
        // A plugin must never crash the consumer — silently skip failures.
      }
    }
  }

  return result;
}
