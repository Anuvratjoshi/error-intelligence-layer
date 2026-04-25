# Edge Cases

This library is hardened against every unusual input. Below are the known edge cases and how each is handled.

---

## Throwing a non-Error value

```ts
throw "string error"; // string
throw 123; // number
throw null; // null
throw undefined; // undefined
throw { foo: "bar" }; // plain object
throw true; // boolean
```

**Handling:** The normalization layer coerces all of these to a `NormalizedError` with an appropriate `message` and `type: "UnknownError"`. No crash.

---

## Circular objects

```ts
const obj: any = {};
obj.self = obj;
throw obj;
```

**Handling:** `safeStringify()` in `src/utils/` detects circular references and replaces them with the string `"[Circular]"`. `JSON.stringify` is never called directly on user input.

---

## Empty or missing stack

Some environments (e.g. QuickJS, some edge runtimes) do not populate `Error.stack`.

**Handling:** The parsing layer returns `[]` for an empty/missing stack. All stack-dependent fields gracefully fall back to `null`.

---

## Minified stacks

Bundled code may produce stacks like:

```
at a (bundle.min.js:1:12345)
```

**Handling:** Frames are still parsed normally. `isMinified: true` is set on frames where column > 500 (heuristic). Source map support is a planned future feature.

---

## Async errors with lost stack

`Promise.reject(new Error("x"))` can lose its original creation stack in some Node.js versions.

**Handling:** The library captures what is available. When `--async-stack-traces` is enabled (Node 12+), full async stacks are parsed automatically.

---

## Nested/chained causes

```ts
const root = new Error("DB timeout");
const mid = new Error("Query failed", { cause: root });
const top = new Error("Request failed", { cause: mid });
```

**Handling:** The extraction layer recursively traverses `.cause` with a **visited set** (cycle detection). Returns `rootCause = root` and `causeChain = [mid, root]`.

---

## Axios errors

```ts
axios.get("/api").catch((err) => {
  // err.isAxiosError === true
  // err.response, err.request, err.config
});
```

**Handling:** The normalization layer detects `isAxiosError` and maps:

- `err.response.status` → `metadata.httpStatus`
- `err.response.data` → `metadata.responseBody` (truncated to 500 chars)
- `err.config.url` → `metadata.requestUrl`

---

## Large objects in metadata

Passing a 10 MB object as metadata would bloat the output.

**Handling:** Metadata values are serialized via `safeStringify()` and truncated at **2 KB per value**.

---

## Sensitive data

**Handling:** The enrichment layer's request module strips the following before attaching request context:

- `authorization` header
- `cookie` header
- `x-api-key` header
- `x-auth-token` header
- `password`, `token`, `secret` keys in body/params (recursive)

---

## Framework-wrapped errors

Express `next(err)` and Fastify `reply.send(err)` sometimes wrap errors in their own objects.

**Handling:** Normalization checks for `.originalError`, `.cause`, and `.inner` properties and unwraps one level before processing.
