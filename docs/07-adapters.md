# Adapters

Framework adapters wrap `analyzeError()` in idiomatic middleware/handler patterns.

---

## Express

```ts
import express from "express";
import { expressErrorHandler } from "error-intelligence-layer/adapters";

const app = express();

// ... routes ...

// Must be registered LAST, after all routes
app.use(
  expressErrorHandler({
    format: "pretty", // default: "json"
    includeEnv: true,
    onError(analyzed, req, res) {
      // optional custom side-effect (e.g. log to external service)
      myLogger.error(analyzed);
    },
  }),
);
```

The middleware:

1. Calls `analyzeError(err, { request: extractRequest(req) })`
2. Sets `res.status(500)` (or uses `err.status` / `err.statusCode` if present)
3. Sends the formatted error as the response body

---

## Fastify

```ts
import Fastify from "fastify";
import { fastifyErrorPlugin } from "error-intelligence-layer/adapters";

const app = Fastify();

await app.register(fastifyErrorPlugin, {
  format: "json",
  includeEnv: false,
});
```

The plugin registers a global `setErrorHandler` that calls `analyzeError()` and sends the result.

---

## Next.js (API Routes)

### App Router (route handlers)

```ts
// app/api/data/route.ts
import { withNextErrorHandler } from "error-intelligence-layer/adapters";
import { NextRequest } from "next/server";

export const GET = withNextErrorHandler(async (req: NextRequest) => {
  // handler logic
});
```

### Pages Router

```ts
// pages/api/data.ts
import { withNextApiErrorHandler } from "error-intelligence-layer/adapters";

export default withNextApiErrorHandler(async (req, res) => {
  // handler logic
});
```

---

## Standalone (no framework)

```ts
import { analyzeError } from "error-intelligence-layer";

process.on("uncaughtException", (err) => {
  const analyzed = analyzeError(err);
  console.error(analyzed);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const analyzed = analyzeError(reason);
  console.error(analyzed);
});
```
