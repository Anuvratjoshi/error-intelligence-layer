/**
 * smoke-test.mjs
 *
 * Real-world smoke test for error-intelligence-layer.
 * Imports directly from the compiled dist — no extra dependencies.
 *
 * Run:  node scripts/smoke-test.mjs
 */

import {
  analyzeError,
  createError,
  wrapAsync,
  withErrorBoundary,
  formatError,
  getErrorFingerprint,
  configure,
  registerPlugin,
  useBuiltInPlugins,
  resetConfig,
} from "../dist/index.js";

import { readFile } from "fs/promises";

// ─── helpers ─────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

let passed = 0;
let failed = 0;

function header(title) {
  console.log(`\n${BOLD}${CYAN}${"─".repeat(60)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
  console.log(`${CYAN}${"─".repeat(60)}${RESET}\n`);
}

function result(label, analyzed) {
  const sev = analyzed.severity;
  const colour =
    sev === "critical"
      ? RED
      : sev === "high"
        ? YELLOW
        : sev === "medium"
          ? "\x1b[33m"
          : GREEN;

  console.log(`${BOLD}${label}${RESET}`);
  console.log(`  type        : ${analyzed.type}`);
  console.log(`  message     : ${analyzed.message.slice(0, 80)}`);
  console.log(`  severity    : ${colour}${sev.toUpperCase()}${RESET}`);
  console.log(`  fingerprint : ${DIM}${analyzed.fingerprint}${RESET}`);
  console.log(`  code        : ${analyzed.code ?? "(none)"}`);
  console.log(`  suggestions :`);
  analyzed.suggestions
    .slice(0, 2)
    .forEach((s) => console.log(`    ${DIM}• ${s.slice(0, 90)}${RESET}`));
  if (analyzed.rootCause) {
    console.log(
      `  rootCause   : ${analyzed.rootCause.type} — ${analyzed.rootCause.message.slice(0, 60)}`,
    );
  }
  if (analyzed.causeChain.length > 0) {
    console.log(`  causeChain  : ${analyzed.causeChain.length} level(s)`);
  }
  if (analyzed.request) {
    console.log(
      `  request     : ${analyzed.request.method} ${analyzed.request.url}`,
    );
  }
  if (analyzed.pluginData && Object.keys(analyzed.pluginData).length > 0) {
    console.log(
      `  pluginData  :`,
      JSON.stringify(analyzed.pluginData, null, 2)
        .split("\n")
        .join("\n              "),
    );
  }
  console.log();
  passed++;
}

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed++;
  } else {
    console.log(`  ${RED}✗${RESET} ${label} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

// ─── setup ───────────────────────────────────────────────────────────────────

configure({ defaultFormat: "json", includeEnv: true });
useBuiltInPlugins(registerPlugin);

console.log(`\n${BOLD}error-intelligence-layer — smoke test${RESET}`);
console.log(
  `${DIM}Node ${process.version} · ${new Date().toISOString()}${RESET}`,
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Native JS errors
// ─────────────────────────────────────────────────────────────────────────────
header("1 · Native JS errors");

const typeErr = analyzeError(
  new TypeError("Cannot read properties of undefined (reading 'id')"),
);
result("TypeError", typeErr);
check("severity is high", typeErr.severity === "high");
check("has suggestion", typeErr.suggestions.length > 0);
check("has fingerprint", /^[0-9a-f]{8}$/.test(typeErr.fingerprint));
check("stack is array", Array.isArray(typeErr.stack));
check("has timestamp", typeof typeErr.timestamp === "string");
check("environment captured", typeErr.environment !== null);

const refErr = analyzeError(new ReferenceError("myVar is not defined"));
result("ReferenceError", refErr);
check("severity is critical", refErr.severity === "critical");

const synErr = analyzeError(new SyntaxError("Unexpected token '<'"));
result("SyntaxError", synErr);
check("severity is critical", synErr.severity === "critical");

const ranErr = analyzeError(new RangeError("Maximum call stack size exceeded"));
result("RangeError (stack overflow message)", ranErr);
check(
  "severity is high or critical",
  ["high", "critical"].includes(ranErr.severity),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Primitive throws
// ─────────────────────────────────────────────────────────────────────────────
header("2 · Primitive throws (strings, numbers, null, undefined)");

const strErr = analyzeError("something went wrong");
result("String throw", strErr);
check("type is StringError", strErr.type === "StringError");

const numErr = analyzeError(42);
result("Number throw", numErr);
check("type is NumberError", numErr.type === "NumberError");

const nullErr = analyzeError(null);
result("null throw", nullErr);
check("type is NullError", nullErr.type === "NullError");

const undefErr = analyzeError(undefined);
result("undefined throw", undefErr);
check("type is UndefinedError", undefErr.type === "UndefinedError");

const objErr = analyzeError({
  message: "plain object thrown",
  code: "CUSTOM_CODE",
});
result("Plain object throw", objErr);
check("message extracted", objErr.message === "plain object thrown");
check("code extracted", objErr.code === "CUSTOM_CODE");

// ─────────────────────────────────────────────────────────────────────────────
// 3. Node.js system errors
// ─────────────────────────────────────────────────────────────────────────────
header("3 · Node.js system errors (real ENOENT from readFile)");

const [fsErr] = await wrapAsync(readFile)("/this/path/does/not/exist.json");
if (fsErr) {
  result("ENOENT from readFile()", fsErr);
  check("code is ENOENT", fsErr.code === "ENOENT");
  check(
    "has ENOENT suggestion",
    fsErr.suggestions.some((s) => /not found|path/i.test(s)),
  );
  check(
    "node-system plugin fired",
    fsErr.pluginData["node-system"] !== undefined,
  );
  check("grouping plugin fired", fsErr.pluginData["grouping"] !== undefined);
  console.log(
    `  grouping category : ${fsErr.pluginData["grouping"]?.category}`,
  );
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Real network requests to a public API with intentional bad requests
// ─────────────────────────────────────────────────────────────────────────────
header("4 · Real HTTP — JSONPlaceholder API (intentionally bad requests)");

// 4a. Non-existent resource → 404
console.log(
  `${DIM}Hitting https://jsonplaceholder.typicode.com/posts/9999999 (404)…${RESET}`,
);
const safeGet = wrapAsync(async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = createError(`HTTP ${res.status} ${res.statusText}`, {
      severity: res.status >= 500 ? "high" : "medium",
      code: `HTTP_${res.status}`,
      metadata: {
        httpStatus: res.status,
        httpStatusText: res.statusText,
        requestUrl: url,
        requestMethod: "GET",
      },
    });
    throw err;
  }
  return res.json();
});

const [err404, data404] = await safeGet(
  "https://jsonplaceholder.typicode.com/posts/9999999",
);
if (err404) {
  result("404 Not Found (crafted via createError)", err404);
  check("code is HTTP_404", err404.code === "HTTP_404");
  check("httpStatus in metadata", err404.metadata["httpStatus"] === 404);
  check("severity is medium", err404.severity === "medium");
  check(
    "http-status plugin fired",
    err404.pluginData["http-status"] !== undefined,
  );
  console.log(
    `  plugin category   : ${err404.pluginData["http-status"]?.category}\n`,
  );
}

// 4b. Valid 200 request — should succeed (no error)
console.log(
  `${DIM}Hitting https://jsonplaceholder.typicode.com/posts/1 (200)…${RESET}`,
);
const [errOk, post] = await safeGet(
  "https://jsonplaceholder.typicode.com/posts/1",
);
check("200 OK returns null error", errOk === null);
check(
  "200 OK returns post data",
  post !== undefined && typeof post.id === "number",
);
console.log(
  `  post.title : ${DIM}${String(post?.title).slice(0, 60)}${RESET}\n`,
);

// 4c. Intentionally malformed JSON via httpbin
console.log(
  `${DIM}Hitting https://httpbin.org/status/500 (500 Server Error)…${RESET}`,
);
const [err500] = await safeGet("https://httpbin.org/status/500");
if (err500) {
  result("500 Internal Server Error (httpbin.org)", err500);
  check("code is HTTP_500", err500.code === "HTTP_500");
  check("severity is high", err500.severity === "high");
  check(
    "http-status plugin fired",
    err500.pluginData["http-status"] !== undefined,
  );
  check(
    "server error suggestion",
    err500.suggestions.some((s) => /server/i.test(s)),
  );
  console.log(
    `  plugin category   : ${err500.pluginData["http-status"]?.category}\n`,
  );
} else {
  console.log(`  ${YELLOW}httpbin.org unreachable — skipped${RESET}\n`);
}

// 4d. Non-existent domain → DNS failure
console.log(
  `${DIM}Hitting https://this-domain-absolutely-does-not-exist-eil-test.xyz (DNS failure)…${RESET}`,
);
const [dnsErr] = await wrapAsync(async () => {
  const res = await fetch(
    "https://this-domain-absolutely-does-not-exist-eil-test.xyz",
  );
  return res.json();
})();
if (dnsErr) {
  result("DNS resolution failure", dnsErr);
  check(
    "has network suggestion",
    dnsErr.suggestions.some((s) => /dns|network|connect|fetch|url/i.test(s)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. JSON.parse failures
// ─────────────────────────────────────────────────────────────────────────────
header("5 · JSON parse error");

const [jsonErr] = await wrapAsync(async () => {
  return JSON.parse("{ bad json !! }");
})();
if (jsonErr) {
  result("JSON.parse bad input", jsonErr);
  check("type is SyntaxError", jsonErr.type === "SyntaxError");
  check("severity is critical", jsonErr.severity === "critical");
  check(
    "JSON suggestion present",
    jsonErr.suggestions.some((s) => /json/i.test(s)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. cause chain — wrapped errors
// ─────────────────────────────────────────────────────────────────────────────
header("6 · Cause chain traversal");

const rootCause = new ReferenceError("myToken is not defined");
const midCause = new TypeError("Cannot process auth token", {
  cause: rootCause,
});
const topError = createError("Request authentication failed", {
  cause: midCause,
  severity: "high",
  code: "AUTH_FAILED",
  metadata: { userId: "usr_42", endpoint: "/api/admin" },
});

const chainErr = analyzeError(topError);
result("3-level cause chain", chainErr);
check("causeChain has 2 entries", chainErr.causeChain.length === 2);
check(
  "rootCause is ReferenceError",
  chainErr.rootCause?.type === "ReferenceError",
);
check("code preserved", chainErr.code === "AUTH_FAILED");
check("userId in metadata", chainErr.metadata["userId"] === "usr_42");
check("severity escalated to critical", chainErr.severity === "critical");

// ─────────────────────────────────────────────────────────────────────────────
// 7. Sensitive data redaction
// ─────────────────────────────────────────────────────────────────────────────
header("7 · Sensitive data auto-redaction");

const redactErr = analyzeError(new Error("Unauthorized"), {
  request: {
    method: "POST",
    url: "/api/login",
    headers: {
      authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      cookie: "session=abc123; _csrf=xyz",
      "x-api-key": "sk-prod-secret-key-12345",
      "content-type": "application/json",
    },
    body: { username: "alice", password: "super-secret-password" },
  },
});

result("Error with sensitive headers + body", redactErr);
const h = redactErr.request?.headers ?? {};
check("Authorization redacted", h["authorization"] === "[REDACTED]");
check("Cookie redacted", h["cookie"] === "[REDACTED]");
check("x-api-key redacted", h["x-api-key"] === "[REDACTED]");
check("content-type preserved", h["content-type"] === "application/json");
const body = redactErr.request?.body;
check(
  "password in body redacted",
  body && typeof body === "object" && body["password"] === "[REDACTED]",
);
check(
  "username in body preserved",
  body && typeof body === "object" && body["username"] === "alice",
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. withErrorBoundary
// ─────────────────────────────────────────────────────────────────────────────
header("8 · withErrorBoundary");

let capturedByBoundary = null;

const riskyOperation = withErrorBoundary(
  async (input) => {
    if (!input) throw new RangeError("Input must not be empty");
    return input.toUpperCase();
  },
  (err) => {
    capturedByBoundary = err;
  },
);

const okResult = await riskyOperation("hello");
check("returns result when no error", okResult === "HELLO");

await riskyOperation(null);
check("calls onError when throws", capturedByBoundary !== null);
check(
  "captured error is RangeError",
  capturedByBoundary?.type === "RangeError",
);
check("severity is high", capturedByBoundary?.severity === "high");
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// 9. getErrorFingerprint stability
// ─────────────────────────────────────────────────────────────────────────────
header("9 · Fingerprint stability");

const fp1 = getErrorFingerprint("the same error message");
const fp2 = getErrorFingerprint("the same error message");
const fp3 = getErrorFingerprint("a different message entirely");

check("same input → same fingerprint", fp1 === fp2, `${fp1} vs ${fp2}`);
check(
  "different input → different fingerprint",
  fp1 !== fp3,
  `${fp1} vs ${fp3}`,
);
check("fingerprint is 8-char hex", /^[0-9a-f]{8}$/.test(fp1), fp1);
console.log(`  fp("same error message") = ${DIM}${fp1}${RESET}`);
console.log(`  fp("different message")  = ${DIM}${fp3}${RESET}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 10. Output format showcase
// ─────────────────────────────────────────────────────────────────────────────
header("10 · Output format showcase");

const showcaseErr = analyzeError(
  createError("Database connection timed out", {
    severity: "critical",
    code: "DB_TIMEOUT",
    metadata: { host: "db.internal", port: 5432, retries: 3 },
  }),
);

console.log(`${BOLD}compact:${RESET}`);
console.log(" ", formatError(showcaseErr, "compact"), "\n");

console.log(`${BOLD}pretty:${RESET}`);
const pretty = formatError(showcaseErr, "pretty");
pretty.split("\n").forEach((line) => console.log(" ", line));
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`${BOLD}${"─".repeat(60)}${RESET}`);
console.log(
  `${BOLD}  Results: ${GREEN}${passed} passed${RESET}${BOLD}${failed > 0 ? ` · ${RED}${failed} failed${RESET}` : ""}${RESET}`,
);
console.log(`${"─".repeat(60)}\n`);

if (failed > 0) process.exit(1);
