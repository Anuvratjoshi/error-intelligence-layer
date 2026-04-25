import type {
  AnalyzedError,
  FormatType,
  Severity,
  StackFrame,
} from "../../types/index.js";
import { safeStringify } from "../../utils/index.js";

// ─────────────────────────────────────────────
// ANSI colour helpers (no external deps)
// ─────────────────────────────────────────────

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  bgRed: "\x1b[41m",
} as const;

function c(text: string, ...codes: string[]): string {
  return codes.join("") + text + ANSI.reset;
}

function severityColour(severity: Severity): string {
  switch (severity) {
    case "critical":
      return ANSI.bgRed + ANSI.bold;
    case "high":
      return ANSI.red + ANSI.bold;
    case "medium":
      return ANSI.yellow;
    case "low":
      return ANSI.green;
  }
}

// ─────────────────────────────────────────────
// JSON format
// ─────────────────────────────────────────────

/**
 * Serialise the full AnalyzedError to a compact JSON string.
 * Circular references are replaced with "[Circular]".
 */
export function formatJson(error: AnalyzedError): string {
  return safeStringify(error);
}

// ─────────────────────────────────────────────
// Compact format
// ─────────────────────────────────────────────

/**
 * Single-line summary suitable for log lines:
 *   [TypeError|HIGH] Cannot read properties of undefined — src/app.ts:42
 */
export function formatCompact(error: AnalyzedError): string {
  const location = (() => {
    const f = error.stack[0];
    if (!f) return "unknown location";
    const file = f.file ?? "?";
    const line = f.line != null ? `:${f.line}` : "";
    return `${file}${line}`;
  })();

  return `[${error.type}|${error.severity.toUpperCase()}] ${error.message} — ${location}`;
}

// ─────────────────────────────────────────────
// Pretty format (ANSI-coloured, multi-line)
// ─────────────────────────────────────────────

function formatFrame(frame: StackFrame, index: number): string {
  const fn = frame.fn ?? "<anonymous>";
  const file = frame.file ?? "unknown";
  const line = frame.line != null ? `:${frame.line}` : "";
  const col = frame.column != null ? `:${frame.column}` : "";
  const loc = `${file}${line}${col}`;

  const prefix =
    index === 0 ? c("  ▶ ", ANSI.cyan, ANSI.bold) : c("    ", ANSI.dim);

  return `${prefix}${c(fn, ANSI.white)} ${c(`(${loc})`, ANSI.dim)}`;
}

/**
 * Multi-line, ANSI-coloured output for terminals.
 *
 * ┌─ TypeError [HIGH] ──────────────────────────
 * │  Cannot read properties of undefined
 * │
 * │  Stack
 * │  ▶ myFn   (src/app.ts:42:10)
 * │    ...
 * │
 * │  Suggestions
 * │  • Use optional chaining (?.)
 * │
 * │  Fingerprint  a3f92c01
 * │  Timestamp    2026-04-25T10:00:00.000Z
 * └─────────────────────────────────────────────
 */
export function formatPretty(error: AnalyzedError): string {
  const lines: string[] = [];
  const severityStr = error.severity.toUpperCase();
  const sevColour = severityColour(error.severity);

  // ── Header ─────────────────────────────────────────────────────────────
  lines.push(
    c(`\n┌─ ${error.type} `, ANSI.bold) +
      c(`[${severityStr}]`, sevColour) +
      c(
        " " +
          "─".repeat(Math.max(0, 44 - error.type.length - severityStr.length)),
        ANSI.dim,
      ),
  );

  // ── Message ─────────────────────────────────────────────────────────────
  lines.push(c(`│  ${error.message}`, ANSI.white));

  // ── Code ────────────────────────────────────────────────────────────────
  if (error.code) {
    lines.push(c(`│  Code: ${error.code}`, ANSI.dim));
  }

  // ── Stack frames ─────────────────────────────────────────────────────────
  if (error.stack.length > 0) {
    lines.push(c("│", ANSI.dim));
    lines.push(c("│  Stack", ANSI.bold));
    const shown = error.stack.slice(0, 8);
    shown.forEach((frame, i) =>
      lines.push(c("│", ANSI.dim) + formatFrame(frame, i)),
    );
    if (error.stack.length > 8) {
      lines.push(
        c(`│    … and ${error.stack.length - 8} more frames`, ANSI.dim),
      );
    }
  }

  // ── Root cause ───────────────────────────────────────────────────────────
  if (error.rootCause) {
    lines.push(c("│", ANSI.dim));
    lines.push(c("│  Root Cause", ANSI.bold));
    lines.push(
      c(
        `│    [${error.rootCause.type}] ${error.rootCause.message}`,
        ANSI.magenta,
      ),
    );
  }

  // ── Suggestions ──────────────────────────────────────────────────────────
  if (error.suggestions.length > 0) {
    lines.push(c("│", ANSI.dim));
    lines.push(c("│  Suggestions", ANSI.bold));
    for (const s of error.suggestions) {
      lines.push(c(`│  ${ANSI.cyan}•${ANSI.reset} ${s}`, ANSI.white));
    }
  }

  // ── Environment ──────────────────────────────────────────────────────────
  if (error.environment) {
    const { nodeVersion, platform, pid } = error.environment;
    lines.push(c("│", ANSI.dim));
    lines.push(
      c(
        `│  Environment  Node ${nodeVersion}  ${platform}  pid:${pid}`,
        ANSI.dim,
      ),
    );
  }

  // ── Request context ──────────────────────────────────────────────────────
  if (error.request) {
    const { method, url } = error.request;
    if (method || url) {
      lines.push(
        c(`│  Request      ${method ?? ""} ${url ?? ""}`.trimEnd(), ANSI.dim),
      );
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  lines.push(c("│", ANSI.dim));
  lines.push(c(`│  Fingerprint  `, ANSI.dim) + c(error.fingerprint, ANSI.cyan));
  lines.push(c(`│  Timestamp    ${error.timestamp}`, ANSI.dim));
  lines.push(c("└" + "─".repeat(48), ANSI.dim) + "\n");

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Composed entry point
// ─────────────────────────────────────────────

/**
 * Format an AnalyzedError for output.
 *
 * @param error     The fully assembled AnalyzedError
 * @param formatType  "json" | "pretty" | "compact"
 */
export function format(error: AnalyzedError, formatType: FormatType): string {
  switch (formatType) {
    case "json":
      return formatJson(error);
    case "pretty":
      return formatPretty(error);
    case "compact":
      return formatCompact(error);
  }
}
