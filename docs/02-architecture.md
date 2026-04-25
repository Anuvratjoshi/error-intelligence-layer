# Architecture

## Pipeline

Every call to `analyzeError()` passes the input through an ordered pipeline of pure, stateless layers:

```
Input (unknown)
 │
 ▼
┌──────────────────┐
│  1. Normalize    │  Coerce any value → NormalizedError
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  2. Parse        │  Split raw stack string → StackFrame[]
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  3. Extract      │  Walk .cause chain → root cause + cause chain
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  4. Enrich       │  Attach env info, request context, fingerprint
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  5. Analyze      │  Severity scoring, suggestions, pattern matching
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  6. Format       │  Serialize to JSON / pretty / compact
└────────┬─────────┘
         │
         ▼
      AnalyzedError (output)
```

Each layer is a **pure function**: `(input, context) → output`. No side effects.

---

## Folder Structure

```
src/
├── index.ts                  ← public API exports
│
├── core/
│   ├── analyzer.ts           ← orchestrates the full pipeline
│   ├── pipeline.ts           ← pipeline runner / compose utility
│   ├── config.ts             ← global configuration store
│   └── registry.ts           ← plugin registry
│
├── layers/
│   ├── normalization/        ← Phase 3
│   ├── parsing/              ← Phase 4
│   ├── extraction/           ← Phase 5
│   ├── enrichment/           ← Phase 6
│   ├── intelligence/         ← Phase 7
│   └── formatting/           ← Phase 8
│
├── types/                    ← all shared TS interfaces & enums
├── constants/                ← magic strings, regex patterns, defaults
├── utils/                    ← safe-stringify, hash, etc.
├── plugins/                  ← built-in + user plugins
└── adapters/                 ← Express / Fastify / Next.js
```

---

## Design Principles

| Principle      | How we apply it                                  |
| -------------- | ------------------------------------------------ |
| **Functional** | Every layer is a pure function                   |
| **Immutable**  | Layers return new objects; nothing mutates input |
| **Type-safe**  | Strict TypeScript, no `any` in library code      |
| **Modular**    | Layers can be used independently                 |
| **Extensible** | Plugin hooks at the analysis stage               |
| **Fast**       | < 1 ms per error, lazy evaluation, no heavy deps |
