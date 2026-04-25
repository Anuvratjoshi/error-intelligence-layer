# Types

All types are exported from the package root.

```ts
import type {
  AnalyzedError,
  StackFrame,
  Severity,
  Plugin,
  AnalyzeOptions,
  CreateErrorOptions,
  RequestContext,
  EnvironmentInfo,
  FormatType,
} from "error-intelligence-layer";
```

---

## `AnalyzedError`

The central output type returned by `analyzeError()`.

```ts
interface AnalyzedError {
  /** Original error constructor name, e.g. "TypeError" */
  type: string;

  /** Normalized error message */
  message: string;

  /** Parsed stack frames */
  stack: StackFrame[];

  /** Raw stack string */
  rawStack: string | null;

  /** Inferred severity */
  severity: Severity;

  /** Stable deduplication hash */
  fingerprint: string;

  /** Deepest root cause (null if none found) */
  rootCause: AnalyzedError | null;

  /** Full chain of .cause references */
  causeChain: AnalyzedError[];

  /** Human-readable fix suggestions */
  suggestions: string[];

  /** Runtime environment snapshot */
  environment: EnvironmentInfo | null;

  /** Attached HTTP request context */
  request: RequestContext | null;

  /** ISO timestamp when analyzeError() was called */
  timestamp: string;

  /** Arbitrary metadata (from createError or plugins) */
  metadata: Record<string, unknown>;

  /** Data contributed by plugins */
  pluginData: Record<string, unknown>;
}
```

---

## `StackFrame`

A single parsed frame from the stack trace.

```ts
interface StackFrame {
  /** Source file path or URL */
  file: string | null;
  /** 1-based line number */
  line: number | null;
  /** 1-based column number */
  column: number | null;
  /** Function or method name */
  fn: string | null;
  /** True if inside node_modules */
  isNative: boolean;
  /** True if the frame is from a third-party module */
  isThirdParty: boolean;
}
```

---

## `Severity`

```ts
type Severity = "low" | "medium" | "high" | "critical";
```

Default mapping:

| Error type        | Severity   |
| ----------------- | ---------- |
| `SyntaxError`     | `critical` |
| `ReferenceError`  | `critical` |
| `TypeError`       | `high`     |
| `RangeError`      | `high`     |
| `URIError`        | `medium`   |
| `EvalError`       | `medium`   |
| `Error` (generic) | `medium`   |
| Custom / unknown  | `low`      |

---

## `Plugin`

```ts
interface Plugin {
  /** Unique plugin name */
  name: string;
  /** Called after the intelligence layer; return partial AnalyzedError overrides */
  onAnalyze(
    error: AnalyzedError,
    context: PluginContext,
  ): Partial<AnalyzedError>;
}

interface PluginContext {
  originalError: unknown;
  options: AnalyzeOptions;
}
```

---

## `EnvironmentInfo`

```ts
interface EnvironmentInfo {
  nodeVersion: string;
  platform: NodeJS.Platform;
  pid: number;
  memory: NodeJS.MemoryUsage;
  uptime: number;
}
```

---

## `RequestContext`

```ts
interface RequestContext {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  body?: unknown;
}
```

---

## `FormatType`

```ts
type FormatType = "json" | "pretty" | "compact";
```

---

## `CreateErrorOptions`

```ts
interface CreateErrorOptions {
  cause?: unknown;
  metadata?: Record<string, unknown>;
  severity?: Severity;
  code?: string;
}
```

---

## `AnalyzeOptions`

```ts
interface AnalyzeOptions {
  request?: RequestContext;
  format?: FormatType;
  includeEnv?: boolean;
}
```
