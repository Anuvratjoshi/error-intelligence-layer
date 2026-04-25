import { describe, it, expect } from "vitest";
import {
  parseStack,
  parseRawStack,
  appFrames,
  firstAppFrame,
} from "../../src/layers/parsing/index.js";
import type { NormalizedError } from "../../src/types/index.js";

const stub = (rawStack: string | null): NormalizedError => ({
  type: "Error",
  message: "test",
  rawStack,
  originalError: new Error("test"),
  metadata: {},
  code: null,
});

describe("parseStack", () => {
  it("returns [] for null stack", () => {
    expect(parseStack(stub(null))).toEqual([]);
  });

  it("returns [] for empty stack string", () => {
    expect(parseStack(stub(""))).toEqual([]);
  });

  it("parses 'at fn (file:line:col)' form", () => {
    const raw = `Error: oops\n    at myFn (src/app.ts:10:5)`;
    const frames = parseStack(stub(raw));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.fn).toBe("myFn");
    expect(frames[0]!.file).toBe("src/app.ts");
    expect(frames[0]!.line).toBe(10);
    expect(frames[0]!.column).toBe(5);
  });

  it("parses anonymous 'at file:line:col' form", () => {
    const raw = `Error: oops\n    at src/app.ts:20:3`;
    const frames = parseStack(stub(raw));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.fn).toBeNull();
    expect(frames[0]!.file).toBe("src/app.ts");
    expect(frames[0]!.line).toBe(20);
  });

  it("marks node: frames as native", () => {
    const raw = `Error: x\n    at readFileSync (node:fs:420:3)`;
    const frames = parseStack(stub(raw));
    expect(frames[0]!.isNative).toBe(true);
  });

  it("marks node_modules frames as third-party", () => {
    const raw = `Error: x\n    at fn (node_modules/express/index.js:1:1)`;
    const frames = parseStack(stub(raw));
    expect(frames[0]!.isThirdParty).toBe(true);
  });

  it("marks high-column frames as minified", () => {
    const raw = `Error: x\n    at fn (bundle.min.js:1:9999)`;
    const frames = parseStack(stub(raw));
    expect(frames[0]!.isMinified).toBe(true);
  });

  it("strips 'async ' prefix from async frames", () => {
    const raw = `Error: x\n    at async myAsyncFn (src/worker.ts:5:3)`;
    const frames = parseStack(stub(raw));
    expect(frames[0]!.fn).toBe("myAsyncFn");
  });

  it("maps <anonymous> to null", () => {
    const raw = `Error: x\n    at <anonymous> (src/app.ts:1:1)`;
    const frames = parseStack(stub(raw));
    expect(frames[0]!.fn).toBeNull();
  });

  it("parses multiple frames in order", () => {
    const raw = [
      "Error: oops",
      "    at alpha (src/a.ts:1:1)",
      "    at beta (src/b.ts:2:2)",
      "    at gamma (src/c.ts:3:3)",
    ].join("\n");
    const frames = parseStack(stub(raw));
    expect(frames).toHaveLength(3);
    expect(frames[0]!.fn).toBe("alpha");
    expect(frames[2]!.fn).toBe("gamma");
  });
});

describe("parseRawStack", () => {
  it("returns [] for null", () => {
    expect(parseRawStack(null)).toEqual([]);
  });

  it("parses a raw stack string", () => {
    const frames = parseRawStack("Error: x\n    at foo (src/x.ts:1:1)");
    expect(frames[0]!.fn).toBe("foo");
  });
});

describe("appFrames / firstAppFrame", () => {
  it("filters out native and third-party frames", () => {
    const raw = [
      "Error: x",
      "    at userFn (src/app.ts:5:1)",
      "    at fn (node_modules/lib/index.js:1:1)",
      "    at internal (node:internal/process:1:1)",
    ].join("\n");
    const frames = parseStack(stub(raw));
    const app = appFrames(frames);
    expect(app).toHaveLength(1);
    expect(app[0]!.fn).toBe("userFn");
  });

  it("firstAppFrame returns the first app frame", () => {
    const raw = [
      "Error: x",
      "    at fn (node_modules/lib.js:1:1)",
      "    at myFn (src/app.ts:10:1)",
    ].join("\n");
    const frames = parseStack(stub(raw));
    expect(firstAppFrame(frames)!.fn).toBe("myFn");
  });

  it("firstAppFrame falls back to first frame when all are third-party", () => {
    const raw = "Error: x\n    at fn (node_modules/lib.js:1:1)";
    const frames = parseStack(stub(raw));
    expect(firstAppFrame(frames)).not.toBeNull();
  });
});
