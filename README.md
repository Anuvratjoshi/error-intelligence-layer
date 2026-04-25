<div align="center">

# error-intelligence-layer

**630+ built-in error patterns. Optional AI suggestions from any provider — Groq, xAI, OpenRouter, or your own.**

[![npm version](https://img.shields.io/npm/v/error-intelligence-layer.svg?style=flat-square)](https://www.npmjs.com/package/error-intelligence-layer)
[![license](https://img.shields.io/npm/l/error-intelligence-layer.svg?style=flat-square)](./LICENSE)
[![node](https://img.shields.io/node/v/error-intelligence-layer.svg?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat-square)](https://www.typescriptlang.org)
[![zero dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg?style=flat-square)](#)

Transforms **any** thrown value into a structured, enriched, developer-friendly object.  
Severity scoring · root-cause chains · fix suggestions · request context · plugin system · framework adapters.

</div>

---

## Why this exists

`catch (err)` gives you a raw `unknown`. You have to null-check, cast, parse the stack yourself, figure out severity, redact secrets from request metadata, walk the `.cause` chain, and repeat that logic everywhere. Then you copy-paste it across projects.

`error-intelligence-layer` does all of that in one call:

```ts
import { analyzeError } from "error-intelligence-layer";

try {
  await db.query(sql);
} catch (err) {
  const analyzed = analyzeError(err);
  // analyzed.severity     → "high"
  // analyzed.fingerprint  → "a3f91c2b"  (stable dedup hash)
  // analyzed.suggestions  → ["Check that the DB host is reachable…"]
  // analyzed.rootCause    → { type: "ConnectionError", message: "…" }
  // analyzed.stack        → parsed StackFrame[]
  // analyzed.environment  → { nodeVersion, pid, memory, uptime }
  // analyzed.request      → sanitised (Authorization/Cookie auto-redacted)
  console.log(analyzed);
}
```

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Core API](#core-api)
   - [analyzeError](#analyzeerror)
   - [analyzeErrorAsync](#analyzeerrorasync)
   - [createError](#createerror)
   - [wrapAsync](#wrapasync)
   - [wrapAsyncWithAI](#wrapasyncwithai)
   - [withErrorBoundary](#witherrorboundary)
   - [withErrorBoundaryAsync](#witherrorboundaryasync)
   - [formatError](#formaterror)
   - [getErrorFingerprint](#geterrorfingerprint)
5. [AI Suggestions — Optional](#ai-suggestions--optional)
   - [Why Groq?](#why-groq)
   - [Getting a free Groq API key](#getting-a-free-groq-api-key)
   - [Quick setup](#quick-setup)
   - [AI Fix Suggested — corrected code (dev only)](#ai-fix-suggested--corrected-code-dev-only)
   - [Using with xAI Grok](#using-with-xai-grok)
   - [Rate limits & fallback](#rate-limits--fallback)
6. [Configuration](#configuration)
7. [Types Reference](#types-reference)
8. [Plugin System](#plugin-system)
   - [Built-in plugins](#built-in-plugins)
   - [Writing a custom plugin](#writing-a-custom-plugin)
9. [Framework Adapters](#framework-adapters)
   - [Express](#express)
   - [Fastify](#fastify)
   - [Next.js App Router](#nextjs-app-router)
   - [Next.js Pages Router](#nextjs-pages-router)
10. [Output Formats](#output-formats)
11. [Edge Cases & Guarantees](#edge-cases--guarantees)
12. [Design Decisions](#design-decisions)

---

## Installation

```bash
npm install error-intelligence-layer
```

**Requirements:** Node.js ≥ 18, TypeScript ≥ 5.0 (optional but recommended).  
**Zero runtime dependencies** — no chalk, no crypto, no axios, nothing.

---

## Quick Start

```ts
import {
  analyzeError,
  createError,
  wrapAsync,
  configure,
  useBuiltInPlugins,
  registerPlugin,
} from "error-intelligence-layer";

// 1. One-time setup (optional)
configure({ defaultFormat: "pretty", includeEnv: true });
useBuiltInPlugins(registerPlugin); // opt in to built-in plugins

// 2. Analyze anything
const analyzed = analyzeError(
  new TypeError("Cannot read properties of undefined"),
);
console.log(analyzed.severity); // "high"
console.log(analyzed.suggestions); // ["Use optional chaining (?.)…"]
console.log(analyzed.fingerprint); // "e3a17f04"

// 3. Wrap async functions — never throw again
const safeFetch = wrapAsync(fetch);
const [err, response] = await safeFetch("https://api.example.com/data");
if (err) {
  console.error(err.severity, err.suggestions);
}
```

---

## Architecture

The library runs every error through a **6-stage pure-function pipeline**. Each stage is isolated and independently testable.

```
 any thrown value
       │
       ▼
┌─────────────────┐
│  1. Normalize   │  Coerces unknown → NormalizedError
│                 │  Handles: Error instances, strings, numbers,
│                 │  null/undefined, plain objects, Axios errors,
│                 │  framework-wrapped errors (.originalError/.inner)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. Parse Stack │  Raw stack string → StackFrame[]
│                 │  Parses V8 format, marks native/third-party/minified
│                 │  frames, strips async prefix, maps <anonymous> → null
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. Extract     │  Walks the .cause chain (ES2022 + legacy)
│                 │  Builds causeChain[], identifies rootCause
│                 │  Cycle detection, configurable max depth
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. Enrich      │  Attaches environment snapshot, fingerprint,
│                 │  ISO timestamp, request context (with auto-
│                 │  redaction of sensitive headers), sanitised metadata
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. Analyze     │  Derives severity (SEVERITY_MAP → message
│                 │  heuristics → fallback) and fix suggestions
│                 │  (15 pattern rules). Escalates severity when
│                 │  root cause is more severe than the wrapper.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. Assemble +  │  Merges all stage outputs into AnalyzedError,
│     Plugins     │  then runs registered plugins in order.
│                 │  Plugin errors are silently swallowed.
└────────┬────────┘
         │
         ▼
    AnalyzedError
```

**Folder structure:**

```
src/
├── index.ts                  ← public entry point
├── types/index.ts            ← all shared TypeScript types
├── constants/index.ts        ← SEVERITY_MAP, SUGGESTION_PATTERNS, defaults
├── utils/index.ts            ← safeStringify, hashString, redactSensitiveKeys
├── core/
│   ├── analyzer.ts           ← 6 public API functions
│   ├── pipeline.ts           ← 7-stage orchestration
│   ├── config.ts             ← global config store (configure/getConfig)
│   └── registry.ts           ← plugin registry
├── layers/
│   ├── normalization/        ← stage 1
│   ├── parsing/              ← stage 2
│   ├── extraction/           ← stage 3
│   ├── enrichment/           ← stage 4
│   ├── intelligence/         ← stage 5
│   └── formatting/           ← output serialisation
├── plugins/index.ts          ← built-in plugins (sub-path export)
└── adapters/index.ts         ← framework adapters (sub-path export)
```

---

## Core API

### `analyzeError`

The main entry point. Accepts **any** thrown value and returns a fully enriched `AnalyzedError`.

```ts
import { analyzeError } from "error-intelligence-layer";

function analyzeError(error: unknown, options?: AnalyzeOptions): AnalyzedError;
```

```ts
// Native Error
const r = analyzeError(new TypeError("bad type"));

// String throw
const r = analyzeError("something went wrong");

// Null/undefined (yes, people do this)
const r = analyzeError(null);

// Axios error (auto-detected, HTTP fields extracted)
try {
  await axios.get("/api");
} catch (err) {
  const r = analyzeError(err);
  // r.metadata.httpStatus    → 503
  // r.metadata.requestUrl    → "/api"
}

// With request context (sensitive headers auto-redacted)
const r = analyzeError(err, {
  request: {
    method: "POST",
    url: "/api/users",
    headers: req.headers, // Authorization, Cookie → "[REDACTED]"
    body: req.body,
  },
  includeEnv: false, // skip process/memory snapshot
});
```

**`AnalyzeOptions`**

| Option       | Type                              | Default  | Description                                        |
| ------------ | --------------------------------- | -------- | -------------------------------------------------- |
| `request`    | `RequestContext`                  | —        | HTTP request to attach to the output               |
| `includeEnv` | `boolean`                         | `true`   | Include `process.memoryUsage()`, PID, Node version |
| `format`     | `"json" \| "pretty" \| "compact"` | `"json"` | Output format hint (used by adapters)              |

---

### `createError`

Factory for custom errors that carry structured EIL metadata. When passed to `analyzeError()`, severity/code/metadata are preserved — not re-inferred.

```ts
import { createError, analyzeError } from "error-intelligence-layer";

function createError(
  message: string,
  options?: CreateErrorOptions,
): IntelligentError;
```

```ts
// Basic
throw createError("User not found");

// With severity + code
const err = createError("Database connection failed", {
  severity: "critical",
  code: "DB_CONN_FAILED",
});

// With metadata and cause chain
const err = createError("Payment processing failed", {
  severity: "high",
  code: "PAYMENT_FAILED",
  metadata: { orderId: "ord_123", amount: 4999 },
  cause: originalStripeError,
});

// Later in a catch block — metadata, severity, code are preserved
const analyzed = analyzeError(err);
// analyzed.severity          → "critical"
// analyzed.code              → "DB_CONN_FAILED"
// analyzed.causeChain[0]...  → originalStripeError details
```

**`CreateErrorOptions`**

| Option     | Type                      | Description                                            |
| ---------- | ------------------------- | ------------------------------------------------------ |
| `cause`    | `unknown`                 | The underlying error (ES2022 `.cause`)                 |
| `severity` | `Severity`                | Force a specific severity level                        |
| `code`     | `string`                  | Machine-readable code, e.g. `"ENOENT"`, `"DB_TIMEOUT"` |
| `metadata` | `Record<string, unknown>` | Arbitrary key-value data                               |

---

### `wrapAsync`

Converts a throwing async function into one that returns a **`[error, result]` tuple** — no try/catch needed.

```ts
import { wrapAsync } from "error-intelligence-layer";

function wrapAsync<TArgs, TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
): WrappedAsyncFn<TArgs, TReturn>;
```

```ts
import { wrapAsync } from "error-intelligence-layer";
import { readFile } from "fs/promises";

const safeRead = wrapAsync(readFile);
const [err, content] = await safeRead("./config.json", "utf-8");

if (err) {
  // err is a fully analyzed AnalyzedError
  console.error(`[${err.severity.toUpperCase()}]`, err.message);
  console.error("Suggestion:", err.suggestions[0]);
  return;
}

console.log(content);
```

```ts
// Works great with database calls
const safeFindUser = wrapAsync(db.users.findById.bind(db.users));
const [err, user] = await safeFindUser(userId);
```

**Return type:** `Promise<[AnalyzedError, undefined] | [null, TReturn]>`

---

### `withErrorBoundary`

Higher-order function that wraps any sync or async function. On error, calls an optional handler instead of propagating.

```ts
import { withErrorBoundary } from "error-intelligence-layer";

function withErrorBoundary<TArgs, TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  onError?: (error: AnalyzedError) => void,
): (...args: TArgs) => TReturn | Promise<TReturn> | undefined;
```

```ts
import { withErrorBoundary, analyzeError } from "error-intelligence-layer";

// Sync
const safeProcess = withErrorBoundary(
  (data: Buffer) => processBuffer(data),
  (err) =>
    logger.error(
      { severity: err.severity, fingerprint: err.fingerprint },
      err.message,
    ),
);

safeProcess(buffer); // never throws

// Async
const safeExport = withErrorBoundary(
  async (reportId: string) => generateReport(reportId),
  async (err) => {
    await alerting.send({ level: err.severity, msg: err.message });
  },
);

await safeExport("rpt_456");

// When no onError is given, the compact-formatted error is written to stderr
const safeMigrate = withErrorBoundary(runMigration);
await safeMigrate();
```

---

### `formatError`

Serialises an `AnalyzedError` to a string in any of the three built-in formats.

```ts
import { formatError } from "error-intelligence-layer";

function formatError(error: AnalyzedError, format?: FormatType): string;
```

```ts
const analyzed = analyzeError(new RangeError("Index out of bounds"));

// JSON (default) — full object, circular-safe
const json = formatError(analyzed, "json");
// → { "type": "RangeError", "severity": "high", "suggestions": [...], ... }

// Compact — one-liner for log lines
const compact = formatError(analyzed, "compact");
// → [RangeError|HIGH] Index out of bounds — src/utils.ts:42

// Pretty — ANSI multi-line for terminal output
const pretty = formatError(analyzed, "pretty");
// → ╔══ RangeError [HIGH] ══╗
//   │  Index out of bounds
//   │  src/utils.ts:42  ← myFunction
//   │
//   │  Suggestions:
//   │    • Check numeric bounds before indexing into the array.
//   └──────────────────────────────────────
```

---

### `getErrorFingerprint`

Produces a lightweight, **stable 8-character hex fingerprint** for any thrown value without running the full pipeline. Useful for deduplication in logging pipelines.

```ts
import { getErrorFingerprint } from "error-intelligence-layer";

function getErrorFingerprint(error: unknown): string;
```

```ts
const fp = getErrorFingerprint(
  new TypeError("Cannot read properties of undefined"),
);
// → "e3a17f04"

// Same error shape always produces the same fingerprint
// Different errors always produce different fingerprints

// Use in structured logging
logger.error({ fingerprint: getErrorFingerprint(err) }, err.message);
```

The fingerprint is a djb2 hash of `type + normalised-message + first-app-frame-file + line`. Whitespace in the message is normalised so minor formatting variations don't produce different fingerprints.

---

### `analyzeErrorAsync`

Async variant of `analyzeError` that additionally calls an AI provider to populate `aiSuggestion` on the result. Requires `aiApiKey` + `enableAISuggestions: true` in `configure()`. Falls back gracefully — if AI is disabled or the call fails, the result is identical to `analyzeError()`.

```ts
import { analyzeErrorAsync, configure } from "error-intelligence-layer";

configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });

async function analyzeErrorAsync(
  error: unknown,
  options?: AnalyzeOptions,
): Promise<AnalyzedError>;
```

```ts
try {
  await fetchUserData(userId);
} catch (err) {
  const analyzed = await analyzeErrorAsync(err);
  console.log(analyzed.suggestions); // ← always present (pattern-based)
  console.log(analyzed.aiSuggestion); // ← AI-generated (when configured)
}
```

> See [AI Suggestions — Optional](#ai-suggestions--optional) for full setup details.

---

### `wrapAsyncWithAI`

Like `wrapAsync` but enriches the error with AI suggestions on failure. Requires AI to be configured; when disabled, behaves identically to `wrapAsync`.

```ts
import { wrapAsyncWithAI, configure } from "error-intelligence-layer";

configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });

const safeRead = wrapAsyncWithAI(fs.promises.readFile);
const [err, content] = await safeRead("./config.json", "utf-8");

if (err) {
  console.log(err.suggestions); // pattern-based (always present)
  console.log(err.aiSuggestion); // AI-generated (when configured)
}
```

---

### `withErrorBoundaryAsync`

Like `withErrorBoundary` but the `onError` callback receives an `AnalyzedError` enriched with `aiSuggestion`. When AI is disabled, behaves identically to `withErrorBoundary`.

```ts
import { withErrorBoundaryAsync, configure } from "error-intelligence-layer";

configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });

const safeExport = withErrorBoundaryAsync(
  (reportId: string) => generateReport(reportId),
  async (err) => {
    await alerting.send({
      level: err.severity,
      msg: err.message,
      hint: err.aiSuggestion?.[0] ?? err.suggestions[0],
    });
  },
);

await safeExport("rpt_123"); // never throws
```

---

## AI Suggestions — Optional

On top of the 630+ built-in suggestion patterns, you can enable **AI-powered suggestions** from **any OpenAI-compatible provider** — the library is not tied to any single service.

The default provider is **[Groq](https://console.groq.com)**: genuinely free, no credit card required, **14 400 requests per day** on the free tier. You can swap to xAI Grok, OpenRouter, or any self-hosted model by changing two config fields.

Each user of your application supplies their own API key. No shared quota, no proxy.

```json
{
  "suggestions": [
    "Use optional chaining (?.) or add a null/undefined guard before accessing the property."
  ],
  "aiSuggestion": [
    "The error occurs because data.user may be undefined.",
    "The fetch response might not contain the expected JSON structure."
  ],
  "aiFixSuggested": "async function fetchUserProfile(userId) {\n  const response = await fetch(...);\n  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); // added\n  const data = await response.json();\n  return data?.user?.profile?.name; // optional chaining added\n}"
}
```

`suggestions` is always present. `aiSuggestion` is populated when AI is configured. `aiFixSuggested` is populated in **development only** (never in `NODE_ENV=production`).

---

### Why Groq?

| Provider   | Free tier       | Credit card required | Notes                                      |
| ---------- | --------------- | -------------------- | ------------------------------------------ |
| **Groq** ✓ | 14 400 req/day  | No                   | Default. Fast inference, OpenAI-compatible |
| xAI Grok   | Limited         | Yes                  | Point `aiBaseUrl` to `https://api.x.ai/v1` |
| OpenRouter | Varies by model | No (some models)     | Point `aiBaseUrl` accordingly              |

---

### Getting a free Groq API key

1. Go to **[console.groq.com](https://console.groq.com)**
2. Sign up with GitHub, Google, or email — no credit card needed
3. Click **API Keys** → **Create API Key**
4. Copy the key (starts with `gsk_`)
5. Store it in your environment: `GROQ_API_KEY=gsk_...`

---

### Quick setup

```ts
import { configure, analyzeErrorAsync } from "error-intelligence-layer";

// One-time, at app startup
configure({
  aiApiKey: process.env.GROQ_API_KEY, // gsk_...
  enableAISuggestions: true,
  // aiBaseUrl: "https://api.groq.com/openai/v1",  ← default, can omit
  // aiModel: "llama-3.3-70b-versatile",           ← default, can omit
});

// Then use analyzeErrorAsync anywhere you'd use analyzeError
try {
  await riskyOperation();
} catch (err) {
  const analyzed = await analyzeErrorAsync(err);

  console.log("Pattern suggestions:", analyzed.suggestions);
  // → ["Use optional chaining (?.) or add a null/undefined guard..."]

  console.log("AI suggestions:", analyzed.aiSuggestion);
  // → ["Verify the variable is defined before accessing its property.",
  //    "Add defensive checks with optional chaining: obj?.property."]
}
```

---

### Passing function source for better AI suggestions

Pass `context` in the options to give the AI more information. The AI uses this to give suggestions specific to your code, not just the error message.

```ts
// Pass the function source so AI can see what the code does
async function fetchUser(id: string) {
  const user = await db.users.findById(id);
  return user.profile.name; // ← crashes here when user is null
}

try {
  await fetchUser(userId);
} catch (err) {
  const analyzed = await analyzeErrorAsync(err, {
    context: fetchUser.toString(), // ← send the source to AI
  });

  // AI now knows the function body and gives targeted suggestions:
  // → "Check that db.users.findById() returns a user before accessing .profile"
  // → "Add a null check: if (!user) throw new NotFoundError(...)"
}
```

You can also pass a description instead of source code:

```ts
const analyzed = await analyzeErrorAsync(err, {
  context:
    "Parsing JWT token from the Authorization header in Express middleware",
});
```

**`wrapAsyncWithAI` and `withErrorBoundaryAsync` automatically pass `fn.toString()` as context** — no extra work needed:

```ts
const safeFetchUser = wrapAsyncWithAI(fetchUser);
// When fetchUser throws, the AI receives its source code automatically
const [err, user] = await safeFetchUser(userId);
if (err) {
  console.log(err.aiSuggestion); // suggestions specific to fetchUser's code
}
```

> Context is truncated to 2 000 characters before being sent to keep token usage within free-tier limits.

---

### AI Fix Suggested — corrected code (dev only)

`aiFixSuggested` goes one step further than `aiSuggestion`. While `aiSuggestion` gives you short hints explaining _why_ an error occurred, `aiFixSuggested` gives you the **actual corrected source code** — or a precise step-by-step plan when no source is available.

**It is a development-only field.** It is never populated when `NODE_ENV === "production"`, regardless of any config setting. This is a hard guard — not bypassable.

#### With function source (recommended)

When you pass `context: fn.toString()`, the AI receives the full function body and outputs the **fixed version of your exact code**, with inline comments on each changed line:

```ts
import { configure, analyzeErrorAsync } from "error-intelligence-layer";

configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });

async function fetchUserProfile(userId: string) {
  const response = await fetch(`https://api.example.com/users/${userId}`);
  const data = await response.json();
  return data.user.profile.name; // ← crashes when user or profile is null
}

try {
  await fetchUserProfile(userId);
} catch (err) {
  const analyzed = await analyzeErrorAsync(err, {
    context: fetchUserProfile.toString(),
  });

  console.log(analyzed.aiSuggestion);
  // → ["The error occurs because data.user may be undefined",
  //    "The fetch response might not contain the expected JSON structure"]

  console.log(analyzed.aiFixSuggested);
  // → async function fetchUserProfile(userId) {
  //     const response = await fetch(`https://api.example.com/users/${userId}`);
  //     if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); // added error check
  //     const data = await response.json();
  //     return data?.user?.profile?.name; // added optional chaining
  //   }
}
```

The fix is **code you can paste directly** — it targets the exact property chain, variable names, and structure of your function.

#### Without function source

When no `context` is passed, `aiFixSuggested` falls back to a numbered plan specific to the error type, message, and stack frame:

```ts
const analyzed = await analyzeErrorAsync(
  new TypeError("Cannot read properties of undefined (reading 'profile')"),
);

console.log(analyzed.aiFixSuggested);
// → 1. Check that the variable holding the object is not null/undefined before accessing .profile
// → 2. Add a guard: if (data && data.user) { ... } or use optional chaining data?.user?.profile
// → 3. Wrap the access in a try/catch block to handle unexpected API shapes
```

#### Production guard

```ts
// In production — aiFixSuggested is always undefined, regardless of enableAIFix
process.env.NODE_ENV = "production";
const analyzed = await analyzeErrorAsync(err);
console.log(analyzed.aiFixSuggested); // → undefined  ✓
console.log(analyzed.aiSuggestion); // → still populated  ✓
```

#### Disabling the fix field (saves tokens)

```ts
configure({
  aiApiKey: process.env.GROQ_API_KEY,
  enableAISuggestions: true,
  enableAIFix: false, // disable aiFixSuggested even in development
});
```

> **Token budget:** when `aiFixSuggested` is requested, `max_tokens` is raised from 256 to 512. This is still well within Groq's free tier (6 000 tokens/min). `wrapAsyncWithAI` and `withErrorBoundaryAsync` automatically pass `fn.toString()` as context, so the fixed code they produce is always targeted at the exact function that threw.

---

### Real-world usage patterns

**Next.js API route:**

```ts
// app/api/users/[id]/route.ts
import { analyzeErrorAsync, configure } from "error-intelligence-layer";

configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await db.users.findById(params.id);
    return Response.json(user);
  } catch (err) {
    const analyzed = await analyzeErrorAsync(err, {
      context: `GET /api/users/${params.id} — fetching user from database`,
    });
    return Response.json(
      {
        error: analyzed.message,
        suggestions: analyzed.aiSuggestion ?? analyzed.suggestions,
      },
      { status: 500 },
    );
  }
}
```

**Structured logging pipeline (Pino / Winston):**

```ts
import { analyzeErrorAsync } from "error-intelligence-layer";
import pino from "pino";

const logger = pino();

export async function logError(err: unknown, context?: string) {
  const analyzed = await analyzeErrorAsync(err, { context });
  logger.error(
    {
      type: analyzed.type,
      severity: analyzed.severity,
      fingerprint: analyzed.fingerprint,
      suggestions: analyzed.suggestions,
      aiSuggestion: analyzed.aiSuggestion,
      request: analyzed.request,
    },
    analyzed.message,
  );
}
```

**Express middleware with AI:**

```ts
import { expressErrorHandler, configure } from "error-intelligence-layer";

configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });

// enableAI: true tells the middleware to use analyzeErrorAsync
app.use(expressErrorHandler({ enableAI: true }));
```

**Free Groq models** (as of 2026):

| Model                     | Speed     | Best for                      |
| ------------------------- | --------- | ----------------------------- |
| `llama-3.3-70b-versatile` | Fast      | Default — best quality        |
| `llama3-8b-8192`          | Very fast | High-throughput / low latency |
| `gemma2-9b-it`            | Fast      | Alternative                   |

---

### Using with xAI Grok

```ts
configure({
  aiApiKey: process.env.XAI_API_KEY, // xai-...
  aiBaseUrl: "https://api.x.ai/v1", // override default
  aiModel: "grok-3-mini",
  enableAISuggestions: true,
});
```

---

### Rate limits & fallback

When the daily quota is exhausted, `aiSuggestion` contains a human-readable message instead of suggestions — `suggestions` (pattern-based) is always unaffected.

| Scenario              | `suggestions` | `aiSuggestion`                                                   |
| --------------------- | ------------- | ---------------------------------------------------------------- |
| AI disabled (default) | ✓ present     | `undefined`                                                      |
| AI enabled, key valid | ✓ present     | AI-generated strings                                             |
| Rate limit hit (429)  | ✓ present     | `"AI suggestions unavailable: daily rate limit reached…"`        |
| Invalid key (401/403) | ✓ present     | `"AI suggestions unavailable: invalid or unauthorised API key…"` |
| Network error         | ✓ present     | `"AI suggestions unavailable due to a network error: …"`         |

---

## Configuration

Global configuration applies to every `analyzeError()` call unless overridden per-call.

```ts
import { configure, getConfig, resetConfig } from "error-intelligence-layer";

configure({
  defaultFormat: "json", // "json" | "pretty" | "compact"
  includeEnv: true, // attach process snapshot to every error
  maxCauseDepth: 10, // how deep to walk .cause chains
  maxMetadataValueSize: 2048, // chars — larger values are truncated
  enablePlugins: true, // set false to disable all plugins
  sensitiveKeys: [
    // keys redacted in metadata + request body
    "password",
    "token",
    "secret",
    "authorization",
    "cookie",
    "x-api-key",
    "x-auth-token",
    // … your custom keys
    "ssn",
    "creditCard",
    "cvv",
  ],

  // ── AI suggestions (optional) ──────────────────────────────
  aiApiKey: process.env.GROQ_API_KEY, // gsk_... from console.groq.com
  enableAISuggestions: true, // default: false
  aiBaseUrl: "https://api.groq.com/openai/v1", // default — can omit
  aiModel: "llama-3.3-70b-versatile", // default — can omit
  enableAIFix: true, // default: true — set false to skip aiFixSuggested
});

// Read current config (frozen snapshot)
const cfg = getConfig();

// Restore defaults (useful in tests)
resetConfig();
```

**Default sensitive keys** (always redacted, regardless of `sensitiveKeys`):
`password`, `passwd`, `token`, `accesstoken`, `refreshtoken`, `secret`, `apikey`, `api_key`, `authorization`, `cookie`, `x-api-key`, `x-auth-token`, `x-access-token`

---

## Types Reference

All types are exported and fully documented.

```ts
import type {
  AIResult, // result shape from the AI layer
  AnalyzedError, // main output type
  AnalyzeOptions, // options for analyzeError()
  CreateErrorOptions, // options for createError()
  EILConfig, // shape of the global config
  EnvironmentInfo, // process snapshot
  FormatType, // "json" | "pretty" | "compact"
  IntelligentError, // Error subtype returned by createError()
  NormalizedError, // internal canonical representation
  Plugin, // plugin contract
  PluginContext, // context passed to plugins
  RequestContext, // HTTP request metadata
  Severity, // "low" | "medium" | "high" | "critical"
  StackFrame, // single parsed stack frame
  WrappedAsyncFn, // return type of wrapAsync / wrapAsyncWithAI
  WrappedResult, // [AnalyzedError, undefined] | [null, T]
} from "error-intelligence-layer";
```

### `AnalyzedError` — the central output type

```ts
interface AnalyzedError {
  type: string; // "TypeError", "RangeError", "AxiosError", …
  message: string; // normalised error message
  stack: StackFrame[]; // parsed frames (empty when unavailable)
  rawStack: string | null; // original raw stack string
  severity: Severity; // "low" | "medium" | "high" | "critical"
  fingerprint: string; // stable 8-char hex dedup hash
  rootCause: AnalyzedError | null; // deepest cause (null if no chain)
  causeChain: AnalyzedError[]; // [immediate cause → root cause]
  suggestions: string[]; // human-readable fix hints (always present)
  aiSuggestion?: string[]; // AI-generated short hints (when configured)
  aiFixSuggested?: string; // AI corrected code or step-by-step plan — DEV ONLY
  // Never present when NODE_ENV === "production"
  environment: EnvironmentInfo | null;
  request: RequestContext | null; // sanitised (secrets redacted)
  timestamp: string; // ISO 8601 — time analyzeError() was called
  metadata: Record<string, unknown>; // Axios fields, createError() metadata, …
  pluginData: Record<string, unknown>; // plugin-contributed data by name
  code: string | null; // "ENOENT", "ERR_MODULE_NOT_FOUND", …
}
```

### `Severity` levels

| Level        | When assigned                                         | Typical examples                              |
| ------------ | ----------------------------------------------------- | --------------------------------------------- |
| `"low"`      | Unknown/custom error types                            | Custom domain errors with no special handling |
| `"medium"`   | Generic `Error`, `URIError`, `EvalError`              | Fallback for base `Error` class               |
| `"high"`     | `TypeError`, `RangeError`, `AggregateError`, 5xx HTTP | Common runtime crashes                        |
| `"critical"` | `SyntaxError`, `ReferenceError`, OOM, stack overflow  | Process-threatening errors                    |

### `StackFrame`

```ts
interface StackFrame {
  file: string | null; // source file path
  line: number | null; // 1-based line number
  column: number | null; // 1-based column number
  fn: string | null; // function/method name (null when anonymous)
  isNative: boolean; // node:internal/* frames
  isThirdParty: boolean; // node_modules/* frames
  isMinified: boolean; // column > 500 heuristic
}
```

---

## Plugin System

Plugins run **after** the full pipeline, receiving a complete `AnalyzedError` and returning a partial override. They are the right place to enrich, re-score, or categorise errors with domain-specific logic.

### Built-in plugins

Import from the `error-intelligence-layer/plugins` sub-path:

```ts
import {
  httpStatusPlugin,
  nodeSystemPlugin,
  groupingPlugin,
  useBuiltInPlugins,
} from "error-intelligence-layer/plugins";

import { registerPlugin } from "error-intelligence-layer";

// Register all three at once
useBuiltInPlugins(registerPlugin);

// Or pick individually
registerPlugin(httpStatusPlugin);
registerPlugin(nodeSystemPlugin);
registerPlugin(groupingPlugin);
```

#### `httpStatusPlugin`

Reads `metadata.httpStatus` (populated automatically from Axios errors) and:

- Sets `pluginData["http-status"]` → `{ status: number, category: string }`
- Adds an HTTP-specific suggestion (400 → validate payload, 429 → back-off, etc.)
- Escalates severity for 5xx (`"high"`) and 401/403 (`"medium"`)

```ts
const r = analyzeError(axiosError); // after registering httpStatusPlugin
r.pluginData["http-status"]; // { status: 503, category: "Server Error" }
r.severity; // "high"
r.suggestions[0]; // "Server-side error. Check server logs and retry…"
```

#### `nodeSystemPlugin`

Maps 21 Node.js system error codes to human-readable suggestions:

| Code                   | Suggestion                                                |
| ---------------------- | --------------------------------------------------------- |
| `ENOENT`               | File or directory not found. Check the path.              |
| `EADDRINUSE`           | Port is already in use. Stop the conflicting process.     |
| `ECONNREFUSED`         | Connection refused. Ensure the target service is running. |
| `ERR_MODULE_NOT_FOUND` | Module not found. Run `npm install`.                      |
| `ERR_REQUIRE_ESM`      | Cannot require() an ESM module. Use dynamic `import()`.   |
| … and 16 more          |                                                           |

```ts
const err = Object.assign(new Error("listen EADDRINUSE :::3000"), {
  code: "EADDRINUSE",
});
const r = analyzeError(err); // after registering nodeSystemPlugin
r.pluginData["node-system"]; // { code: "EADDRINUSE" }
r.suggestions[0]; // "Port is already in use…"
```

#### `groupingPlugin`

Categorises every error into one of 11 groups for dashboards and alerting:

`network` · `filesystem` · `permission` · `validation` · `memory` · `syntax` · `type` · `reference` · `timeout` · `authentication` · `unknown`

```ts
const r = analyzeError(new TypeError("bad type")); // after registering groupingPlugin
r.pluginData["grouping"]; // { category: "type" }
```

### Writing a custom plugin

```ts
import type { Plugin } from "error-intelligence-layer";
import { registerPlugin } from "error-intelligence-layer";

const datadogPlugin: Plugin = {
  name: "datadog-enrichment",

  onAnalyze(error, context) {
    // Add your team's custom metadata
    const ddTags = [
      `env:${process.env.NODE_ENV}`,
      `service:${process.env.SERVICE_NAME}`,
      `severity:${error.severity}`,
    ].join(",");

    return {
      pluginData: {
        ...error.pluginData,
        "datadog-enrichment": {
          tags: ddTags,
          traceId: context.options.request?.headers?.["x-trace-id"],
        },
      },
    };
  },
};

registerPlugin(datadogPlugin);

// Plugin management
import {
  unregisterPlugin,
  clearPlugins,
  getPlugins,
} from "error-intelligence-layer";

unregisterPlugin("datadog-enrichment");
clearPlugins(); // remove all
getPlugins(); // list registered
```

**Plugin contract guarantees:**

- Plugins are called in registration order
- A plugin that throws is silently skipped — it never crashes the consumer
- Registering a plugin with a duplicate name replaces the previous one
- All overrides are shallow-merged into the `AnalyzedError`

---

## Framework Adapters

Import from the `error-intelligence-layer/adapters` sub-path.

```ts
import {
  expressErrorHandler,
  fastifyErrorPlugin,
  withNextErrorHandler,
  withNextApiErrorHandler,
} from "error-intelligence-layer/adapters";
```

All adapters share an `AdapterOptions` interface:

```ts
interface AdapterOptions {
  format?: "json" | "pretty" | "compact"; // default: "json"
  includeEnv?: boolean; // default: true
  onError?: (analyzed: AnalyzedError, raw: unknown) => void; // logging hook
}
```

### Express

```ts
import express from "express";
import { expressErrorHandler } from "error-intelligence-layer/adapters";
import { useBuiltInPlugins, registerPlugin } from "error-intelligence-layer";

useBuiltInPlugins(registerPlugin);

const app = express();

app.get("/users/:id", async (req, res, next) => {
  try {
    const user = await db.findUser(req.params.id);
    res.json(user);
  } catch (err) {
    next(err); // pass to error middleware below
  }
});

// Register LAST, after all routes
app.use(
  expressErrorHandler({
    format: "json",
    onError: (analyzed) => {
      logger.error({
        fingerprint: analyzed.fingerprint,
        severity: analyzed.severity,
      });
    },
  }),
);
```

The middleware automatically:

- Reads `error.statusCode` or `error.status` (defaults to 500)
- Attaches request method, URL, headers, and params to the analyzed error
- Redacts `Authorization`, `Cookie`, and other sensitive headers
- Sets the correct `Content-Type` header

### Fastify

```ts
import Fastify from "fastify";
import { fastifyErrorPlugin } from "error-intelligence-layer/adapters";

const fastify = Fastify();

await fastify.register(fastifyErrorPlugin, {
  format: "json",
  onError: (analyzed) => monitoring.capture(analyzed),
});

fastify.get("/items", async () => {
  throw new Error("db failure");
});

await fastify.listen({ port: 3000 });
```

### Next.js App Router

Wraps a route handler in the `app/` directory:

```ts
// app/api/users/route.ts
import { withNextErrorHandler } from "error-intelligence-layer/adapters";

export const GET = withNextErrorHandler(
  async (req: Request) => {
    const users = await db.users.findAll();
    return Response.json(users);
  },
  {
    onError: (analyzed) =>
      console.error(analyzed.fingerprint, analyzed.message),
  },
);
```

### Next.js Pages Router

Wraps a Pages API route handler:

```ts
// pages/api/users.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { withNextApiErrorHandler } from "error-intelligence-layer/adapters";

export default withNextApiErrorHandler(
  async (req: NextApiRequest, res: NextApiResponse) => {
    const users = await db.users.findAll();
    res.json(users);
  },
  {
    format: "json",
    onError: (analyzed) => sentry.captureException(analyzed),
  },
);
```

---

## Output Formats

### `"json"` (default)

Complete `AnalyzedError` as circular-safe JSON. Ideal for structured logging and APIs.

```json
{
  "type": "TypeError",
  "message": "Cannot read properties of undefined (reading 'id')",
  "severity": "high",
  "fingerprint": "e3a17f04",
  "timestamp": "2026-04-25T10:00:00.000Z",
  "code": null,
  "suggestions": [
    "Use optional chaining (?.) or add a null/undefined guard before accessing the property."
  ],
  "stack": [
    {
      "file": "src/handlers/users.ts",
      "line": 42,
      "column": 18,
      "fn": "getUser",
      "isNative": false,
      "isThirdParty": false,
      "isMinified": false
    }
  ],
  "rootCause": null,
  "causeChain": [],
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "linux",
    "pid": 1234,
    "uptime": 320.5
  },
  "request": {
    "method": "GET",
    "url": "/api/users/123",
    "headers": { "authorization": "[REDACTED]" }
  },
  "metadata": {},
  "pluginData": {}
}
```

### `"compact"`

Single-line format for log lines:

```
[TypeError|HIGH] Cannot read properties of undefined — src/handlers/users.ts:42
```

### `"pretty"`

ANSI-coloured multi-line output for terminals. Severity is colour-coded:

- `critical` → red background
- `high` → red text
- `medium` → yellow text
- `low` → green text

```
╔══ TypeError [HIGH] ══════════════════════════════════════════╗
│  Cannot read properties of undefined (reading 'id')
│
│  Stack:
│    → getUser                src/handlers/users.ts:42
│      handleRequest          src/server.ts:18
│      … 3 more frames
│
│  Suggestions:
│    • Use optional chaining (?.) or add a null/undefined guard.
│
│  Fingerprint: e3a17f04   2026-04-25T10:00:00.000Z
╚══════════════════════════════════════════════════════════════╝
```

---

## Edge Cases & Guarantees

| Scenario                    | Behaviour                                                                   |
| --------------------------- | --------------------------------------------------------------------------- |
| `throw "string"`            | `type: "StringError"`, `message: "string"`                                  |
| `throw null`                | `type: "NullError"`, `message: "null was thrown"`                           |
| `throw undefined`           | `type: "UndefinedError"`, `message: "undefined was thrown"`                 |
| `throw { message: "x" }`    | `type: "ObjectError"`, message extracted from `.message`                    |
| Circular object in metadata | `safeStringify` breaks cycles; never throws                                 |
| `.cause` cycle (a → b → a)  | Cycle detection via `Set`; traversal stops gracefully                       |
| Plugin throws               | Silently swallowed; other plugins continue                                  |
| Axios error                 | Auto-detected even though `AxiosError extends Error`; HTTP fields extracted |
| Framework-wrapped error     | `.originalError` / `.inner` unwrapped automatically                         |
| Minified stack              | Frames with column > 500 marked `isMinified: true`                          |
| Empty stack string          | Returns `[]`, no crash                                                      |
| `createError` metadata      | Preserved through the full pipeline; not re-inferred                        |

---

## Design Decisions

**Zero dependencies** — djb2 hash instead of `crypto`, inline ANSI codes instead of `chalk`. The entire library adds ~34 KB (CJS) to your bundle with no transitive risk.

**Dual CJS + ESM** — built with `tsup`. Works with `require()`, `import`, and TypeScript path resolution.

**Pure functions per stage** — every pipeline stage is a deterministic function with no side effects. Easy to test, easy to replace.

**`moduleResolution: "bundler"`** — chosen because the library targets modern toolchains (Vite, esbuild, tsup). For `ts-node` users, set `"moduleResolution": "node16"` in your tsconfig and the package will still work through the `exports` map.

**Sensitive-key redaction is always-on for auth headers** — `Authorization`, `Cookie`, `x-api-key`, and `x-auth-token` are stripped unconditionally, regardless of what `sensitiveKeys` is set to. This is intentional; there is no opt-out.

**Plugin errors are silently swallowed** — a misbehaving third-party plugin must never crash the consumer's application. The pipeline guarantees an `AnalyzedError` is always returned.

**Sub-path exports** — plugins and adapters are separate entry points (`/plugins`, `/adapters`) so consumers only bundle what they use.

---

## License

MIT © error-intelligence-layer contributors
