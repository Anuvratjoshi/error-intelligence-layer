import { describe, it, expect } from "vitest";
import { extractCauses } from "../../src/layers/extraction/index.js";
import type { NormalizedError } from "../../src/types/index.js";

function makeNorm(err: unknown): NormalizedError {
  return {
    type: err instanceof Error ? err.constructor.name : "Error",
    message: err instanceof Error ? err.message : String(err),
    rawStack: err instanceof Error ? (err.stack ?? null) : null,
    originalError: err,
    metadata: {},
    code: null,
  };
}

describe("extractCauses", () => {
  it("returns empty result when no cause", () => {
    const r = extractCauses(makeNorm(new Error("top")));
    expect(r.rootCause).toBeNull();
    expect(r.causeChain).toHaveLength(0);
  });

  it("extracts a single cause", () => {
    const root = new Error("root");
    const top = new Error("top", { cause: root });
    const r = extractCauses(makeNorm(top));
    expect(r.causeChain).toHaveLength(1);
    expect(r.rootCause!.message).toBe("root");
  });

  it("traverses a multi-level chain", () => {
    const root = new Error("root");
    const mid = new Error("mid", { cause: root });
    const top = new Error("top", { cause: mid });
    const r = extractCauses(makeNorm(top));
    expect(r.causeChain).toHaveLength(2);
    expect(r.causeChain[0]!.message).toBe("mid");
    expect(r.causeChain[1]!.message).toBe("root");
    expect(r.rootCause!.message).toBe("root");
  });

  it("stops at maxDepth", () => {
    // Build a chain 5 deep
    let err: Error = new Error("level-5");
    for (let i = 4; i >= 1; i--) {
      err = new Error(`level-${i}`, { cause: err });
    }
    const r = extractCauses(makeNorm(err), 3);
    expect(r.causeChain.length).toBeLessThanOrEqual(3);
  });

  it("handles circular cause references without crashing", () => {
    const a = new Error("a");
    const b = new Error("b");
    // Force circular: a.cause = b, b.cause = a
    Object.defineProperty(a, "cause", { value: b, configurable: true });
    Object.defineProperty(b, "cause", { value: a, configurable: true });

    expect(() => extractCauses(makeNorm(a))).not.toThrow();
  });

  it("handles primitive cause value", () => {
    const top = new Error("top");
    Object.defineProperty(top, "cause", {
      value: "string cause",
      configurable: true,
    });
    const r = extractCauses(makeNorm(top));
    expect(r.causeChain).toHaveLength(1);
    expect(r.causeChain[0]!.message).toBe("string cause");
  });
});
