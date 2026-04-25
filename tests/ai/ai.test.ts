import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeErrorAsync,
  wrapAsyncWithAI,
  withErrorBoundaryAsync,
} from "../../src/core/analyzer.js";
import { configure, resetConfig } from "../../src/index.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

function mockFetchReject(message: string) {
  vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error(message));
}

const GROQ_RESPONSE = (suggestions: string[]) => ({
  choices: [{ message: { content: JSON.stringify(suggestions) } }],
});

beforeEach(() => {
  resetConfig();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetConfig();
});

// ─────────────────────────────────────────────
// AI disabled (default)
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — AI disabled", () => {
  it("does not call fetch when enableAISuggestions is false (default)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(spy).not.toHaveBeenCalled();
    expect(result.aiSuggestion).toBeUndefined();
  });

  it("still returns pattern-based suggestions when AI is disabled", async () => {
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.aiSuggestion).toBeUndefined();
  });

  it("does not call fetch when enableAISuggestions is true but aiApiKey is missing", async () => {
    configure({ enableAISuggestions: true }); // no aiApiKey
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await analyzeErrorAsync(new TypeError("no key"));
    expect(spy).not.toHaveBeenCalled();
    expect(result.aiSuggestion).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Successful AI response
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — successful AI response", () => {
  beforeEach(() => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
  });

  it("populates aiSuggestion from JSON array response", async () => {
    mockFetch(
      200,
      GROQ_RESPONSE(["Use optional chaining.", "Check for null."]),
    );
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion).toEqual([
      "Use optional chaining.",
      "Check for null.",
    ]);
  });

  it("preserves pattern-based suggestions alongside aiSuggestion", async () => {
    mockFetch(200, GROQ_RESPONSE(["AI tip one.", "AI tip two."]));
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.aiSuggestion).toHaveLength(2);
  });

  it("falls back to line-split when model returns text instead of JSON array", async () => {
    mockFetch(200, {
      choices: [
        {
          message: {
            content: "- Check your null values.\n- Add a guard clause.",
          },
        },
      ],
    });
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(Array.isArray(result.aiSuggestion)).toBe(true);
    expect(result.aiSuggestion!.length).toBeGreaterThan(0);
  });

  it("uses the configured aiModel when calling the provider", async () => {
    configure({
      aiApiKey: "test-key",
      enableAISuggestions: true,
      aiModel: "gemma2-9b-it",
    });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => GROQ_RESPONSE(["tip"]),
      text: async () => "",
    } as Response);
    await analyzeErrorAsync(new TypeError("test"));
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe("gemma2-9b-it");
  });

  it("uses the configured aiBaseUrl when calling the provider", async () => {
    configure({
      aiApiKey: "test-key",
      enableAISuggestions: true,
      aiBaseUrl: "https://api.x.ai/v1",
    });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => GROQ_RESPONSE(["tip"]),
      text: async () => "",
    } as Response);
    await analyzeErrorAsync(new TypeError("test"));
    expect(spy.mock.calls[0]![0]).toBe("https://api.x.ai/v1/chat/completions");
  });

  it("includes context in the prompt when options.context is provided", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => GROQ_RESPONSE(["tip"]),
      text: async () => "",
    } as Response);
    await analyzeErrorAsync(new TypeError("test"), {
      context: "async function fetchUser(id) { return db.users.findById(id); }",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const promptContent: string = body.messages[0].content;
    expect(promptContent).toContain("fetchUser");
    // When context is source code and includeFix=true, the label is "Function source"
    expect(promptContent).toMatch(/Function source|Additional context/i);
  });

  it("context is truncated to 2000 chars in the prompt", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => GROQ_RESPONSE(["tip"]),
      text: async () => "",
    } as Response);
    const longContext = "x".repeat(5000);
    await analyzeErrorAsync(new TypeError("test"), { context: longContext });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const promptContent: string = body.messages[0].content;
    // The context in the prompt should not exceed 2000 chars
    const contextSection = promptContent.split("Additional context")[1] ?? "";
    expect(contextSection.length).toBeLessThanOrEqual(2100); // 2000 + small overhead
  });
});

// ─────────────────────────────────────────────
// Rate limiting (429)
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — rate limit", () => {
  it("surfaces rate-limit message in aiSuggestion on 429", async () => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
    mockFetch(429, {});
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion).toBeDefined();
    expect(result.aiSuggestion![0]).toMatch(/rate limit/i);
    expect(result.suggestions.length).toBeGreaterThan(0); // pattern suggestions intact
  });
});

// ─────────────────────────────────────────────
// Auth errors (401 / 403)
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — auth errors", () => {
  beforeEach(() => {
    configure({ aiApiKey: "bad-key", enableAISuggestions: true });
  });

  it("surfaces auth error message on 401", async () => {
    mockFetch(401, {});
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion![0]).toMatch(/invalid|unauthori/i);
  });

  it("surfaces auth error message on 403", async () => {
    mockFetch(403, {});
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion![0]).toMatch(/invalid|unauthori/i);
  });
});

// ─────────────────────────────────────────────
// Network failure
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — network failure", () => {
  it("surfaces network error message when fetch throws", async () => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
    mockFetchReject("ECONNREFUSED");
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion![0]).toMatch(/network error/i);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Server errors (5xx)
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — server errors", () => {
  it("surfaces HTTP error message on 500", async () => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
    mockFetch(500, {});
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion![0]).toMatch(/HTTP 500/);
  });
});

// ─────────────────────────────────────────────
// Empty / malformed response
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — empty or malformed response", () => {
  beforeEach(() => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
  });

  it("surfaces fallback message when choices array is empty", async () => {
    mockFetch(200, { choices: [] });
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion![0]).toMatch(/unavailable/i);
  });

  it("surfaces fallback message when content is empty string", async () => {
    mockFetch(200, { choices: [{ message: { content: "" } }] });
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion![0]).toMatch(/unavailable/i);
  });
});

// ─────────────────────────────────────────────
// Output shape
// ─────────────────────────────────────────────

describe("analyzeErrorAsync — output shape", () => {
  it("all standard AnalyzedError fields are present alongside aiSuggestion", async () => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
    mockFetch(200, GROQ_RESPONSE(["Do this.", "Do that."]));
    const result = await analyzeErrorAsync(
      new RangeError("Maximum call stack size exceeded"),
    );
    expect(result.type).toBe("RangeError");
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof result.timestamp).toBe("string");
    expect(Array.isArray(result.stack)).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.aiSuggestion).toEqual(["Do this.", "Do that."]);
  });
});

// ─────────────────────────────────────────────
// wrapAsyncWithAI
// ─────────────────────────────────────────────

describe("wrapAsyncWithAI", () => {
  it("returns [null, result] on success — no fetch called", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const safe = wrapAsyncWithAI(async (x: number) => x * 2);
    const [err, val] = await safe(5);
    expect(err).toBeNull();
    expect(val).toBe(10);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns [AnalyzedError, undefined] on error with aiSuggestion when AI configured", async () => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
    mockFetch(200, GROQ_RESPONSE(["Fix the null check."]));
    const safe = wrapAsyncWithAI(async () => {
      throw new TypeError("boom");
    });
    const [err, val] = await safe();
    expect(val).toBeUndefined();
    expect(err).not.toBeNull();
    expect(err!.type).toBe("TypeError");
    expect(err!.aiSuggestion).toEqual(["Fix the null check."]);
  });

  it("returns AnalyzedError without aiSuggestion when AI is disabled", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const safe = wrapAsyncWithAI(async () => {
      throw new TypeError("boom");
    });
    const [err] = await safe();
    expect(err!.aiSuggestion).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// withErrorBoundaryAsync
// ─────────────────────────────────────────────

describe("withErrorBoundaryAsync", () => {
  it("returns the result when no error is thrown", async () => {
    const safe = withErrorBoundaryAsync(async (x: number) => x + 1);
    const result = await safe(4);
    expect(result).toBe(5);
  });

  it("calls onError with aiSuggestion when AI is configured", async () => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
    mockFetch(200, GROQ_RESPONSE(["Add null guard."]));
    let captured: unknown;
    const safe = withErrorBoundaryAsync(
      async () => {
        throw new ReferenceError("x is not defined");
      },
      (e) => {
        captured = e;
      },
    );
    await safe();
    expect((captured as { aiSuggestion?: string[] }).aiSuggestion).toEqual([
      "Add null guard.",
    ]);
  });

  it("calls onError without aiSuggestion when AI is disabled", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    let captured: unknown;
    const safe = withErrorBoundaryAsync(
      async () => {
        throw new Error("oops");
      },
      (e) => {
        captured = e;
      },
    );
    await safe();
    expect(
      (captured as { aiSuggestion?: string[] }).aiSuggestion,
    ).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("writes to stderr when no onError given and AI is disabled", async () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const safe = withErrorBoundaryAsync(async () => {
      throw new Error("no handler");
    });
    await safe();
    expect(spy).toHaveBeenCalled();
  });

  it("returns undefined after catching an error", async () => {
    const safe = withErrorBoundaryAsync(
      async () => {
        throw new Error("oops");
      },
      () => {},
    );
    const result = await safe();
    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Security: URL validation (SSRF prevention)
// ─────────────────────────────────────────────

describe("fetchAISuggestions — URL validation", () => {
  beforeEach(() => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
  });

  it("rejects file:// aiBaseUrl without making a network request", async () => {
    configure({ aiBaseUrl: "file:///etc/passwd" });
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await analyzeErrorAsync(new TypeError("test"));
    expect(spy).not.toHaveBeenCalled();
    expect(result.aiSuggestion![0]).toMatch(/invalid aibaseurl|protocol/i);
  });

  it("rejects ftp:// aiBaseUrl", async () => {
    configure({ aiBaseUrl: "ftp://malicious.example.com/v1" });
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await analyzeErrorAsync(new TypeError("test"));
    expect(spy).not.toHaveBeenCalled();
    expect(result.aiSuggestion![0]).toMatch(/invalid aibaseurl|protocol/i);
  });

  it("accepts https:// aiBaseUrl and calls fetch", async () => {
    configure({ aiBaseUrl: "https://api.groq.com/openai/v1" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '["tip"]' } }] }),
      text: async () => "",
    } as Response);
    await analyzeErrorAsync(new TypeError("test"));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────
// Security: prompt injection sanitization
// ─────────────────────────────────────────────

describe("fetchAISuggestions — prompt injection sanitization", () => {
  beforeEach(() => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
  });

  it("strips ASCII control characters from error message before sending to AI", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '["tip"]' } }] }),
      text: async () => "",
    } as Response);
    // Inject control chars: \x00 (null byte), \x1B (ESC), \x07 (BEL)
    const maliciousError = new TypeError(
      "normal\x00message\x1B[injection]\x07",
    );
    await analyzeErrorAsync(maliciousError);
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const prompt: string = body.messages[0].content;
    expect(prompt).not.toMatch(/\x00|\x1B|\x07/);
    expect(prompt).toContain("normalmessage");
  });

  it("strips control characters from context field", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '["tip"]' } }] }),
      text: async () => "",
    } as Response);
    await analyzeErrorAsync(new TypeError("test"), {
      context: "safe code\x00\x1Bmalicious injection attempt",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const prompt: string = body.messages[0].content;
    expect(prompt).not.toMatch(/\x00|\x1B/);
    expect(prompt).toContain("safe code");
  });
});

// ─────────────────────────────────────────────
// Security: fetch timeout
// ─────────────────────────────────────────────

describe("fetchAISuggestions — timeout", () => {
  it("surfaces a timeout message when fetch is aborted", async () => {
    configure({ aiApiKey: "test-key", enableAISuggestions: true });
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          (opts?.signal as AbortSignal)?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    // Use fake timers to trigger the 10s timeout instantly
    vi.useFakeTimers();
    const promise = analyzeErrorAsync(new TypeError("slow"));
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();
    expect(result.aiSuggestion![0]).toMatch(/timed out/i);
  });
});

// ─────────────────────────────────────────────
// aiFixSuggested — dev-only step-by-step fix field
// ─────────────────────────────────────────────

const FIX_RESPONSE = (suggestions: string[], fix: string) => ({
  choices: [
    {
      message: {
        content: JSON.stringify({ suggestions, fix }),
      },
    },
  ],
});

describe("aiFixSuggested — populated in development", () => {
  beforeEach(() => {
    // Ensure we are simulating a non-production environment
    vi.stubEnv("NODE_ENV", "development");
    configure({
      aiApiKey: "test-key",
      enableAISuggestions: true,
      enableAIFix: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("populates aiFixSuggested when enableAIFix is true and not in production", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () =>
        FIX_RESPONSE(
          ["Use optional chaining.", "Add a null guard."],
          "1. Check the variable is defined.\n2. Add a null guard.\n3. Use optional chaining.",
        ),
      text: async () => "",
    } as Response);
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    expect(result.aiSuggestion).toEqual([
      "Use optional chaining.",
      "Add a null guard.",
    ]);
    expect(result.aiFixSuggested).toBe(
      "1. Check the variable is defined.\n2. Add a null guard.\n3. Use optional chaining.",
    );
  });

  it("sends max_tokens 512 in the request body when includeFix is true", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => FIX_RESPONSE(["tip"], "1. Fix it."),
      text: async () => "",
    } as Response);
    await analyzeErrorAsync(new TypeError("test"));
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.max_tokens).toBe(512);
  });

  it("prompt requests corrected function code when context (source) is provided", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () =>
        FIX_RESPONSE(
          ["tip"],
          "async function fetchUser() { return user?.profile?.name; }",
        ),
      text: async () => "",
    } as Response);
    await analyzeErrorAsync(new TypeError("test"), {
      context:
        "async function fetchUser(id) { return db.users.findById(id).profile.name; }",
    });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const prompt: string = body.messages[0].content;
    // Code-context path: asks for corrected function, not generic steps
    expect(prompt).toMatch(/corrected version/i);
    expect(prompt).toMatch(/Function source/i);
  });

  it("prompt falls back to numbered steps when no context is provided", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => FIX_RESPONSE(["tip"], "1. Fix it."),
      text: async () => "",
    } as Response);
    // No context — triggers the no-source fallback path
    await analyzeErrorAsync(new TypeError("test"));
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const prompt: string = body.messages[0].content;
    expect(prompt).toMatch(/numbered steps/i);
    expect(prompt).toMatch(/10/);
  });

  it("falls back gracefully when model returns a plain array (no fix field)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '["tip one.", "tip two."]' } }],
      }),
      text: async () => "",
    } as Response);
    const result = await analyzeErrorAsync(new TypeError("test"));
    // suggestions parsed from the array fallback
    expect(Array.isArray(result.aiSuggestion)).toBe(true);
    // fix is undefined when the model didn't return the object schema
    expect(result.aiFixSuggested).toBeUndefined();
  });
});

describe("aiFixSuggested — suppressed in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does NOT populate aiFixSuggested when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    configure({
      aiApiKey: "test-key",
      enableAISuggestions: true,
      enableAIFix: true,
    });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => GROQ_RESPONSE(["Use optional chaining."]),
      text: async () => "",
    } as Response);
    const result = await analyzeErrorAsync(new TypeError("bad type"));
    // aiSuggestion is still populated
    expect(result.aiSuggestion).toBeDefined();
    // aiFixSuggested must NOT be present
    expect(result.aiFixSuggested).toBeUndefined();
    // max_tokens should be 256 (no fix requested)
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.max_tokens).toBe(256);
  });

  it("does NOT populate aiFixSuggested when enableAIFix is false", async () => {
    vi.stubEnv("NODE_ENV", "development");
    configure({
      aiApiKey: "test-key",
      enableAISuggestions: true,
      enableAIFix: false,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => GROQ_RESPONSE(["tip"]),
      text: async () => "",
    } as Response);
    const result = await analyzeErrorAsync(new TypeError("test"));
    expect(result.aiFixSuggested).toBeUndefined();
  });
});
