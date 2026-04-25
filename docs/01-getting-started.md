# Getting Started

## Installation

```bash
npm install error-intelligence-layer
# or
pnpm add error-intelligence-layer
# or
yarn add error-intelligence-layer
```

**Requirements:** Node.js >= 18

---

## Basic Usage

```ts
import { analyzeError } from "error-intelligence-layer";

try {
  JSON.parse("not json");
} catch (error) {
  const result = analyzeError(error);
  console.log(result);
}
```

### Sample Output

```json
{
  "type": "SyntaxError",
  "message": "Unexpected token 'o', \"not json\" is not valid JSON",
  "severity": "critical",
  "fingerprint": "a3f92c...",
  "stack": [{ "file": "app.ts", "line": 5, "column": 3, "fn": "<anonymous>" }],
  "rootCause": null,
  "suggestions": [
    "Validate JSON input before calling JSON.parse()",
    "Use a try/catch or a safe parse utility"
  ],
  "environment": {
    "nodeVersion": "v20.11.0",
    "platform": "darwin",
    "pid": 12345
  },
  "timestamp": "2026-04-25T10:00:00.000Z"
}
```

---

## Quick-start recipes

### Wrap an async function

```ts
import { wrapAsync } from "error-intelligence-layer";

const safeRead = wrapAsync(async (path: string) => {
  return await fs.readFile(path, "utf-8");
});

const [error, result] = await safeRead("./data.json");
if (error) console.log(error.suggestions);
```

### Express middleware

```ts
import { expressErrorHandler } from "error-intelligence-layer/adapters";

app.use(expressErrorHandler());
```
