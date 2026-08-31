# Configuration

## Global defaults

Set once at app startup:

```ts
import { configure } from "error-intelligence-layer";

configure({
  defaultFormat: "json",
  includeEnv: true,
  sensitiveKeys: ["password", "token", "secret", "apiKey"],
  maxMetadataValueSize: 2048, // bytes per metadata value
  maxCauseDepth: 10, // max .cause chain depth
  enablePlugins: true,
  enableAISuggestions: false,
  aiBaseUrl: "https://api.groq.com/openai/v1",
  aiModel: "openai/gpt-oss-120b",
  enableAIFix: true,
});
```

## Configuration options

| Option                   | Type         | Default                         | Description                                  |
| ------------------------ | ------------ | ------------------------------- | -------------------------------------------- |
| `defaultFormat`          | `FormatType` | `"json"`                        | Default output format                        |
| `includeEnv`             | `boolean`    | `true`                          | Attach `process.*` info                      |
| `sensitiveKeys`          | `string[]`   | `["password","token","secret"]` | Keys to redact from metadata/request         |
| `maxMetadataValueSize`   | `number`     | `2048`                          | Max bytes per metadata value                 |
| `maxCauseDepth`          | `number`     | `10`                            | Max depth of `.cause` traversal              |
| `enablePlugins`          | `boolean`    | `true`                          | Toggle plugin execution                      |
| `enableAISuggestions`    | `boolean`    | `false`                         | Toggle optional AI suggestions               |
| `aiApiKey`               | `string`     | `undefined`                     | API key for the configured AI provider       |
| `aiBaseUrl`              | `string`     | `"https://api.groq.com/openai/v1"` | OpenAI-compatible provider base URL       |
| `aiModel`                | `string`     | `"openai/gpt-oss-120b"`         | Model sent to the provider                   |
| `enableAIFix`            | `boolean`    | `true`                          | Toggle development-only AI fix plans         |

The default AI provider remains Groq so the existing `GROQ_API_KEY` setup continues to work. The default model is `openai/gpt-oss-120b`, Groq's recommended replacement for the discontinued Llama 70B free/developer-tier model.

## Per-call overrides

Options passed to `analyzeError(error, options)` always override global defaults for that call.

## Resetting to defaults

```ts
import { resetConfig } from "error-intelligence-layer";

resetConfig(); // useful in tests
```
