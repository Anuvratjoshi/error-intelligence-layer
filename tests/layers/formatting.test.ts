import { describe, it, expect } from "vitest";
import {
  format,
  formatJson,
  formatCompact,
  formatPretty,
} from "../../src/layers/formatting/index.js";
import type { AnalyzedError } from "../../src/types/index.js";

function makeError(overrides: Partial<AnalyzedError> = {}): AnalyzedError {
  return {
    type: "TypeError",
    message: "Cannot read properties of undefined",
    stack: [
      {
        file: "src/app.ts",
        line: 42,
        column: 5,
        fn: "myFn",
        isNative: false,
        isThirdParty: false,
        isMinified: false,
      },
    ],
    rawStack: "TypeError: ...\n    at myFn (src/app.ts:42:5)",
    severity: "high",
    fingerprint: "abc12345",
    rootCause: null,
    causeChain: [],
    suggestions: ["Use optional chaining (?.)"],
    environment: null,
    request: null,
    timestamp: "2026-04-25T10:00:00.000Z",
    metadata: {},
    pluginData: {},
    code: null,
    ...overrides,
  };
}

describe("formatJson", () => {
  it("returns a valid JSON string", () => {
    const out = formatJson(makeError());
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("includes type and message", () => {
    const out = formatJson(makeError());
    const parsed = JSON.parse(out);
    expect(parsed.type).toBe("TypeError");
    expect(parsed.message).toBe("Cannot read properties of undefined");
  });

  it("does not crash on circular metadata", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circ: any = {};
    circ.self = circ;
    const err = makeError({ metadata: circ });
    expect(() => formatJson(err)).not.toThrow();
  });
});

describe("formatCompact", () => {
  it("includes type, severity, message, and location", () => {
    const out = formatCompact(makeError());
    expect(out).toContain("TypeError");
    expect(out).toContain("HIGH");
    expect(out).toContain("Cannot read properties of undefined");
    expect(out).toContain("src/app.ts:42");
  });

  it("handles missing stack frames", () => {
    const out = formatCompact(makeError({ stack: [] }));
    expect(out).toContain("unknown location");
  });
});

describe("formatPretty", () => {
  it("returns a non-empty string", () => {
    const out = formatPretty(makeError());
    expect(out.length).toBeGreaterThan(0);
  });

  it("contains the error type", () => {
    const out = formatPretty(makeError());
    expect(out).toContain("TypeError");
  });

  it("contains the suggestion", () => {
    const out = formatPretty(makeError());
    expect(out).toContain("optional chaining");
  });

  it("includes root cause when present", () => {
    const rootCause = makeError({
      type: "ReferenceError",
      message: "x is not defined",
      severity: "critical",
    });
    const out = formatPretty(makeError({ rootCause }));
    expect(out).toContain("ReferenceError");
  });

  it("includes environment when present", () => {
    const env = {
      nodeVersion: "v20.0.0",
      platform: "linux" as NodeJS.Platform,
      pid: 1,
      memory: process.memoryUsage(),
      uptime: 100,
    };
    const out = formatPretty(makeError({ environment: env }));
    expect(out).toContain("v20.0.0");
  });
});

describe("format dispatcher", () => {
  it("dispatches to json", () => {
    const out = format(makeError(), "json");
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("dispatches to compact", () => {
    const out = format(makeError(), "compact");
    expect(out).toContain("[TypeError|HIGH]");
  });

  it("dispatches to pretty", () => {
    const out = format(makeError(), "pretty");
    expect(out).toContain("TypeError");
  });
});
