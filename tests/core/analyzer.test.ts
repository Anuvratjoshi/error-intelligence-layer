import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  analyzeError,
  createError,
  wrapAsync,
  withErrorBoundary,
  formatError,
  getErrorFingerprint,
} from "../../src/core/analyzer.js";
import { clearPlugins, registerPlugin, resetConfig } from "../../src/index.js";

beforeEach(() => {
  clearPlugins();
  resetConfig();
});

afterEach(() => {
  clearPlugins();
  resetConfig();
});

// ─────────────────────────────────────────────
// analyzeError
// ─────────────────────────────────────────────
describe("analyzeError", () => {
  it("returns an AnalyzedError for a native Error", () => {
    const r = analyzeError(new TypeError("bad type"));
    expect(r.type).toBe("TypeError");
    expect(r.severity).toBe("high");
    expect(r.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof r.timestamp).toBe("string");
    expect(Array.isArray(r.stack)).toBe(true);
    expect(Array.isArray(r.suggestions)).toBe(true);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("handles string throws", () => {
    const r = analyzeError("oops");
    expect(r.type).toBe("StringError");
    expect(r.message).toBe("oops");
  });

  it("handles null throws", () => {
    const r = analyzeError(null);
    expect(r.type).toBe("NullError");
  });

  it("attaches environment info by default", () => {
    const r = analyzeError(new Error("x"));
    expect(r.environment).not.toBeNull();
    expect(r.environment!.nodeVersion).toBeDefined();
  });

  it("omits environment when includeEnv: false", () => {
    const r = analyzeError(new Error("x"), { includeEnv: false });
    expect(r.environment).toBeNull();
  });

  it("attaches request context when provided", () => {
    const r = analyzeError(new Error("x"), {
      request: { method: "GET", url: "/api/test" },
    });
    expect(r.request!.method).toBe("GET");
    expect(r.request!.url).toBe("/api/test");
  });

  it("redacts authorization header in request", () => {
    const r = analyzeError(new Error("x"), {
      request: { headers: { authorization: "Bearer secret" } },
    });
    expect(r.request!.headers!["authorization"]).toBe("[REDACTED]");
  });

  it("extracts cause chain", () => {
    const root = new Error("root");
    const top = new Error("top", { cause: root });
    const r = analyzeError(top);
    expect(r.causeChain).toHaveLength(1);
    expect(r.rootCause!.message).toBe("root");
  });

  it("escalates severity when root cause shell exceeds wrapper severity", () => {
    // buildShellError assigns "medium" to cause chain shells.
    // Escalation fires when wrapper severity is lower than the shell ("medium").
    // Using a custom class so its type is not in SEVERITY_MAP → infers "low".
    class LowSeverityError extends Error {
      override name = "LowSeverityError";
    }
    const cause = new Error("cause");
    const wrapper = new LowSeverityError("wrap");
    Object.defineProperty(wrapper, "cause", {
      value: cause,
      configurable: true,
    });
    const r = analyzeError(wrapper);
    // "LowSeverityError" not in SEVERITY_MAP → "low", escalated to "medium" by shell
    expect(r.severity).toBe("medium");
  });

  it("runs registered plugins", () => {
    registerPlugin({
      name: "test-plugin",
      onAnalyze(err) {
        return {
          pluginData: { ...err.pluginData, "test-plugin": { ran: true } },
        };
      },
    });
    const r = analyzeError(new Error("x"));
    expect(
      (r.pluginData["test-plugin"] as Record<string, unknown>)["ran"],
    ).toBe(true);
  });

  it("plugin crash does not propagate", () => {
    registerPlugin({
      name: "crash-plugin",
      onAnalyze() {
        throw new Error("plugin exploded");
      },
    });
    expect(() => analyzeError(new Error("x"))).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// createError
// ─────────────────────────────────────────────
describe("createError", () => {
  it("creates an Error with message", () => {
    const err = createError("Custom error");
    expect(err.message).toBe("Custom error");
    expect(err instanceof Error).toBe(true);
  });

  it("preserves severity through analyzeError", () => {
    const err = createError("db down", { severity: "critical" });
    const r = analyzeError(err);
    expect(r.severity).toBe("critical");
  });

  it("preserves code through analyzeError", () => {
    const err = createError("not found", { code: "RESOURCE_NOT_FOUND" });
    const r = analyzeError(err);
    expect(r.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("stores metadata through analyzeError", () => {
    const err = createError("failed", { metadata: { userId: 42 } });
    const r = analyzeError(err);
    expect(r.metadata["userId"]).toBe(42);
  });

  it("wires cause chain", () => {
    const root = new Error("root");
    const err = createError("wrap", { cause: root });
    const r = analyzeError(err);
    expect(r.rootCause!.message).toBe("root");
  });
});

// ─────────────────────────────────────────────
// wrapAsync
// ─────────────────────────────────────────────
describe("wrapAsync", () => {
  it("returns [null, result] on success", async () => {
    const fn = wrapAsync(async (x: number) => x * 2);
    const [err, result] = await fn(5);
    expect(err).toBeNull();
    expect(result).toBe(10);
  });

  it("returns [AnalyzedError, undefined] on failure", async () => {
    const fn = wrapAsync(async () => {
      throw new RangeError("out of range");
    });
    const [err, result] = await fn();
    expect(err).not.toBeNull();
    expect(err!.type).toBe("RangeError");
    expect(result).toBeUndefined();
  });

  it("does not throw on failure", async () => {
    const fn = wrapAsync(async () => {
      throw new Error("boom");
    });
    await expect(fn()).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────
// withErrorBoundary
// ─────────────────────────────────────────────
describe("withErrorBoundary", () => {
  it("calls onError with AnalyzedError when sync fn throws", () => {
    let captured: unknown;
    const safe = withErrorBoundary(
      () => {
        throw new TypeError("sync boom");
      },
      (err) => {
        captured = err;
      },
    );
    safe();
    expect((captured as { type: string }).type).toBe("TypeError");
  });

  it("calls onError when async fn throws", async () => {
    let captured: unknown;
    const safe = withErrorBoundary(
      async () => {
        throw new Error("async boom");
      },
      (err) => {
        captured = err;
      },
    );
    await safe();
    expect((captured as { message: string }).message).toBe("async boom");
  });

  it("returns result of successful sync fn", () => {
    const safe = withErrorBoundary(() => 42);
    expect(safe()).toBe(42);
  });

  it("returns result of successful async fn", async () => {
    const safe = withErrorBoundary(async () => "hello");
    expect(await safe()).toBe("hello");
  });
});

// ─────────────────────────────────────────────
// formatError
// ─────────────────────────────────────────────
describe("formatError", () => {
  it("formats as json by default", () => {
    const r = analyzeError(new Error("x"));
    const out = formatError(r);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("formats as compact", () => {
    const r = analyzeError(new TypeError("oops"));
    const out = formatError(r, "compact");
    expect(out).toContain("[TypeError|HIGH]");
  });

  it("formats as pretty", () => {
    const r = analyzeError(new Error("x"));
    const out = formatError(r, "pretty");
    expect(out).toContain("Error");
  });
});

// ─────────────────────────────────────────────
// getErrorFingerprint
// ─────────────────────────────────────────────
describe("getErrorFingerprint", () => {
  it("returns a hex string", () => {
    const fp = getErrorFingerprint(new Error("x"));
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is stable for same error type+message", () => {
    // Note: different Error instances with the same message may have different
    // stack origins, so we test with the same raw value
    const fp1 = getErrorFingerprint("same message");
    const fp2 = getErrorFingerprint("same message");
    expect(fp1).toBe(fp2);
  });

  it("differs for different messages", () => {
    const fp1 = getErrorFingerprint("message A");
    const fp2 = getErrorFingerprint("message B");
    expect(fp1).not.toBe(fp2);
  });
});
