import type { AnalyzedError, AIResult } from "../types/index.js";

// ─────────────────────────────────────────────
// xAI Grok API integration
// ─────────────────────────────────────────────

const GROK_API_URL = "https://api.x.ai/v1/chat/completions";

const RATE_LIMIT_MESSAGE =
  "AI suggestions unavailable: xAI Grok daily rate limit reached. " +
  "Your pattern-based suggestions above are still accurate. " +
  "The AI quota resets every 24 hours — try again tomorrow.";

const NOT_CONFIGURED_MESSAGE =
  "AI suggestions not configured. Pass xaiApiKey and set enableAISuggestions: true in configure().";

/**
 * Builds a concise prompt for Grok so the response is fast and focused.
 * Keeps the prompt short to minimise token usage (free-tier friendly).
 */
function buildPrompt(error: AnalyzedError): string {
  const lines: string[] = [
    `Error type: ${error.type}`,
    `Message: ${error.message}`,
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
    lines.push(`Root cause: ${error.rootCause.type}: ${error.rootCause.message}`);
  }

  return (
    "You are a senior Node.js/TypeScript engineer. " +
    "Given the error below, provide 2–3 concise, actionable fix suggestions. " +
    "Each suggestion must be a single sentence. " +
    "Reply with a JSON array of strings ONLY — no markdown, no explanation outside the array.\n\n" +
    lines.join("\n")
  );
}

/**
 * Parses the Grok response content into an array of suggestion strings.
 * Handles edge cases where the model returns extra text around the JSON array.
 */
function parseSuggestions(content: string): string[] {
  // Extract the first JSON array found in the response
  const match = content.match(/\[[\s\S]*?\]/);
  if (!match) {
    // Fallback: split by newline and treat each non-empty line as a suggestion
    return content
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((l) => l.length > 10);
  }

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every((s) => typeof s === "string")
    ) {
      return (parsed as string[]).filter((s) => s.trim().length > 0);
    }
  } catch {
    // Fall through to line-split fallback
  }

  return content
    .split("\n")
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 10);
}

/**
 * Calls the xAI Grok API to generate AI-powered fix suggestions.
 *
 * @param error   - The fully analysed error (sync pipeline output).
 * @param apiKey  - The user's xAI API key.
 * @param model   - Grok model name (default: "grok-3-mini").
 * @returns       AIResult with suggestions or rate-limit metadata.
 */
export async function fetchAISuggestions(
  error: AnalyzedError,
  apiKey: string,
  model = "grok-3-mini",
): Promise<AIResult> {
  if (!apiKey) {
    return {
      ok: false,
      rateLimited: false,
      suggestions: [NOT_CONFIGURED_MESSAGE],
      errorMessage: "No API key provided.",
    };
  }

  const prompt = buildPrompt(error);

  let response: Response;
  try {
    response = await fetch(GROK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 256,
      }),
    });
  } catch (networkErr) {
    const msg =
      networkErr instanceof Error ? networkErr.message : String(networkErr);
    return {
      ok: false,
      rateLimited: false,
      suggestions: [`AI suggestions unavailable due to a network error: ${msg}`],
      errorMessage: msg,
    };
  }

  // Rate limit (429) or quota exceeded
  if (response.status === 429) {
    return {
      ok: false,
      rateLimited: true,
      suggestions: [RATE_LIMIT_MESSAGE],
    };
  }

  // Auth errors
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      rateLimited: false,
      suggestions: [
        "AI suggestions unavailable: invalid or unauthorised xAI API key. " +
          "Check that xaiApiKey in configure() matches your key at https://console.x.ai",
      ],
      errorMessage: `HTTP ${response.status}`,
    };
  }

  if (!response.ok) {
    const errorMessage = `xAI Grok API returned HTTP ${response.status}`;
    return {
      ok: false,
      rateLimited: false,
      suggestions: [`AI suggestions unavailable: ${errorMessage}`],
      errorMessage,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      rateLimited: false,
      suggestions: ["AI suggestions unavailable: failed to parse API response."],
      errorMessage: "JSON parse error on response body",
    };
  }

  // Extract content from OpenAI-compatible response shape
  const content =
    (body as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content ?? "";

  if (!content.trim()) {
    return {
      ok: false,
      rateLimited: false,
      suggestions: ["AI suggestions unavailable: empty response from Grok API."],
      errorMessage: "Empty content",
    };
  }

  const suggestions = parseSuggestions(content);

  return {
    ok: true,
    rateLimited: false,
    suggestions: suggestions.length > 0
      ? suggestions
      : ["AI returned a response but no parseable suggestions were found."],
  };
}
