import type {
  AnalyzedError,
  AnalyzeOptions,
  CreateErrorOptions,
  FormatType,
  IntelligentError,
  WrappedAsyncFn,
  WrappedResult,
} from "../types/index.js";
import { getConfig } from "./config.js";
import { runPipeline } from "./pipeline.js";
import { buildFingerprint } from "../layers/enrichment/index.js";
import { normalizeError } from "../layers/normalization/index.js";
import { parseStack } from "../layers/parsing/index.js";
import { format } from "../layers/formatting/index.js";
import { fetchAISuggestions } from "../ai/index.js";

// ─────────────────────────────────────────────
// analyzeError
// ─────────────────────────────────────────────

/**
 * Main entry point. Accepts any thrown value and returns a fully enriched,
 * structured AnalyzedError.
 */
export function analyzeError(
  error: unknown,
  options: AnalyzeOptions = {},
): AnalyzedError {
  return runPipeline(error, options);
}

// ─────────────────────────────────────────────
// createError
// ─────────────────────────────────────────────

/**
 * Factory for creating structured custom errors that carry EIL metadata.
 * When analyzed by analyzeError(), the severity, code, and metadata are
 * preserved and used directly instead of being re-inferred.
 */
export function createError(
  message: string,
  options: CreateErrorOptions = {},
): IntelligentError {
  const err = new Error(message) as IntelligentError;

  // Mark as EIL-created
  Object.defineProperty(err, "__eil", { value: true, enumerable: false });

  if (options.cause !== undefined) {
    // ES2022 cause — native in Node 16.9+
    Object.defineProperty(err, "cause", {
      value: options.cause,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  if (options.code) {
    Object.defineProperty(err, "code", {
      value: options.code,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  // Stash severity and metadata on the error so the pipeline can read them
  // without re-inferring. Use non-enumerable for severity to avoid leaking
  // internal fields, but we store it in a known way the pipeline reads.
  if (options.severity) {
    (err as unknown as Record<string, unknown>)["__eil_severity"] =
      options.severity;
    err.severity = options.severity;
  }

  if (options.metadata) {
    err.metadata = options.metadata;
  }

  return err;
}

// ─────────────────────────────────────────────
// wrapAsync
// ─────────────────────────────────────────────

/**
 * Wraps an async function so it never throws.
 * Returns a [AnalyzedError, undefined] tuple on failure,
 * or [null, result] on success.
 *
 * Usage:
 *   const safeRead = wrapAsync(fs.promises.readFile);
 *   const [err, data] = await safeRead("./file.txt", "utf-8");
 */
export function wrapAsync<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
): WrappedAsyncFn<TArgs, TReturn> {
  return async (...args: TArgs): Promise<WrappedResult<TReturn>> => {
    try {
      const result = await fn(...args);
      return [null, result];
    } catch (err) {
      return [analyzeError(err), undefined];
    }
  };
}

// ─────────────────────────────────────────────
// withErrorBoundary
// ─────────────────────────────────────────────

/**
 * Higher-order wrapper for sync and async functions.
 * On error, calls the optional onError handler instead of throwing.
 * When no handler is provided, the AnalyzedError is logged to stderr.
 */
export function withErrorBoundary<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  onError?: (error: AnalyzedError) => void,
): (...args: TArgs) => TReturn | Promise<TReturn> | undefined {
  return (...args: TArgs): TReturn | Promise<TReturn> | undefined => {
    try {
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((err: unknown) => {
          const analyzed = analyzeError(err);
          if (onError) {
            onError(analyzed);
          } else {
            process.stderr.write(formatError(analyzed, "compact") + "\n");
          }
          return undefined;
        }) as Promise<TReturn>;
      }

      return result;
    } catch (err) {
      const analyzed = analyzeError(err);
      if (onError) {
        onError(analyzed);
      } else {
        process.stderr.write(formatError(analyzed, "compact") + "\n");
      }
      return undefined;
    }
  };
}

// ─────────────────────────────────────────────
// formatError
// ─────────────────────────────────────────────

/**
 * Serialise a fully-assembled AnalyzedError to the requested format.
 * Defaults to the global defaultFormat when formatType is not supplied.
 */
export function formatError(
  error: AnalyzedError,
  formatType?: FormatType,
): string {
  const ft = formatType ?? getConfig().defaultFormat;
  return format(error, ft);
}

// ─────────────────────────────────────────────
// getErrorFingerprint
// ─────────────────────────────────────────────

/**
 * Generate a stable deduplication fingerprint for any thrown value without
 * running the full pipeline. Useful for quick grouping in error monitors.
 */
export function getErrorFingerprint(error: unknown): string {
  const normalized = normalizeError(error);
  const frames = parseStack(normalized);
  return buildFingerprint(normalized.type, normalized.message, frames);
}

// ─────────────────────────────────────────────
// AI enrichment (shared internal helper)
// ─────────────────────────────────────────────

/**
 * Calls the configured AI provider and returns a copy of `analyzed` with
 * `aiSuggestion` populated. Never throws — any failure is surfaced as a
 * message inside `aiSuggestion`.
 */
async function enrichWithAI(
  analyzed: AnalyzedError,
  context?: string,
): Promise<AnalyzedError> {
  const config = getConfig();
  if (!config.enableAISuggestions || !config.aiApiKey) return analyzed;

  // aiFixSuggested is a dev-only field: never populate in production.
  // The NODE_ENV check is a hard guard that cannot be overridden by config.
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production";
  const includeFix = config.enableAIFix && !isProduction;

  const aiResult = await fetchAISuggestions(
    analyzed,
    config.aiApiKey,
    config.aiBaseUrl,
    config.aiModel,
    context,
    includeFix,
  );

  return {
    ...analyzed,
    aiSuggestion: aiResult.suggestions,
    ...(includeFix && aiResult.fix != null
      ? { aiFixSuggested: aiResult.fix }
      : {}),
  };
}

// ─────────────────────────────────────────────
// analyzeErrorAsync
// ─────────────────────────────────────────────

/**
 * Async variant of `analyzeError`. Runs the full sync pipeline then calls the
 * configured AI provider to populate `aiSuggestion` on the result.
 *
 * Falls back gracefully: if AI is disabled or the call fails, the result is
 * identical to `analyzeError()`.
 *
 * Requires `aiApiKey` and `enableAISuggestions: true` in `configure()`.
 *
 * @example
 * configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });
 * const analyzed = await analyzeErrorAsync(err);
 * console.log(analyzed.suggestions);   // pattern-based (always present)
 * console.log(analyzed.aiSuggestion);  // AI-generated (when configured)
 */
export async function analyzeErrorAsync(
  error: unknown,
  options: AnalyzeOptions = {},
): Promise<AnalyzedError> {
  const analyzed = runPipeline(error, options);
  return enrichWithAI(analyzed, options.context);
}

// ─────────────────────────────────────────────
// wrapAsyncWithAI
// ─────────────────────────────────────────────

/**
 * Like `wrapAsync` but enriches the error tuple with AI suggestions on failure.
 * When AI is disabled the result is identical to `wrapAsync`.
 *
 * @example
 * configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });
 * const safeRead = wrapAsyncWithAI(fs.promises.readFile);
 * const [err, content] = await safeRead('./config.json', 'utf-8');
 * if (err) console.log(err.aiSuggestion);
 */
export function wrapAsyncWithAI<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
): WrappedAsyncFn<TArgs, TReturn> {
  const fnSource = fn.toString().slice(0, 2000);
  return async function wrappedWithAI(
    ...args: TArgs
  ): Promise<WrappedResult<TReturn>> {
    try {
      const result = await fn(...args);
      return [null, result];
    } catch (err) {
      const analyzed = await analyzeErrorAsync(err, { context: fnSource });
      return [analyzed, undefined];
    }
  };
}

// ─────────────────────────────────────────────
// withErrorBoundaryAsync
// ─────────────────────────────────────────────

/**
 * Like `withErrorBoundary` but guarantees the `onError` callback receives an
 * `AnalyzedError` enriched with `aiSuggestion`. When AI is disabled the
 * behaviour is identical to `withErrorBoundary`.
 *
 * @example
 * const safeExport = withErrorBoundaryAsync(
 *   (id: string) => generateReport(id),
 *   (err) => alerting.send({ hint: err.aiSuggestion?.[0] }),
 * );
 * await safeExport('rpt_123');
 */
export function withErrorBoundaryAsync<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  onError?: (error: AnalyzedError) => void,
): (...args: TArgs) => Promise<TReturn | undefined> {
  const fnSource = fn.toString().slice(0, 2000);
  return async function boundaryWithAI(
    ...args: TArgs
  ): Promise<TReturn | undefined> {
    try {
      return await fn(...args);
    } catch (err) {
      const analyzed = await analyzeErrorAsync(err, { context: fnSource });
      if (onError) {
        onError(analyzed);
      } else {
        process.stderr.write(formatError(analyzed, "compact") + "\n");
      }
      return undefined;
    }
  };
}
