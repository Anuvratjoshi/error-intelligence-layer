import { describe, it, expect } from "vitest";
import { normalizeError } from "../../src/layers/normalization/index.js";

describe("normalizeError", () => {
  // ── Native Error types ──────────────────────────────────────────────────
  it("handles a TypeError", () => {
    const err = new TypeError("bad type");
    const r = normalizeError(err);
    expect(r.type).toBe("TypeError");
    expect(r.message).toBe("bad type");
    expect(r.originalError).toBe(err);
    expect(typeof r.rawStack).toBe("string");
  });

  it("handles a SyntaxError", () => {
    const err = new SyntaxError("unexpected token");
    const r = normalizeError(err);
    expect(r.type).toBe("SyntaxError");
  });

  it("preserves .code from native Error", () => {
    const err = Object.assign(new Error("no file"), { code: "ENOENT" });
    const r = normalizeError(err);
    expect(r.code).toBe("ENOENT");
  });

  // ── Primitives ──────────────────────────────────────────────────────────
  it("handles a string throw", () => {
    const r = normalizeError("something broke");
    expect(r.type).toBe("StringError");
    expect(r.message).toBe("something broke");
    expect(r.rawStack).toBeNull();
  });

  it("handles an empty string throw", () => {
    const r = normalizeError("");
    expect(r.type).toBe("StringError");
    expect(r.message).toBe("Empty string thrown");
  });

  it("handles a number throw", () => {
    const r = normalizeError(42);
    expect(r.type).toBe("NumberError");
    expect(r.message).toBe("Number thrown: 42");
  });

  it("handles a boolean throw", () => {
    const r = normalizeError(false);
    expect(r.type).toBe("BooleanError");
    expect(r.message).toBe("Boolean thrown: false");
  });

  it("handles null", () => {
    const r = normalizeError(null);
    expect(r.type).toBe("NullError");
    expect(r.message).toBe("null was thrown");
  });

  it("handles undefined", () => {
    const r = normalizeError(undefined);
    expect(r.type).toBe("UndefinedError");
    expect(r.message).toBe("undefined was thrown");
  });

  // ── Plain objects ───────────────────────────────────────────────────────
  it("handles a plain object with message", () => {
    const r = normalizeError({ message: "db failed", code: "DB_ERR" });
    expect(r.type).toBe("ObjectError");
    expect(r.message).toBe("db failed");
    expect(r.code).toBe("DB_ERR");
  });

  it("handles a plain object without message", () => {
    const r = normalizeError({ foo: "bar" });
    expect(r.type).toBe("ObjectError");
    expect(r.message).toContain("foo");
  });

  // ── Axios errors ────────────────────────────────────────────────────────
  it("detects Axios Error instances", () => {
    const err = Object.assign(
      new Error("Request failed with status code 404"),
      {
        isAxiosError: true,
        response: { status: 404, statusText: "Not Found", data: "nope" },
        config: { url: "/api/x", method: "get" },
      },
    );
    const r = normalizeError(err);
    expect(r.type).toBe("AxiosError");
    expect(r.metadata["httpStatus"]).toBe(404);
    expect(r.metadata["requestUrl"]).toBe("/api/x");
  });

  it("detects Axios plain-object errors", () => {
    const err = {
      isAxiosError: true,
      message: "timeout",
      response: null,
      config: null,
    };
    const r = normalizeError(err);
    expect(r.type).toBe("AxiosError");
  });

  // ── Circular objects ────────────────────────────────────────────────────
  it("does not crash on circular object metadata", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { message: "circular" };
    obj.self = obj;
    expect(() => normalizeError(obj)).not.toThrow();
  });

  // ── Framework unwrapping ────────────────────────────────────────────────
  it("unwraps .originalError from a plain wrapper", () => {
    const inner = new TypeError("real error");
    const wrapper = { message: "wrapper", originalError: inner };
    const r = normalizeError(wrapper);
    // Should unwrap and treat inner as the real error
    expect(r.type).toBe("TypeError");
    expect(r.message).toBe("real error");
  });
});
