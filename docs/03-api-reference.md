# API Reference

## `analyzeError(error, options?)`

The main entry point. Runs the full pipeline and returns an `AnalyzedError`.

```ts
function analyzeError(error: unknown, options?: AnalyzeOptions): AnalyzedError;
```

### Parameters

| Name                 | Type                              | Description                                |
| -------------------- | --------------------------------- | ------------------------------------------ |
| `error`              | `unknown`                         | Any thrown value                           |
| `options.request`    | `RequestContext \| undefined`     | Attach HTTP request metadata               |
| `options.format`     | `"json" \| "pretty" \| "compact"` | Output format (default: `"json"`)          |
| `options.includeEnv` | `boolean`                         | Include process/env info (default: `true`) |

### Returns: `AnalyzedError`

See [Types](./04-types.md) for the full shape.

---

## `createError(message, options?)`

Factory for creating structured custom errors.

```ts
function createError(
  message: string,
  options?: CreateErrorOptions,
): IntelligentError;
```

### Parameters

| Name               | Type                      | Description                                                           |
| ------------------ | ------------------------- | --------------------------------------------------------------------- |
| `message`          | `string`                  | Human-readable error message                                          |
| `options.cause`    | `unknown`                 | The original error that caused this one                               |
| `options.metadata` | `Record<string, unknown>` | Arbitrary key-value metadata                                          |
| `options.severity` | `Severity`                | Override severity (`"low"` \| `"medium"` \| `"high"` \| `"critical"`) |
| `options.code`     | `string`                  | Machine-readable error code (e.g. `"DB_CONNECTION_FAILED"`)           |

### Example

```ts
throw createError("User not found", {
  code: "USER_NOT_FOUND",
  severity: "high",
  metadata: { userId: 42 },
});
```

---

## `wrapAsync(fn)`

Wraps an async function so it never throws. Returns `[error, result]` tuple.

```ts
function wrapAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
): WrappedAsyncFn<T>;
```

### Example

```ts
const safeQuery = wrapAsync(db.findUser);
const [err, user] = await safeQuery(userId);
if (err) {
  /* err is AnalyzedError */
}
```

---

## `withErrorBoundary(fn)`

Higher-order wrapper for sync **and** async functions. On error, calls the optional `onError` handler instead of throwing.

```ts
function withErrorBoundary<T extends (...args: any[]) => any>(
  fn: T,
  onError?: (error: AnalyzedError) => void,
): T;
```

---

## `registerPlugin(plugin)`

Registers a plugin that hooks into the analysis stage.

```ts
function registerPlugin(plugin: Plugin): void;
```

See [Plugin System](./06-plugins.md) for full details.

---

## `formatError(error, formatType)`

Formats an already-analyzed error for output.

```ts
function formatError(
  error: AnalyzedError,
  formatType: "json" | "pretty" | "compact",
): string;
```

### Format types

| Type      | Description                                              |
| --------- | -------------------------------------------------------- |
| `json`    | Minified JSON string                                     |
| `pretty`  | Human-readable, colour-coded CLI output                  |
| `compact` | Single-line summary: `[SyntaxError] message (file:line)` |

---

## `getErrorFingerprint(error)`

Generates a stable hash for error deduplication / grouping.

```ts
function getErrorFingerprint(error: unknown): string;
```

The hash is derived from: `type + message + first stack frame`. The same logical error always produces the same fingerprint regardless of when it occurs.
