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

/**
 * Builds a concise prompt so the response is fast and focused.
 * Short prompt = fewer tokens = stays well within free-tier limits.
 * When `context` is provided (e.g. function source or description), it is
 * appended so the model can give more targeted suggestions.
 */
function buildPrompt(error: AnalyzedError, context?: string): string {
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
    lines.push(
      `Root cause: ${error.rootCause.type}: ${error.rootCause.message}`,
    );
  }

  let prompt =
    "You are a senior Node.js/TypeScript engineer. " +
    "Given the error below, provide 2–3 concise, actionable fix suggestions. " +
    "Each suggestion must be a single sentence. " +
    "Reply with a JSON array of strings ONLY — no markdown, no explanation outside the array.\n\n" +
    lines.join("\n");

  if (context && context.trim().length > 0) {
    // Truncate to 2000 chars to stay well within free-tier token limits
    const trimmed = context.trim().slice(0, 2000);
    prompt += `\n\nAdditional context (function source or description):\n${trimmed}`;
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
 * Calls an OpenAI-compatible chat-completions endpoint to generate fix suggestions.
 *
 * @param error    - The fully analysed error (sync pipeline output).
 * @param apiKey   - The user's API key for the chosen provider.
 * @param baseUrl  - Base URL of the provider (no trailing slash, no /chat/completions).
 * @param model    - Model name to use.
 * @param context  - Optional extra context: function source, description, etc.
 */
export async function fetchAISuggestions(
  error: AnalyzedError,
  apiKey: string,
  baseUrl: string,
  model: string,
  context?: string,
): Promise<AIResult> {
  const prompt = buildPrompt(error, context);
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

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
        max_tokens: 256,
      }),
    });
  } catch (networkErr) {
    const msg =
      networkErr instanceof Error ? networkErr.message : String(networkErr);
    return {
      ok: false,
      rateLimited: false,
      suggestions: [
        `AI suggestions unavailable due to a network error: ${msg}`,
      ],
      errorMessage: msg,
    };
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

  return {
    ok: true,
    rateLimited: false,
    suggestions: parseSuggestions(content),
  };
}
