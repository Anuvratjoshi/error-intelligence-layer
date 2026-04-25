import { describe, it, expect } from "vitest";
import {
  inferSeverity,
  buildSuggestions,
  escalateSeverity,
} from "../../src/layers/intelligence/index.js";
import type { AnalyzedError, NormalizedError } from "../../src/types/index.js";

function norm(type: string, message: string, code?: string): NormalizedError {
  return {
    type,
    message,
    rawStack: null,
    originalError: null,
    metadata: {},
    code: code ?? null,
  };
}

function shell(severity: AnalyzedError["severity"]): AnalyzedError {
  return {
    type: "Error",
    message: "x",
    stack: [],
    rawStack: null,
    severity,
    fingerprint: "",
    rootCause: null,
    causeChain: [],
    suggestions: [],
    environment: null,
    request: null,
    timestamp: "",
    metadata: {},
    pluginData: {},
    code: null,
  };
}

describe("inferSeverity", () => {
  it("SyntaxError → critical", () => {
    expect(inferSeverity(norm("SyntaxError", "bad"))).toBe("critical");
  });

  it("ReferenceError → critical", () => {
    expect(inferSeverity(norm("ReferenceError", "x is not defined"))).toBe(
      "critical",
    );
  });

  it("TypeError → high", () => {
    expect(inferSeverity(norm("TypeError", "bad"))).toBe("high");
  });

  it("RangeError → high", () => {
    expect(inferSeverity(norm("RangeError", "bad"))).toBe("high");
  });

  it("unknown type defaults to low", () => {
    expect(inferSeverity(norm("CustomError", "custom"))).toBe("low");
  });

  it("message heuristic: heap out of memory → critical", () => {
    // Heuristics only fire for types NOT in SEVERITY_MAP (e.g. custom types)
    expect(inferSeverity(norm("ProcessError", "heap out of memory"))).toBe(
      "critical",
    );
  });

  it("message heuristic: ECONNREFUSED → high", () => {
    // Heuristics only fire for types NOT in SEVERITY_MAP
    expect(
      inferSeverity(norm("NetworkError", "ECONNREFUSED 127.0.0.1:5432")),
    ).toBe("high");
  });

  it("explicit override takes priority", () => {
    expect(inferSeverity(norm("TypeError", "bad"), "low")).toBe("low");
  });
});

describe("buildSuggestions", () => {
  it("matches 'cannot read properties of undefined'", () => {
    const s = buildSuggestions(
      norm("TypeError", "Cannot read properties of undefined (reading 'id')"),
    );
    expect(s.some((x) => /optional chaining/i.test(x))).toBe(true);
  });

  it("matches 'is not a function'", () => {
    const s = buildSuggestions(norm("TypeError", "foo is not a function"));
    expect(s.some((x) => /callable/i.test(x))).toBe(true);
  });

  it("matches ECONNREFUSED code", () => {
    const s = buildSuggestions(norm("Error", "connect error", "ECONNREFUSED"));
    expect(s.some((x) => /refused/i.test(x))).toBe(true);
  });

  it("returns a fallback suggestion when nothing matches", () => {
    const s = buildSuggestions(norm("WeirdError", "some exotic error"));
    expect(s.length).toBeGreaterThan(0);
  });

  it("deduplicates suggestions", () => {
    const s = buildSuggestions(
      norm(
        "TypeError",
        "Cannot read properties of undefined Cannot read properties of undefined",
      ),
    );
    const unique = new Set(s);
    expect(unique.size).toBe(s.length);
  });
});

describe("escalateSeverity", () => {
  it("escalates when root cause is more severe", () => {
    const result = escalateSeverity("low", shell("critical"));
    expect(result).toBe("critical");
  });

  it("keeps current when root cause is less severe", () => {
    const result = escalateSeverity("high", shell("low"));
    expect(result).toBe("high");
  });

  it("returns current when rootCause is null", () => {
    expect(escalateSeverity("medium", null)).toBe("medium");
  });
});
