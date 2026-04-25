# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — 2026-04-25

### What's new

#### AI-powered suggestions (optional)

You can now enrich any analyzed error with AI-generated fix suggestions from any **OpenAI-compatible provider**. The default is [Groq](https://console.groq.com) — free tier, no credit card, **14 400 requests/day**.

```ts
import { configure, analyzeErrorAsync } from "error-intelligence-layer";

configure({ aiApiKey: process.env.GROQ_API_KEY, enableAISuggestions: true });

const analyzed = await analyzeErrorAsync(err);
console.log(analyzed.suggestions);   // pattern-based (always present)
console.log(analyzed.aiSuggestion);  // AI-generated (when configured)
```

#### Context-aware AI suggestions

Pass `context` (e.g. `fn.toString()`) so the AI generates suggestions specific to your code rather than just the error message:

```ts
const analyzed = await analyzeErrorAsync(err, {
  context: fetchUser.toString(),
});
// → suggestions referencing your actual property chains and logic
```

#### New API functions

| Function | Description |
|---|---|
| `analyzeErrorAsync(error, options?)` | Async `analyzeError` with optional AI enrichment |
| `wrapAsyncWithAI(fn)` | Like `wrapAsync` — auto-passes `fn.toString()` as AI context |
| `withErrorBoundaryAsync(fn, onError?)` | Like `withErrorBoundary` — error handler receives AI-enriched result |

#### Framework adapters: `enableAI` option

All four adapters (Express, Fastify, Next.js App Router, Next.js Pages Router) now accept `enableAI: true` to use `analyzeErrorAsync` automatically:

```ts
app.use(expressErrorHandler({ enableAI: true }));
```

#### Provider-agnostic design

Point `aiBaseUrl` and `aiModel` at any OpenAI-compatible endpoint:

```ts
// xAI Grok
configure({ aiApiKey: process.env.XAI_API_KEY, aiBaseUrl: "https://api.x.ai/v1", aiModel: "grok-3-mini", enableAISuggestions: true });

// OpenRouter
configure({ aiApiKey: process.env.OPENROUTER_API_KEY, aiBaseUrl: "https://openrouter.ai/api/v1", aiModel: "meta-llama/llama-3.3-70b-instruct", enableAISuggestions: true });
```

### Added

- `analyzeErrorAsync` — async variant of `analyzeError` with AI enrichment
- `wrapAsyncWithAI` — tuple-returning wrapper with AI; auto-passes function source as context
- `withErrorBoundaryAsync` — boundary wrapper with AI; auto-passes function source as context
- `AIResult` interface exported from the main entry point
- `aiSuggestion?: string[]` field on `AnalyzedError`
- `context?: string` field on `AnalyzeOptions`
- New config fields: `aiApiKey`, `aiBaseUrl`, `aiModel`, `enableAISuggestions`
- `enableAI?: boolean` option on all framework adapters
- `src/ai/index.ts` — provider-agnostic fetch layer (handles 429, 401/403, network errors, empty responses)
- 26 new AI tests (156 total across 10 test files)

### Changed

- `DEFAULT_CONFIG` now includes `enableAISuggestions: false`, `aiBaseUrl: "https://api.groq.com/openai/v1"`, `aiModel: "llama-3.3-70b-versatile"`
- `tsconfig.json` — added `"types": ["node"]`, included `tests/**/*` in `include`
- README fully updated with AI setup guide, provider comparison table, context examples, and real-world patterns

---

## [0.1.2] — 2026-04-24

### Added

- Expanded `SUGGESTION_PATTERNS` to **632 patterns** across 80+ error categories
- Improved npm discoverability (description and keywords)

---

## [0.1.0] — 2026-04-23

### Added

- Initial release
- 6-stage pure-function pipeline: normalize → parse stack → extract cause chain → enrich → analyze → assemble
- `analyzeError`, `createError`, `wrapAsync`, `withErrorBoundary`, `formatError`, `getErrorFingerprint`
- `configure`, `getConfig`, `resetConfig` global config
- Plugin system: `registerPlugin`, `unregisterPlugin`, `clearPlugins`, `getPlugins`
- Built-in plugins: `httpStatusPlugin`, `nodeSystemPlugin`, `groupingPlugin`
- Framework adapters: Express, Fastify, Next.js App Router, Next.js Pages Router
- Dual CJS + ESM output via tsup, zero runtime dependencies
- TypeScript 5.x, strict mode, full type exports
