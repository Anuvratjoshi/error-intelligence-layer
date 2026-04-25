import { describe, it, expect } from "vitest";
import {
  captureEnvironment,
  buildFingerprint,
  enrichRequest,
  sanitiseMetadata,
} from "../../src/layers/enrichment/index.js";

describe("captureEnvironment", () => {
  it("returns null when includeEnv is false", () => {
    expect(captureEnvironment(false)).toBeNull();
  });

  it("returns process info when includeEnv is true", () => {
    const env = captureEnvironment(true);
    expect(env).not.toBeNull();
    expect(typeof env!.nodeVersion).toBe("string");
    expect(typeof env!.pid).toBe("number");
    expect(typeof env!.uptime).toBe("number");
  });
});

describe("buildFingerprint", () => {
  it("returns a non-empty hex string", () => {
    const fp = buildFingerprint("TypeError", "bad type", []);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it("same inputs produce same fingerprint", () => {
    const frames = [
      {
        file: "app.ts",
        line: 10,
        column: 1,
        fn: "foo",
        isNative: false,
        isThirdParty: false,
        isMinified: false,
      },
    ];
    const a = buildFingerprint("TypeError", "bad type", frames);
    const b = buildFingerprint("TypeError", "bad type", frames);
    expect(a).toBe(b);
  });

  it("different messages produce different fingerprints", () => {
    const a = buildFingerprint("Error", "message A", []);
    const b = buildFingerprint("Error", "message B", []);
    expect(a).not.toBe(b);
  });

  it("normalises message whitespace for stability", () => {
    const a = buildFingerprint("Error", "msg   here", []);
    const b = buildFingerprint("Error", "msg here", []);
    expect(a).toBe(b);
  });
});

describe("enrichRequest", () => {
  it("returns null when no context provided", () => {
    expect(enrichRequest(undefined)).toBeNull();
  });

  it("redacts authorization header", () => {
    const r = enrichRequest({
      method: "GET",
      url: "/",
      headers: { authorization: "Bearer token123" },
    });
    expect(r!.headers!["authorization"]).toBe("[REDACTED]");
  });

  it("redacts cookie header", () => {
    const r = enrichRequest({ headers: { cookie: "session=abc" } });
    expect(r!.headers!["cookie"]).toBe("[REDACTED]");
  });

  it("preserves non-sensitive headers", () => {
    const r = enrichRequest({
      headers: { "content-type": "application/json" },
    });
    expect(r!.headers!["content-type"]).toBe("application/json");
  });

  it("redacts sensitive keys in body", () => {
    const r = enrichRequest(
      { body: { username: "alice", password: "secret123" } },
      ["password"],
    );
    const body = r!.body as Record<string, unknown>;
    expect(body["password"]).toBe("[REDACTED]");
    expect(body["username"]).toBe("alice");
  });
});

describe("sanitiseMetadata", () => {
  it("redacts sensitive keys", () => {
    const result = sanitiseMetadata({ token: "abc123", safe: "value" }, [
      "token",
    ]);
    expect(result["token"]).toBe("[REDACTED]");
    expect(result["safe"]).toBe("value");
  });

  it("truncates oversized string values", () => {
    const longVal = "x".repeat(3000);
    const result = sanitiseMetadata({ big: longVal }, [], 100);
    expect((result["big"] as string).length).toBeLessThan(3000);
    expect(result["big"]).toContain("[truncated]");
  });

  it("leaves short values intact", () => {
    const result = sanitiseMetadata({ msg: "short" }, [], 100);
    expect(result["msg"]).toBe("short");
  });
});
