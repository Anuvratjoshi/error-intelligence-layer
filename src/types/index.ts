// ─────────────────────────────────────────────
// Primitive enums / unions
// ─────────────────────────────────────────────

/** How severe the error is. Used for triage and alerting. */
export type Severity = "low" | "medium" | "high" | "critical";

/** Output serialisation format. */
export type FormatType = "json" | "pretty" | "compact";

// ─────────────────────────────────────────────
// Stack frames
// ─────────────────────────────────────────────

/** A single parsed frame from the raw stack string. */
export interface StackFrame {
  /** Source file path or URL (null when unavailable). */
  file: string | null;
  /** 1-based line number. */
  line: number | null;
  /** 1-based column number. */
  column: number | null;
  /** Function or method name. */
  fn: string | null;
  /** True when the frame is from a Node.js built-in (e.g. `node:internal`). */
  isNative: boolean;
  /** True when the frame originates from node_modules. */
  isThirdParty: boolean;
  /** Heuristic flag: column > 500 suggests bundled/minified code. */
  isMinified: boolean;
}

// ─────────────────────────────────────────────
// Environment snapshot
// ─────────────────────────────────────────────

/** Process-level runtime information captured at analysis time. */
export interface EnvironmentInfo {
  nodeVersion: string;
  platform: NodeJS.Platform;
  pid: number;
  memory: NodeJS.MemoryUsage;
  /** Process uptime in seconds. */
  uptime: number;
}

// ─────────────────────────────────────────────
// HTTP request context (optional, user-supplied)
// ─────────────────────────────────────────────

/**
 * Attach this when calling analyzeError() inside an HTTP handler so the
 * enrichment layer can include request metadata in the output.
 * Sensitive headers (Authorization, Cookie, x-api-key …) are stripped
 * automatically by the enrichment layer.
 */
export interface RequestContext {
  method?: string;
  url?: string;
  /** Raw request headers. Sensitive keys are redacted before storage. */
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  /** Request body. Large values are truncated. */
  body?: unknown;
}

// ─────────────────────────────────────────────
// Normalized error (output of the normalization layer)
// ─────────────────────────────────────────────

/**
 * The canonical internal representation produced by the normalization layer.
 * All subsequent layers consume this shape.
 */
export interface NormalizedError {
  /** Constructor name, e.g. "TypeError". Falls back to "UnknownError". */
  type: string;
  message: string;
  /** Raw `.stack` string or null when not available. */
  rawStack: string | null;
  /** The original thrown value, preserved for downstream layers. */
  originalError: unknown;
  /** Extra properties harvested from the original (e.g. Axios fields). */
  metadata: Record<string, unknown>;
  /** Machine-readable error code when present (e.g. "ENOENT", "ERR_HTTP2_…"). */
  code: string | null;
}

// ─────────────────────────────────────────────
// Plugin system
// ─────────────────────────────────────────────

/** Context passed to every plugin's onAnalyze hook. */
export interface PluginContext {
  /** The original thrown value before normalization. */
  originalError: unknown;
  options: AnalyzeOptions;
}

/**
 * A plugin receives the fully-assembled AnalyzedError and may return
 * a partial override. All overrides are shallow-merged into the final result.
 * Plugin-specific data should live under `pluginData[plugin.name]`.
 */
export interface Plugin {
  name: string;
  onAnalyze(
    error: AnalyzedError,
    context: PluginContext,
  ): Partial<AnalyzedError>;
}

// ─────────────────────────────────────────────
// Core output type
// ─────────────────────────────────────────────

/**
 * The fully enriched, analyzed error object returned by `analyzeError()`.
 * This is the central public type of the library.
 */
export interface AnalyzedError {
  /** Constructor name, e.g. "TypeError". */
  type: string;
  /** Normalized error message. */
  message: string;
  /** Parsed stack frames (empty array when stack is unavailable). */
  stack: StackFrame[];
  /** Raw stack string (null when unavailable). */
  rawStack: string | null;
  /** Inferred severity. */
  severity: Severity;
  /** Stable deduplication hash (type + message + first frame). */
  fingerprint: string;
  /** Deepest root cause found by traversing .cause chains. null if none. */
  rootCause: AnalyzedError | null;
  /** Full ordered chain: [immediate cause, …, root cause]. */
  causeChain: AnalyzedError[];
  /** Human-readable fix suggestions produced by the intelligence layer. */
  suggestions: string[];
  /**
   * AI-generated suggestions from the xAI Grok API.
   * Populated only when `xaiApiKey` is configured and `enableAISuggestions` is true.
   * Contains a rate-limit message when the daily quota is exhausted.
   */
  aiSuggestion?: string[];
  /** Runtime environment snapshot (null when includeEnv: false). */
  environment: EnvironmentInfo | null;
  /** HTTP request context (null when not provided). */
  request: RequestContext | null;
  /** ISO 8601 timestamp of when analyzeError() was called. */
  timestamp: string;
  /** Arbitrary key-value metadata (from createError, Axios, plugins…). */
  metadata: Record<string, unknown>;
  /** Namespace for plugin-contributed data: `pluginData["my-plugin"] = …` */
  pluginData: Record<string, unknown>;
  /** Machine-readable code when present on the original error. */
  code: string | null;
}

// ─────────────────────────────────────────────
// Public API option bags
// ─────────────────────────────────────────────

/** Options accepted by `analyzeError()`. */
export interface AnalyzeOptions {
  /** HTTP request context to attach to the output. */
  request?: RequestContext;
  /** Override the output format for this call (default: from global config). */
  format?: FormatType;
  /** Whether to include process/env info (default: from global config). */
  includeEnv?: boolean;
}

/** Options accepted by `createError()`. */
export interface CreateErrorOptions {
  /** The underlying error that caused this one. */
  cause?: unknown;
  /** Arbitrary key-value metadata stored on the error. */
  metadata?: Record<string, unknown>;
  /** Override severity (default: inferred by the intelligence layer). */
  severity?: Severity;
  /** Machine-readable error code, e.g. "DB_CONNECTION_FAILED". */
  code?: string;
}

// ─────────────────────────────────────────────
// Global configuration
// ─────────────────────────────────────────────

/** Shape of the global configuration object managed by `configure()`. */
export interface EILConfig {
  /** Default output format. */
  defaultFormat: FormatType;
  /** Include process/env info by default. */
  includeEnv: boolean;
  /**
   * Keys whose values are redacted in metadata and request bodies.
   * Case-insensitive match.
   */
  sensitiveKeys: string[];
  /** Max bytes allowed per metadata value (excess is truncated). */
  maxMetadataValueSize: number;
  /** Max depth to traverse the .cause chain (prevents infinite loops). */
  maxCauseDepth: number;
  /** Whether registered plugins are executed. */
  enablePlugins: boolean;
  /**
   * Optional xAI (Grok) API key.
   * When set, `analyzeErrorAsync()` will call the Grok API to generate
   * AI-powered suggestions and populate `aiSuggestion` on the result.
   * Each user supplies their own key — obtain one at https://console.x.ai
   */
  xaiApiKey?: string;
  /**
   * Enable AI suggestions via the Grok API.
   * Requires `xaiApiKey` to be set. Defaults to false.
   */
  enableAISuggestions: boolean;
  /**
   * Grok model to use for AI suggestions.
   * Defaults to "grok-3-mini" (fast and free-tier eligible).
   */
  grokModel: string;
}

// ─────────────────────────────────────────────
// AI suggestion result
// ─────────────────────────────────────────────

/** Internal result shape returned by the AI layer. */
export interface AIResult {
  /** AI-generated suggestion strings. */
  suggestions: string[];
  /** True when the API returned a rate-limit or quota response. */
  rateLimited: boolean;
  /** True when the AI call succeeded. */
  ok: boolean;
  /** Error message if the call failed for a non-rate-limit reason. */
  errorMessage?: string;
}

// ─────────────────────────────────────────────
// Custom error class (returned by createError)
// ─────────────────────────────────────────────

/**
 * An Error subclass that carries structured EIL metadata so that
 * `analyzeError()` can immediately retrieve severity, code, and metadata
 * without re-inferring them.
 */
export interface IntelligentError extends Error {
  readonly __eil: true;
  severity?: Severity;
  code?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// wrapAsync return type
// ─────────────────────────────────────────────

/** [error, undefined] on failure, [null, result] on success. */
export type WrappedResult<T> = [AnalyzedError, undefined] | [null, T];

/** The function signature returned by `wrapAsync()`. */
export type WrappedAsyncFn<TArgs extends unknown[], TReturn> = (
  ...args: TArgs
) => Promise<WrappedResult<TReturn>>;
