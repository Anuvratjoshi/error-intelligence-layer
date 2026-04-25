# Layers

Each layer is a pure function: `(input, context?) → output`. They can also be used independently.

---

## 1. Normalization (`src/layers/normalization/`)

**Input:** `unknown`  
**Output:** `NormalizedError`

Handles every possible thrown value:

| Input type           | Behavior                                              |
| -------------------- | ----------------------------------------------------- |
| `Error` instance     | Passes through with all properties                    |
| `string`             | Wrapped in a synthetic Error                          |
| `number` / `boolean` | Converted to string message                           |
| `null` / `undefined` | Message: `"Unknown error (null/undefined thrown)"`    |
| Plain object         | Message extracted from `.message` or stringified      |
| Axios error          | `.response`, `.request`, `.config` mapped to metadata |
| Error with `.code`   | Code preserved in metadata                            |

### Standalone usage

```ts
import { normalizeError } from "error-intelligence-layer/layers/normalization";

const normalized = normalizeError("oops");
// { type: "Error", message: "oops", originalError: "oops", ... }
```

---

## 2. Stack Parsing (`src/layers/parsing/`)

**Input:** `NormalizedError`  
**Output:** `StackFrame[]`

Parses the V8 / Node.js stack string into structured frames.

Handles:

- Standard V8 stack format
- Anonymous functions
- Native frames (`at Array.map (native)`)
- TypeScript transpiled stacks (preserves source positions)
- Missing/empty stacks (returns `[]`)
- Minified stacks (marked with `isMinified: true`)

### Frame extraction regex

The parser targets both forms:

```
at functionName (file.ts:10:5)
at file.ts:10:5
```

---

## 3. Extraction (`src/layers/extraction/`)

**Input:** `NormalizedError`  
**Output:** `{ rootCause, causeChain }`

Traverses the `error.cause` chain recursively (with cycle detection) to find the deepest original cause.

- Handles `{ cause: Error }` (ES2022 native)
- Handles wrapped errors (Axios, database drivers)
- Guards against circular cause references
- Returns the full chain, not just the leaf

---

## 4. Enrichment (`src/layers/enrichment/`)

**Input:** `NormalizedError + ParsedStack + Extraction`  
**Output:** adds `environment`, `request`, `fingerprint`, `timestamp`

Sub-modules:

| Module           | Responsibility                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `environment.ts` | `process.version`, `platform`, `pid`, `memoryUsage()`, `uptime()`     |
| `fingerprint.ts` | Stable hash from `type + message + stack[0]`                          |
| `request.ts`     | Attaches user-supplied `RequestContext` (sanitizes sensitive headers) |
| `timestamp.ts`   | ISO 8601 timestamp                                                    |

### Security note

The request enricher **strips** the following headers before attaching them to the output:

- `authorization`
- `cookie`
- `x-api-key`
- `x-auth-token`

---

## 5. Intelligence (`src/layers/intelligence/`)

**Input:** enriched error object  
**Output:** adds `severity`, `suggestions`

### Severity scoring

Rules applied in order (first match wins):

```
SyntaxError           → critical
ReferenceError        → critical
TypeError             → high
RangeError            → high
URIError / EvalError  → medium
generic Error         → medium
unknown               → low
```

Plugins can override severity via `onAnalyze`.

### Suggestion engine

Pattern-based matching against the error message:

| Pattern                | Suggestion                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `/undefined/`          | "Check for null/undefined before accessing properties. Consider optional chaining (?.)." |
| `/not a function/`     | "Verify the value is callable before invoking it."                                       |
| `/cannot read prop/i`  | "Use optional chaining (?.) or a null check."                                            |
| `/unexpected token/i`  | "Validate JSON/syntax input before parsing."                                             |
| `/econnrefused/i`      | "Check that the target service is running and reachable."                                |
| `/etimedout/i`         | "The operation timed out. Check network connectivity or increase timeout."               |
| `/enoent/i`            | "File or directory not found. Verify the path exists."                                   |
| `/permission denied/i` | "Check file/resource permissions."                                                       |

---

## 6. Formatting (`src/layers/formatting/`)

**Input:** `AnalyzedError`  
**Output:** `string`

| Format    | Description                                                 |
| --------- | ----------------------------------------------------------- |
| `json`    | `JSON.stringify(analyzedError)` with safe circular handling |
| `pretty`  | Multi-line, indented, ANSI-coloured output for terminals    |
| `compact` | `[TypeError] message — app.ts:42`                           |
