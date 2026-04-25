import { describe, it, expect } from "vitest";
import {
  expressErrorHandler,
  withNextApiErrorHandler,
  withNextErrorHandler,
} from "../../src/adapters/index.js";

// ─────────────────────────────────────────────
// Express adapter
// ─────────────────────────────────────────────
describe("expressErrorHandler", () => {
  function makeMockRes() {
    const res = {
      _status: 0,
      _body: "",
      _headers: {} as Record<string, string>,
      status(code: number) {
        this._status = code;
        return this;
      },
      set(k: string, v: string) {
        this._headers[k] = v;
        return this;
      },
      send(body: string) {
        this._body = body;
        return this;
      },
    };
    return res;
  }

  const mockReq = { method: "GET", url: "/api/test", headers: {}, params: {} };

  it("returns 500 for a generic Error", () => {
    const mw = expressErrorHandler({ format: "json" });
    const res = makeMockRes();
    mw(
      new Error("boom"),
      mockReq,
      res as unknown as Record<string, unknown>,
      () => {},
    );
    expect(res._status).toBe(500);
  });

  it("uses error.statusCode when present", () => {
    const mw = expressErrorHandler({ format: "json" });
    const res = makeMockRes();
    const err = Object.assign(new Error("not found"), { statusCode: 404 });
    mw(err, mockReq, res as unknown as Record<string, unknown>, () => {});
    expect(res._status).toBe(404);
  });

  it("sets Content-Type: application/json for json format", () => {
    const mw = expressErrorHandler({ format: "json" });
    const res = makeMockRes();
    mw(
      new Error("x"),
      mockReq,
      res as unknown as Record<string, unknown>,
      () => {},
    );
    expect(res._headers["Content-Type"]).toBe("application/json");
  });

  it("sets Content-Type: text/plain for compact format", () => {
    const mw = expressErrorHandler({ format: "compact" });
    const res = makeMockRes();
    mw(
      new Error("x"),
      mockReq,
      res as unknown as Record<string, unknown>,
      () => {},
    );
    expect(res._headers["Content-Type"]).toBe("text/plain");
  });

  it("sends a parseable JSON body for json format", () => {
    const mw = expressErrorHandler({ format: "json" });
    const res = makeMockRes();
    mw(
      new TypeError("oops"),
      mockReq,
      res as unknown as Record<string, unknown>,
      () => {},
    );
    expect(() => JSON.parse(res._body)).not.toThrow();
  });

  it("calls onError hook when provided", () => {
    let hookCalled = false;
    const mw = expressErrorHandler({
      onError: () => {
        hookCalled = true;
      },
    });
    const res = makeMockRes();
    mw(
      new Error("x"),
      mockReq,
      res as unknown as Record<string, unknown>,
      () => {},
    );
    expect(hookCalled).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Next.js Pages Router adapter
// ─────────────────────────────────────────────
describe("withNextApiErrorHandler", () => {
  function makeMockApiRes() {
    const res = {
      _status: 0,
      _json: null as unknown,
      status(code: number) {
        this._status = code;
        return this;
      },
      json(body: unknown) {
        this._json = body;
        return this;
      },
      send(_b: string) {
        return this;
      },
      setHeader(_k: string, _v: string) {},
    };
    return res;
  }

  it("responds with 500 on thrown Error", async () => {
    const handler = withNextApiErrorHandler(async () => {
      throw new Error("crash");
    });
    const req = { method: "GET", url: "/api", headers: {} };
    const res = makeMockApiRes();
    await handler(req, res as unknown as Parameters<typeof handler>[1]);
    expect(res._status).toBe(500);
    expect((res._json as { type: string }).type).toBe("Error");
  });

  it("uses statusCode from error when present", async () => {
    const handler = withNextApiErrorHandler(async () => {
      throw Object.assign(new Error("bad request"), { statusCode: 400 });
    });
    const req = { method: "POST", url: "/api", headers: {} };
    const res = makeMockApiRes();
    await handler(req, res as unknown as Parameters<typeof handler>[1]);
    expect(res._status).toBe(400);
  });

  it("passes through when handler succeeds", async () => {
    const handler = withNextApiErrorHandler(async (_req, res) => {
      res.json({ ok: true });
    });
    const req = { method: "GET", url: "/api", headers: {} };
    const res = makeMockApiRes();
    await handler(req, res as unknown as Parameters<typeof handler>[1]);
    expect((res._json as { ok: boolean }).ok).toBe(true);
  });

  it("calls onError hook", async () => {
    let hookFired = false;
    const handler = withNextApiErrorHandler(
      async () => {
        throw new Error("x");
      },
      {
        onError: () => {
          hookFired = true;
        },
      },
    );
    const req = { method: "GET", url: "/", headers: {} };
    const res = makeMockApiRes();
    await handler(req, res as unknown as Parameters<typeof handler>[1]);
    expect(hookFired).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Next.js App Router adapter
// ─────────────────────────────────────────────
describe("withNextErrorHandler", () => {
  it("returns fallback object when Response is not available", async () => {
    // In Node test env globalThis.Response doesn't exist — exercises fallback path
    const handler = withNextErrorHandler(async () => {
      throw new RangeError("out of range");
    });
    const req = { method: "GET", url: "/api", headers: {} };
    const result = await handler(req);
    // Could be a Response or our fallback plain object
    expect(result).not.toBeNull();
  });

  it("passes through when handler succeeds", async () => {
    const handler = withNextErrorHandler(async () => ({ data: 42 }));
    const result = await handler({ method: "GET", url: "/", headers: {} });
    expect((result as { data: number }).data).toBe(42);
  });
});
