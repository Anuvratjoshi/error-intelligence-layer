# Configuration

## Global defaults

Set once at app startup:

```ts
import { configure } from "error-intelligence-layer";

configure({
  defaultFormat: "json",
  includeEnv: true,
  sensitiveKeys: ["password", "token", "secret", "apiKey"],
  maxMetadataSize: 2048, // bytes per metadata value
  maxCauseDepth: 10, // max .cause chain depth
  enablePlugins: true,
});
```

## Configuration options

| Option            | Type         | Default                         | Description                          |
| ----------------- | ------------ | ------------------------------- | ------------------------------------ |
| `defaultFormat`   | `FormatType` | `"json"`                        | Default output format                |
| `includeEnv`      | `boolean`    | `true`                          | Attach `process.*` info              |
| `sensitiveKeys`   | `string[]`   | `["password","token","secret"]` | Keys to redact from metadata/request |
| `maxMetadataSize` | `number`     | `2048`                          | Max bytes per metadata value         |
| `maxCauseDepth`   | `number`     | `10`                            | Max depth of `.cause` traversal      |
| `enablePlugins`   | `boolean`    | `true`                          | Toggle plugin execution              |

## Per-call overrides

Options passed to `analyzeError(error, options)` always override global defaults for that call.

## Resetting to defaults

```ts
import { resetConfig } from "error-intelligence-layer";

resetConfig(); // useful in tests
```
