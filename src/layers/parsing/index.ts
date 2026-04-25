import type { NormalizedError, StackFrame } from "../../types/index.js";
import {
  MINIFIED_COLUMN_THRESHOLD,
  NATIVE_FRAME_RE,
  STACK_FRAME_RE,
} from "../../constants/index.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Returns true when the file path belongs to node_modules. */
function isThirdPartyPath(file: string): boolean {
  return file.includes("node_modules");
}

/** Returns true when the file path or raw line indicates a native frame. */
function isNativePath(file: string, rawLine: string): boolean {
  return NATIVE_FRAME_RE.test(file) || NATIVE_FRAME_RE.test(rawLine);
}

/**
 * Try to parse a single raw stack line into a StackFrame.
 * Returns null when the line doesn't match any known format.
 */
function parseLine(rawLine: string): StackFrame | null {
  const match = STACK_FRAME_RE.exec(rawLine);
  if (!match) return null;

  // Group layout from the regex:
  //   match[1] = fn name (with-location form)
  //   match[2] = file, match[3] = line, match[4] = col (with-location)
  //   match[5] = file (no-function form)
  //   match[6] = line, match[7] = col (no-function)

  let fn: string | null;
  let file: string | null;
  let line: number | null;
  let column: number | null;

  if (match[2] !== undefined) {
    // "at fn (file:line:col)" form
    fn = match[1]?.trim() || null;
    file = match[2] || null;
    line = match[3] ? parseInt(match[3], 10) : null;
    column = match[4] ? parseInt(match[4], 10) : null;
  } else {
    // "at file:line:col" form (anonymous)
    fn = null;
    file = match[5] || null;
    line = match[6] ? parseInt(match[6], 10) : null;
    column = match[7] ? parseInt(match[7], 10) : null;
  }

  // Normalise known non-path strings
  const isNative =
    file !== null ? isNativePath(file, rawLine) : /\(native\)/.test(rawLine);
  const isThirdParty = file !== null ? isThirdPartyPath(file) : false;
  const isMinified = column !== null && column > MINIFIED_COLUMN_THRESHOLD;

  // Strip "async " prefix that some runtimes prepend to async frames
  if (fn && fn.startsWith("async ")) {
    fn = fn.slice(6).trim() || null;
  }

  // Map "<anonymous>" to null so consumers can treat it uniformly
  if (fn === "<anonymous>") fn = null;

  return { file, line, column, fn, isNative, isThirdParty, isMinified };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Parse the raw stack string from a NormalizedError into an ordered array of
 * StackFrames (outermost call first, matching V8 order).
 *
 * Handles:
 *  - Standard "at fn (file:line:col)" V8 format
 *  - Anonymous "at file:line:col" format
 *  - Native frames  ("at Array.map (native)")
 *  - Node.js internal frames ("node:internal/…")
 *  - TypeScript-transpiled stacks (same V8 format, file ends in .ts)
 *  - Async frames with "async " prefix
 *  - Empty / null stack → returns []
 *  - Lines that don't match are silently skipped (e.g. the first "Error: …" line)
 */
export function parseStack(normalized: NormalizedError): StackFrame[] {
  const { rawStack } = normalized;
  if (!rawStack) return [];

  const lines = rawStack.split("\n");
  const frames: StackFrame[] = [];

  for (const line of lines) {
    const frame = parseLine(line);
    if (frame !== null) {
      frames.push(frame);
    }
  }

  return frames;
}

/**
 * Convenience overload: parse a raw stack string directly.
 * Returns [] when rawStack is null or empty.
 */
export function parseRawStack(rawStack: string | null): StackFrame[] {
  if (!rawStack) return [];
  return parseStack({ rawStack } as NormalizedError);
}

/**
 * Return only the application frames — filtering out native and third-party
 * frames. Useful when displaying a concise trace to the developer.
 */
export function appFrames(frames: StackFrame[]): StackFrame[] {
  return frames.filter((f) => !f.isNative && !f.isThirdParty);
}

/**
 * Return the first application frame (the most likely error origin in user code).
 * Falls back to the very first frame when no app frame is found.
 */
export function firstAppFrame(frames: StackFrame[]): StackFrame | null {
  const app = appFrames(frames);
  return app[0] ?? frames[0] ?? null;
}
