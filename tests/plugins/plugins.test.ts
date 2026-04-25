import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  analyzeError,
  registerPlugin,
  clearPlugins,
  resetConfig,
} from "../../src/index.js";
import {
  httpStatusPlugin,
  nodeSystemPlugin,
  groupingPlugin,
  useBuiltInPlugins,
} from "../../src/plugins/index.js";

beforeEach(() => {
  clearPlugins();
  resetConfig();
});

afterEach(() => {
  clearPlugins();
});

describe("httpStatusPlugin", () => {
  it("enriches a 503 Axios error", () => {
    registerPlugin(httpStatusPlugin);
    const err = Object.assign(
      new Error("Request failed with status code 503"),
      {
        isAxiosError: true,
        response: {
          status: 503,
          statusText: "Service Unavailable",
          data: null,
        },
        config: { url: "/api/health", method: "get" },
      },
    );
    const r = analyzeError(err);
    expect(r.pluginData["http-status"]).toEqual({
      status: 503,
      category: "Server Error",
    });
    expect(r.severity).toBe("high");
    expect(r.suggestions[0]).toContain("server");
  });

  it("enriches a 404 response", () => {
    registerPlugin(httpStatusPlugin);
    const err = Object.assign(new Error("404"), {
      isAxiosError: true,
      response: { status: 404, data: null },
      config: { url: "/api/x", method: "get" },
    });
    const r = analyzeError(err);
    const plugin = r.pluginData["http-status"] as {
      status: number;
      category: string;
    };
    expect(plugin.status).toBe(404);
    expect(plugin.category).toBe("Client Error");
  });

  it("does not activate when httpStatus is absent", () => {
    registerPlugin(httpStatusPlugin);
    const r = analyzeError(new Error("plain error"));
    expect(r.pluginData["http-status"]).toBeUndefined();
  });
});

describe("nodeSystemPlugin", () => {
  it("adds ENOENT suggestion", () => {
    registerPlugin(nodeSystemPlugin);
    const err = Object.assign(new Error("no such file"), { code: "ENOENT" });
    const r = analyzeError(err);
    expect(r.pluginData["node-system"]).toEqual({ code: "ENOENT" });
    expect(r.suggestions[0]).toContain("not found");
  });

  it("adds EADDRINUSE suggestion", () => {
    registerPlugin(nodeSystemPlugin);
    const err = Object.assign(new Error("address in use"), {
      code: "EADDRINUSE",
    });
    const r = analyzeError(err);
    expect(r.suggestions[0]).toContain("port");
  });

  it("does not activate for unknown codes", () => {
    registerPlugin(nodeSystemPlugin);
    const err = Object.assign(new Error("x"), { code: "EUNKNOWN_CUSTOM" });
    const r = analyzeError(err);
    expect(r.pluginData["node-system"]).toBeUndefined();
  });
});

describe("groupingPlugin", () => {
  it("categorises TypeError as 'type'", () => {
    registerPlugin(groupingPlugin);
    const r = analyzeError(new TypeError("bad type"));
    expect((r.pluginData["grouping"] as { category: string }).category).toBe(
      "type",
    );
  });

  it("categorises ECONNREFUSED as 'network'", () => {
    registerPlugin(groupingPlugin);
    const err = Object.assign(new Error("ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    const r = analyzeError(err);
    expect((r.pluginData["grouping"] as { category: string }).category).toBe(
      "network",
    );
  });

  it("categorises SyntaxError as 'syntax'", () => {
    registerPlugin(groupingPlugin);
    const r = analyzeError(new SyntaxError("unexpected token"));
    expect((r.pluginData["grouping"] as { category: string }).category).toBe(
      "syntax",
    );
  });
});

describe("useBuiltInPlugins", () => {
  it("registers all three plugins", () => {
    useBuiltInPlugins(registerPlugin);
    const err = Object.assign(new Error("no such file"), {
      code: "ENOENT",
      isAxiosError: false,
    });
    const r = analyzeError(err);
    // node-system and grouping should both fire
    expect(r.pluginData["node-system"]).toBeDefined();
    expect(r.pluginData["grouping"]).toBeDefined();
  });
});
