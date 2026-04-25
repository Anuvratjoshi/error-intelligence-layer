import type { AnalyzedError, AIResult } from "../types/index.js";

// ─────────────────────────────────────────────
// AI suggestion layer — provider-agnostic
// Supports any OpenAI-compatible chat-completions API:
//   Groq (default, free tier), xAI Grok, OpenRouter, etc.
// ─────────────────────────────────────────────

const RATE_LIMIT_MESSAGE =
  "AI suggestions unavailable: daily rate limit reached. " +
  "Your pattern-based suggestions above are still accurate. " +
  "The quota resets every 24 hours — try again tomorrow.";

/** Timeout for the AI fetch request (ms). Prevents indefinite hangs. */
const AI_FETCH_TIMEOUT_MS = 10_000;

/**
 * Strip ASCII control characters (0x00–0x1F, 0x7F) that could be used in
 * prompt injection attacks. Preserves normal whitespace (\n, \t, space).
 */
function sanitizeForPrompt(value: string): string {
  // Remove control chars except tab (0x09), newline (0x0A), carriage return (0x0D)
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Validates that aiBaseUrl is a safe, absolute http/https URL.
 * Rejects file://, ftp://, javascript:, and anything non-http(s).
 */
function validateBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid aiBaseUrl: "${baseUrl}" is not a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid aiBaseUrl: protocol must be http or https, got "${parsed.protocol}".`,
    );
  }
}

/**
 * Builds a concise prompt so the response is fast and focused.
 * Short prompt = fewer tokens = stays well within free-tier limits.
 * When `context` is provided (e.g. function source or description), it is
 * appended so the model can give more targeted suggestions.
 *
 * When `includeFix` is true the model is asked to also produce a
 * step-by-step fix plan (up to 10 numbered steps) inside the same JSON
 * object — one network call, no extra quota.
 */
function buildPrompt(
  error: AnalyzedError,
  context?: string,
  includeFix?: boolean,
): string {
  const lines: string[] = [
    `Error type: ${sanitizeForPrompt(error.type)}`,
    `Message: ${sanitizeForPrompt(error.message)}`,
  ];

  if (error.code) {
    lines.push(`Code: ${error.code}`);
  }

  if (error.stack.length > 0) {
    const topFrame = error.stack.find((f) => !f.isNative && !f.isThirdParty);
    if (topFrame) {
      lines.push(
        `Top frame: ${topFrame.fn ?? "<anonymous>"} at ${topFrame.file}:${topFrame.line}`,
      );
    }
  }

  if (error.rootCause && error.rootCause.message !== error.message) {
    lines.push(
      `Root cause: ${sanitizeForPrompt(error.rootCause.type)}: ${sanitizeForPrompt(error.rootCause.message)}`,
    );
  }

  const errorBlock = lines.join("\n");
  const hasCodeContext = context != null && context.trim().length > 0;
  const sanitizedContext = hasCodeContext
    ? sanitizeForPrompt(context!.trim()).slice(0, 2000)
    : null;

  let prompt: string;

  if (includeFix) {
    if (sanitizedContext) {
      // When the caller passes function source, ask for a concrete corrected
      // version of that code — not generic advice.
      prompt =
        "You are a senior Node.js/TypeScript engineer.\n" +
        "The function below threw the error shown. Your job:\n" +
        '1. In "suggestions": give 2–3 one-sentence hints that explain WHY this error occurs.\n' +
        '2. In "fix": write the CORRECTED version of the function only — real, runnable code ' +
        "with the bug fixed (e.g. optional chaining, null guard, try/catch).\n" +
        "   IMPORTANT formatting rules for the fix:\n" +
        "   - Preserve the original indentation (2-space or 4-space, match the source).\n" +
        "   - Each line of code MUST be a separate line — do NOT collapse the function onto one line.\n" +
        "   - Use \\n to represent newlines inside the JSON string value.\n" +
        "   - No markdown fences, no explanation text outside the function body.\n" +
        "   - Add a short inline comment on each changed line only.\n" +
        "Reply with ONLY this JSON (no markdown, no extra text):\n" +
        '{"suggestions":["..."],"fix":"async function example() {\\n  line1;\\n  line2;\\n}"}\n\n' +
        "Error:\n" +
        errorBlock +
        "\n\nFunction source:\n" +
        sanitizedContext;
    } else {
      // No source available — fall back to a precise numbered fix plan
      prompt =
        "You are a senior Node.js/TypeScript engineer. Given the error below:\n" +
        '1. In "suggestions": give 2–3 one-sentence hints explaining why this error occurs.\n' +
        '2. In "fix": write AT MOST 10 numbered steps that are SPECIFIC to this exact error ' +
        "and directly actionable (reference the error type, message, and file/line when available). " +
        "No generic advice.\n" +
        "Reply with ONLY this JSON (no markdown, no extra text):\n" +
        '{"suggestions":["..."],"fix":"1. ...\\n2. ..."}\n\n' +
        "Error:\n" +
        errorBlock;
    }
  } else {
    prompt =
      "You are a senior Node.js/TypeScript engineer. " +
      "Given the error below, provide 2–3 concise, actionable fix suggestions. " +
      "Each suggestion must be a single sentence. " +
      "Reply with a JSON array of strings ONLY — no markdown, no explanation outside the array.\n\n" +
      errorBlock;
    if (sanitizedContext) {
      prompt += `\n\nAdditional context (function source or description):\n${sanitizedContext}`;
    }
  }

  return prompt;
}

/**
 * Parses the model response content into an array of suggestion strings.
 * Handles cases where the model wraps the array in extra text or markdown.
 */
function parseSuggestions(content: string): string[] {
  const match = content.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        return (parsed as string[]).filter((s) => s.trim().length > 0);
      }
    } catch {
      // fall through
    }
  }
  // Fallback: treat each non-empty line as a suggestion
  return content
    .split("\n")
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 10);
}

/**
 * Parses the combined `{suggestions, fix}` JSON object returned when
 * `includeFix` is true.
 *
 * Falls back gracefully: if the model ignores the schema, suggestions are
 * extracted with `parseSuggestions` and `fix` is left undefined.
 */
function parseCombinedResponse(content: string): {
  suggestions: string[];
  fix: string | undefined;
} {
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]) as Record<string, unknown>;
      const suggestions =
        Array.isArray(parsed["suggestions"]) &&
        (parsed["suggestions"] as unknown[]).every((s) => typeof s === "string")
          ? (parsed["suggestions"] as string[]).filter(
              (s) => s.trim().length > 0,
            )
          : [];
      const fix =
        typeof parsed["fix"] === "string" && parsed["fix"].trim().length > 0
          ? parsed["fix"].trim()
          : undefined;
      if (suggestions.length > 0 || fix != null) {
        return {
          suggestions,
          // Unescape \n sequences the model emits inside JSON string values
          // so the caller receives a properly line-broken string.
          fix: fix != null ? fix.replace(/\\n/g, "\n") : undefined,
        };
      }
    } catch {
      // fall through
    }
  }
  // Fallback: parse as plain suggestions, no fix
  return { suggestions: parseSuggestions(content), fix: undefined };
}

/**
 * Calls an OpenAI-compatible chat-completions endpoint to generate fix suggestions.
 *
 * @param error       - The fully analysed error (sync pipeline output).
 * @param apiKey      - The user's API key for the chosen provider.
 * @param baseUrl     - Base URL of the provider (no trailing slash, no /chat/completions).
 * @param model       - Model name to use.
 * @param context     - Optional extra context: function source, description, etc.
 * @param includeFix  - When true, also requests a step-by-step fix plan (dev only).
 */
export async function fetchAISuggestions(
  error: AnalyzedError,
  apiKey: string,
  baseUrl: string,
  model: string,
  context?: string,
  includeFix?: boolean,
): Promise<AIResult> {
  // Validate URL protocol before making any network request (prevent SSRF)
  try {
    validateBaseUrl(baseUrl);
  } catch (validationErr) {
    const msg =
      validationErr instanceof Error
        ? validationErr.message
        : String(validationErr);
    return {
      ok: false,
      rateLimited: false,
      suggestions: [`AI suggestions unavailable: ${msg}`],
      errorMessage: msg,
    };
  }

  const prompt = buildPrompt(error, context, includeFix);
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  // Use more tokens when the fix plan is also requested (still within free tier).
  // suggestions-only: ~50 tokens output; with fix (up to 10 steps): ~200 tokens.
  const maxTokens = includeFix ? 512 : 256;

  // Abort after AI_FETCH_TIMEOUT_MS to prevent indefinite hangs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
  } catch (networkErr) {
    clearTimeout(timeoutId);
    const isTimeout =
      networkErr instanceof Error && networkErr.name === "AbortError";
    const msg = isTimeout
      ? `AI request timed out after ${AI_FETCH_TIMEOUT_MS / 1000}s`
      : "AI suggestions unavailable due to a network error";
    return {
      ok: false,
      rateLimited: false,
      suggestions: [msg],
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // Rate limit / quota exceeded
  if (response.status === 429) {
    return { ok: false, rateLimited: true, suggestions: [RATE_LIMIT_MESSAGE] };
  }

  // Auth errors
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      rateLimited: false,
      suggestions: [
        "AI suggestions unavailable: invalid or unauthorised API key. " +
          "Check that aiApiKey in configure() is correct.",
      ],
      errorMessage: `HTTP ${response.status}`,
    };
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      ok: false,
      rateLimited: false,
      suggestions: [
        `AI suggestions unavailable: provider returned HTTP ${response.status}`,
      ],
      errorMessage: errorText || `HTTP ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      rateLimited: false,
      suggestions: [
        "AI suggestions unavailable: invalid JSON response from provider.",
      ],
      errorMessage: "JSON parse error",
    };
  }

  const content =
    (body as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content ?? "";

  if (!content.trim()) {
    return {
      ok: false,
      rateLimited: false,
      suggestions: [
        "AI suggestions unavailable: empty response from provider.",
      ],
      errorMessage: "Empty content",
    };
  }

  if (includeFix) {
    const { suggestions, fix } = parseCombinedResponse(content);
    return { ok: true, rateLimited: false, suggestions, fix };
  }

  return {
    ok: true,
    rateLimited: false,
    suggestions: parseSuggestions(content),
  };
}
