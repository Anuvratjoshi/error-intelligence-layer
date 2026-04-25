import type { AnalyzedError, Plugin, Severity } from "../types/index.js";

// ─────────────────────────────────────────────
// Built-in plugin: HTTP status enrichment
// ─────────────────────────────────────────────

/**
 * Reads `metadata.httpStatus` (populated by the Axios normalizer or by
 * framework adapters) and:
 *  - escalates severity for 5xx responses
 *  - adds an HTTP-specific suggestion
 *  - stores a human-readable `httpCategory` in pluginData
 */
export const httpStatusPlugin: Plugin = {
  name: "http-status",
  onAnalyze(error: AnalyzedError) {
    const status = error.metadata["httpStatus"];
    if (typeof status !== "number") return {};

    const category =
      status >= 500
        ? "Server Error"
        : status >= 400
          ? "Client Error"
          : status >= 300
            ? "Redirect"
            : status >= 200
              ? "Success"
              : "Unknown";

    const suggestion =
      status === 400
        ? "Validate the request payload before sending."
        : status === 401
          ? "Check authentication credentials / token expiry."
          : status === 403
            ? "The caller lacks permission. Check access-control rules."
            : status === 404
              ? "The requested resource does not exist. Verify the URL."
              : status === 408
                ? "Request timed out. Retry with exponential back-off."
                : status === 409
                  ? "Conflict detected. Handle optimistic-locking or retry logic."
                  : status === 422
                    ? "Unprocessable entity. Validate the request schema."
                    : status === 429
                      ? "Rate limited. Implement back-off and respect Retry-After headers."
                      : status >= 500 && status < 600
                        ? "Server-side error. Check server logs and retry with back-off."
                        : null;

    const severityOverride: Severity | undefined =
      status >= 500
        ? "high"
        : status === 401 || status === 403
          ? "medium"
          : undefined;

    const override: Partial<AnalyzedError> = {
      pluginData: {
        ...error.pluginData,
        "http-status": { status, category },
      },
    };

    if (suggestion) {
      override.suggestions = [...new Set([suggestion, ...error.suggestions])];
    }

    if (severityOverride) {
      const order: Severity[] = ["low", "medium", "high", "critical"];
      if (order.indexOf(severityOverride) > order.indexOf(error.severity)) {
        override.severity = severityOverride;
      }
    }

    return override;
  },
};

// ─────────────────────────────────────────────
// Built-in plugin: Node.js system error codes
// ─────────────────────────────────────────────

const NODE_CODE_SUGGESTIONS: Record<string, string> = {
  ENOENT: "File or directory not found. Check the path and that it exists.",
  EACCES:
    "Permission denied. Check file/directory ownership and permission bits.",
  EPERM: "Operation not permitted. You may need elevated privileges.",
  EADDRINUSE:
    "Port is already in use. Stop the conflicting process or choose a different port.",
  ECONNREFUSED:
    "Connection refused. Ensure the target service is running and accessible.",
  ECONNRESET:
    "Connection was reset by the peer. Check network stability and retry.",
  ETIMEDOUT:
    "Operation timed out. Check network connectivity or increase the timeout.",
  ENOTFOUND:
    "DNS lookup failed. Verify the hostname and network configuration.",
  EEXIST:
    "File already exists. Use a flag to overwrite or check before creating.",
  EISDIR: "Expected a file but found a directory. Verify the path.",
  ENOTDIR: "Expected a directory but found a file. Verify the path.",
  EMFILE:
    "Too many open files. Increase the OS file descriptor limit (ulimit -n).",
  ENOMEM: "Insufficient memory. Reduce memory usage or increase available RAM.",
  ERANGE: "Value out of range. Check numeric bounds in the operation.",
  EINVAL:
    "Invalid argument supplied. Review the function call and its parameters.",
  EPIPE: "Broken pipe. The reading end of the stream was closed prematurely.",
  ERR_MODULE_NOT_FOUND:
    "Module not found. Run 'npm install' and check import paths.",
  ERR_REQUIRE_ESM:
    "Cannot require() an ESM module. Use dynamic import() instead.",
  ERR_INVALID_ARG_TYPE:
    "Wrong argument type passed. Review the expected types in the API.",
  ERR_OUT_OF_RANGE: "Numeric argument is out of the allowed range.",
  MODULE_NOT_FOUND:
    "Module not found. Run 'npm install' and verify the module name.",
};

/**
 * Enriches errors that carry a Node.js error code (`.code` / `metadata.code`)
 * with a targeted suggestion and stores the code category in `pluginData`.
 */
export const nodeSystemPlugin: Plugin = {
  name: "node-system",
  onAnalyze(error: AnalyzedError) {
    const code = error.code ?? (error.metadata["code"] as string | undefined);
    if (!code || typeof code !== "string") return {};

    const suggestion = NODE_CODE_SUGGESTIONS[code.toUpperCase()];
    if (!suggestion) return {};

    return {
      pluginData: {
        ...error.pluginData,
        "node-system": { code },
      },
      suggestions: [...new Set([suggestion, ...error.suggestions])],
    };
  },
};

// ─────────────────────────────────────────────
// Built-in plugin: Error grouping / categorisation
// ─────────────────────────────────────────────

type ErrorCategory =
  | "network"
  | "filesystem"
  | "permission"
  | "validation"
  | "memory"
  | "syntax"
  | "type"
  | "reference"
  | "timeout"
  | "authentication"
  | "unknown";

function categorise(error: AnalyzedError): ErrorCategory {
  const type = error.type.toLowerCase();
  const msg = error.message.toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  if (/syntaxerror/.test(type)) return "syntax";
  if (/typeerror/.test(type)) return "type";
  if (/referenceerror/.test(type)) return "reference";

  if (
    /econnrefused|enotfound|etimedout|econnreset|network|fetch failed/.test(
      msg + code,
    )
  )
    return "network";
  if (/enoent|eisdir|enotdir|emfile|epipe|no such file/.test(msg + code))
    return "filesystem";
  if (/eacces|eperm|permission denied/.test(msg + code)) return "permission";
  if (/401|403|unauthorized|forbidden/.test(msg)) return "authentication";
  if (/timeout|timed out/.test(msg)) return "timeout";
  if (/heap|out of memory|enomem/.test(msg + code)) return "memory";
  if (/invalid|validation|schema|parse error/.test(msg)) return "validation";

  return "unknown";
}

/**
 * Adds an `errorCategory` field to `pluginData` for easy grouping in
 * dashboards or log aggregators.
 */
export const groupingPlugin: Plugin = {
  name: "grouping",
  onAnalyze(error: AnalyzedError) {
    return {
      pluginData: {
        ...error.pluginData,
        grouping: { category: categorise(error) },
      },
    };
  },
};

// ─────────────────────────────────────────────
// Convenience: register all built-in plugins
// ─────────────────────────────────────────────

/**
 * Register all three built-in plugins in one call.
 * Safe to call multiple times — later calls replace earlier registrations.
 *
 * ```ts
 * import { useBuiltInPlugins } from "error-intelligence-layer/plugins";
 * useBuiltInPlugins();
 * ```
 */
export function useBuiltInPlugins(registerFn: (plugin: Plugin) => void): void {
  registerFn(httpStatusPlugin);
  registerFn(nodeSystemPlugin);
  registerFn(groupingPlugin);
}
