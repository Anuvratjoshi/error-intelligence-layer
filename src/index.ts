// ─────────────────────────────────────────────
// Public types (tree-shaken from JS bundles)
// ─────────────────────────────────────────────
export type {
  AIResult,
  AnalyzedError,
  AnalyzeOptions,
  CreateErrorOptions,
  EILConfig,
  EnvironmentInfo,
  FormatType,
  IntelligentError,
  NormalizedError,
  Plugin,
  PluginContext,
  RequestContext,
  Severity,
  StackFrame,
  WrappedAsyncFn,
  WrappedResult,
} from "./types/index.js";

// ─────────────────────────────────────────────
// Core public API
// ─────────────────────────────────────────────
export {
  analyzeError,
  analyzeErrorAsync,
  createError,
  formatError,
  getErrorFingerprint,
  withErrorBoundary,
  wrapAsync,
} from "./core/analyzer.js";

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
export { configure, getConfig, resetConfig } from "./core/config.js";

// ─────────────────────────────────────────────
// Plugin system
// ─────────────────────────────────────────────
export {
  clearPlugins,
  getPlugins,
  registerPlugin,
  unregisterPlugin,
} from "./core/registry.js";

// ─────────────────────────────────────────────
// Built-in plugins (opt-in)
// ─────────────────────────────────────────────
export {
  groupingPlugin,
  httpStatusPlugin,
  nodeSystemPlugin,
  useBuiltInPlugins,
} from "./plugins/index.js";

// ─────────────────────────────────────────────
// Framework adapters (opt-in)
// ─────────────────────────────────────────────
export {
  expressErrorHandler,
  fastifyErrorPlugin,
  withNextApiErrorHandler,
  withNextErrorHandler,
} from "./adapters/index.js";
