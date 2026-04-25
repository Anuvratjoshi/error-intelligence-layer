import type { EILConfig, Severity } from "../types/index.js";

// ─────────────────────────────────────────────
// Default global configuration
// ─────────────────────────────────────────────

export const DEFAULT_CONFIG: Readonly<EILConfig> = Object.freeze({
  defaultFormat: "json",
  includeEnv: true,
  sensitiveKeys: [
    "password",
    "passwd",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "apikey",
    "api_key",
    "authorization",
    "cookie",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
  ],
  maxMetadataValueSize: 2048,
  maxCauseDepth: 10,
  enablePlugins: true,
  enableAISuggestions: false,
  grokModel: "grok-3-mini",
});

// ─────────────────────────────────────────────
// Severity mapping
// ─────────────────────────────────────────────

/**
 * Maps well-known Error constructor names to a default severity.
 * The intelligence layer consults this before falling back to "medium".
 */
export const SEVERITY_MAP: Readonly<Record<string, Severity>> = Object.freeze({
  SyntaxError: "critical",
  ReferenceError: "critical",
  TypeError: "high",
  RangeError: "high",
  URIError: "medium",
  EvalError: "medium",
  Error: "medium",
  AggregateError: "high",
});

// ─────────────────────────────────────────────
// Stack frame parsing
// ─────────────────────────────────────────────

/**
 * Matches V8 / Node.js stack frames in two forms:
 *   at functionName (file.ts:10:5)
 *   at file.ts:10:5
 */
export const STACK_FRAME_RE =
  /^\s*at\s+(?:(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))\s*$/;

/**
 * Detects native frames (no file path, or file starts with "node:").
 */
export const NATIVE_FRAME_RE = /\(native\)|^node:/;

/**
 * Column threshold above which a frame is heuristically considered minified.
 */
export const MINIFIED_COLUMN_THRESHOLD = 500;

// ─────────────────────────────────────────────
// Suggestion patterns
// ─────────────────────────────────────────────

/**
 * Ordered list of `[regex, suggestion]` tuples.
 * The intelligence layer tests every pattern against the concatenated
 * error message + type + code string. All matches are collected (not just
 * the first), then deduplicated before being returned to the consumer.
 */
export const SUGGESTION_PATTERNS: ReadonlyArray<
  readonly [pattern: RegExp, suggestion: string]
> = Object.freeze([
  // ── Null / undefined access ───────────────────────────────────────────
  [
    /cannot\s+read\s+propert(?:y|ies)\s+of\s+(?:undefined|null)/i,
    "Use optional chaining (?.) or add a null/undefined guard before accessing the property.",
  ],
  [
    /undefined\s+is\s+not\s+an\s+object/i,
    "A property was accessed on undefined. Add a null/undefined check or use optional chaining (?.).",
  ],
  [
    /null\s+is\s+not\s+an\s+object/i,
    "A property was accessed on null. Guard with an if-check or use the nullish coalescing operator (??).",
  ],
  [
    /cannot\s+set\s+propert(?:y|ies)\s+of\s+(?:undefined|null)/i,
    "You are writing to a property on a null/undefined value. Ensure the object is initialised before assignment.",
  ],
  [
    /(?:value|variable|object)\s+is\s+(?:null|undefined|not\s+defined)/i,
    "Check that the value is initialised before use. Consider a default value or early-return guard.",
  ],

  // ── Type errors ───────────────────────────────────────────────────────
  [
    /is\s+not\s+a\s+function/i,
    "Verify the value is callable before invoking it — it may be undefined, null, or the wrong type.",
  ],
  [
    /is\s+not\s+a\s+constructor/i,
    "The value you are calling with 'new' is not a constructor. Check the import and make sure it exports a class.",
  ],
  [
    /cannot\s+convert\s+(?:undefined|null)\s+to\s+object/i,
    "Object.keys/values/entries was called on null or undefined. Add a guard: value ?? {}.",
  ],
  [
    /(?:expected|must\s+be)\s+(?:a\s+)?(?:string|number|boolean|object|array|function)/i,
    "A wrong type was passed. Check the expected type in the function signature or API documentation.",
  ],
  [
    /(?:invalid|illegal)\s+(?:argument|parameter|value|input)/i,
    "An invalid argument was passed. Review the function signature and validate inputs at the call site.",
  ],
  [
    /(?:type|instance)\s+(?:check|mismatch|error)/i,
    "There is a type mismatch. Use typeof or instanceof to validate the value before passing it.",
  ],
  [
    /converting\s+circular\s+structure\s+to\s+json/i,
    "The object has circular references and cannot be serialised with JSON.stringify. Use a safe serialiser or remove the cycle.",
  ],
  [
    /bigint.*mixed.*number|number.*mixed.*bigint/i,
    "BigInt and Number cannot be mixed in arithmetic. Convert one to match the other using BigInt() or Number().",
  ],

  // ── Reference / scope errors ──────────────────────────────────────────
  [
    /is\s+not\s+defined/i,
    "Check that the variable is declared and in scope. Look for typos or missing imports.",
  ],
  [
    /cannot\s+access\s+.+\s+before\s+initialization/i,
    "A 'let' or 'const' variable was accessed before its declaration (temporal dead zone). Move the declaration above the usage.",
  ],
  [
    /assignment\s+to\s+constant\s+variable/i,
    "You cannot reassign a 'const'. Use 'let' if the value needs to change.",
  ],
  [
    /identifier\s+.+\s+has\s+already\s+been\s+declared/i,
    "A variable with this name is already declared in the same scope. Rename one of them or remove the duplicate.",
  ],

  // ── Syntax / parse errors ─────────────────────────────────────────────
  [
    /unexpected\s+token|expected\s+property\s+name|invalid\s+json|json\s+at\s+position|in\s+json\s+at/i,
    "Validate the JSON or source input before parsing. Use a try/catch around JSON.parse().",
  ],
  [
    /JSON\.parse|json\.parse/i,
    "Wrap JSON.parse() in a try/catch and validate the input string is well-formed before parsing.",
  ],
  [
    /unexpected\s+end\s+of\s+(?:json|input|file|data)/i,
    "The input was truncated or empty. Check that the full response or file content was received before parsing.",
  ],
  [
    /unterminated\s+(?:string|template|comment|regex)/i,
    "There is an unclosed string or template literal. Check for missing closing quotes or backticks.",
  ],
  [
    /unexpected\s+(?:identifier|keyword|number|string|end\s+of\s+input)/i,
    "There is a syntax error in the source. Check for missing brackets, commas, or semicolons near the reported line.",
  ],

  // ── Network & HTTP ────────────────────────────────────────────────────
  [
    /econnrefused/i,
    "The target service refused the connection. Ensure it is running and the host/port are correct.",
  ],
  [
    /econnreset/i,
    "The connection was reset by the server. The service may have restarted — retry with exponential back-off.",
  ],
  [
    /etimedout|timed\s+out|connection\s+timed/i,
    "The operation timed out. Check network connectivity and consider increasing the timeout threshold.",
  ],
  [
    /enotfound|getaddrinfo|dns.*fail|could\s+not\s+resolve/i,
    "DNS resolution failed. Verify the hostname is correct and that network/DNS is reachable.",
  ],
  [
    /enetunreach|network\s+is\s+unreachable/i,
    "The network is unreachable. Check the host's network interface and routing configuration.",
  ],
  [
    /epipe|broken\s+pipe/i,
    "The reading end of the stream was closed before writing finished. Handle 'error' events on the stream and check the consumer.",
  ],
  [
    /network\s+error|fetch\s+failed|failed\s+to\s+fetch/i,
    "A network request failed. Check internet connectivity, CORS settings, and the target URL.",
  ],
  [
    /socket\s+hang\s+up|socket\s+closed/i,
    "The server closed the connection unexpectedly. Add retry logic and check server-side keep-alive settings.",
  ],
  [
    /cert|ssl|tls|certificate/i,
    "An SSL/TLS certificate error occurred. Check certificate validity, expiry, and trust chain. Use NODE_EXTRA_CA_CERTS for custom CAs.",
  ],
  [
    /cors|cross.origin/i,
    "A CORS policy blocked the request. Update the server's Access-Control-Allow-Origin header to permit the calling origin.",
  ],
  [
    /(?:http|https)\s+(?:proxy|tunnel)/i,
    "A proxy connection failed. Check your proxy configuration and that the proxy server is reachable.",
  ],

  // ── File system ───────────────────────────────────────────────────────
  [
    /enoent|no\s+such\s+file\s+or\s+directory/i,
    "File or directory not found. Verify the path exists, check for typos, and confirm the working directory.",
  ],
  [
    /eacces|permission\s+denied/i,
    "Insufficient permissions. Check file/directory ownership and permission bits (chmod/chown).",
  ],
  [
    /eperm|operation\s+not\s+permitted/i,
    "The OS rejected the operation. You may need elevated privileges or the file may be locked.",
  ],
  [
    /eexist|file\s+already\s+exists/i,
    "The file or directory already exists. Use a flag to overwrite, or check for existence before creating.",
  ],
  [
    /eisdir|illegal\s+operation\s+on\s+a\s+directory/i,
    "A file operation was attempted on a directory. Check the path and ensure you are targeting a file, not a folder.",
  ],
  [
    /enotdir/i,
    "A directory operation was attempted on a file. Verify the path resolves to a directory.",
  ],
  [
    /emfile|too\s+many\s+open\s+files/i,
    "The OS file descriptor limit has been reached. Increase ulimit -n or ensure streams and file handles are closed after use.",
  ],
  [
    /enospc|no\s+space\s+left/i,
    "The disk is full. Free up disk space or move the operation to a volume with more capacity.",
  ],
  [
    /erofs|read.only\s+file\s+system/i,
    "The file system is read-only. Check mount options or write to a different volume.",
  ],

  // ── Memory & performance ──────────────────────────────────────────────
  [
    /heap\s+out\s+of\s+memory|javascript\s+heap|out\s+of\s+memory|enomem/i,
    "Node.js ran out of heap memory. Increase --max-old-space-size, profile for memory leaks, and avoid large in-memory data.",
  ],
  [
    /maximum\s+call\s+stack|stack\s+overflow/i,
    "Stack overflow — infinite recursion detected. Add a base case or convert deep recursion to an iterative loop.",
  ],
  [
    /allocation\s+failed|failed\s+to\s+allocate/i,
    "Memory allocation failed. The process is running low on available memory. Reduce memory usage or increase system RAM.",
  ],

  // ── Module / import system ────────────────────────────────────────────
  [
    /cannot\s+find\s+module|module\s+not\s+found|err_module_not_found/i,
    "Module not found. Run 'npm install', check the import path for typos, and verify the package is listed in package.json.",
  ],
  [
    /err_require_esm|require\(\)\s+of\s+es\s+module/i,
    "You are require()-ing an ESM-only module. Use dynamic import() instead, or switch the project to ESM.",
  ],
  [
    /err_unknown_file_extension/i,
    "Node cannot handle this file extension. Check your loader config or add the appropriate transform.",
  ],
  [
    /err_package_path_not_exported/i,
    "The package does not export this path. Check the 'exports' field in the package's package.json and use a supported sub-path.",
  ],
  [
    /err_invalid_package_target/i,
    "The package.json 'exports' field contains an invalid target. Check the package version or report a bug to the package author.",
  ],
  [
    /does\s+not\s+provide\s+an\s+export|no\s+exported\s+member/i,
    "The named export does not exist. Check the package's API and update the import to match an exported name.",
  ],
  [
    /circular\s+(?:dependency|import|require)/i,
    "A circular module dependency was detected. Restructure imports to remove the cycle, or use lazy imports.",
  ],

  // ── Database & ORM ────────────────────────────────────────────────────
  [
    /unique\s+constraint|duplicate\s+(?:entry|key|value)/i,
    "A unique constraint was violated. Check for duplicate data before inserting, or use an upsert operation.",
  ],
  [
    /foreign\s+key\s+constraint/i,
    "A foreign key constraint failed. Ensure the referenced record exists before inserting the dependent record.",
  ],
  [
    /not\s+null\s+constraint|null\s+value\s+in\s+column/i,
    "A NOT NULL constraint was violated. Ensure all required fields are provided before saving.",
  ],
  [
    /relation\s+.+\s+does\s+not\s+exist|table\s+.+\s+doesn.t\s+exist/i,
    "The database table or relation does not exist. Run pending migrations and verify the schema.",
  ],
  [
    /connection\s+(?:pool|limit|exhausted)|too\s+many\s+connections/i,
    "The database connection pool is exhausted. Increase pool size, reduce idle connections, or add connection retry logic.",
  ],
  [
    /deadlock\s+(?:detected|found)/i,
    "A database deadlock was detected. Retry the transaction and review the order of table/row locks to prevent future deadlocks.",
  ],
  [
    /query\s+(?:timeout|timed\s+out)|statement\s+timeout/i,
    "The database query timed out. Optimise the query with indexes, reduce the data set, or increase the statement timeout.",
  ],
  [
    /(?:prisma|sequelize|typeorm|mongoose|knex)/i,
    "An ORM error occurred. Check the model definition, migration state, and database connection settings.",
  ],

  // ── Authentication & authorisation ────────────────────────────────────
  [
    /(?:jwt|json\s+web\s+token).*(?:expired|invalid|malformed)/i,
    "The JWT is invalid or expired. Refresh the token and ensure the signing secret and algorithm match.",
  ],
  [
    /invalid\s+(?:signature|token|credentials|api.?key)/i,
    "Authentication credentials are invalid. Check the token, API key, or secret and ensure they match the expected value.",
  ],
  [
    /unauthorized|unauthenticated|401/i,
    "The request is not authenticated. Ensure a valid token or session is included in the Authorization header.",
  ],
  [
    /forbidden|access\s+denied|insufficient\s+(?:permissions?|scope)|403/i,
    "The caller lacks permission for this action. Review the role/scope assignments and access-control rules.",
  ],
  [
    /token\s+(?:expired|revoked|not\s+yet\s+valid)/i,
    "The auth token is expired or revoked. Implement token refresh logic and handle 401 responses gracefully.",
  ],
  [
    /csrf|cross.site\s+request/i,
    "A CSRF validation error occurred. Ensure the CSRF token is included in the request and matches the server-side value.",
  ],

  // ── Async / Promise ───────────────────────────────────────────────────
  [
    /unhandled\s+promise\s+rejection/i,
    "A Promise was rejected without a .catch() handler. Add error handling: await with try/catch or .catch() on the chain.",
  ],
  [
    /promise\s+(?:all|allsettled|race|any).*reject/i,
    "One or more promises in the batch were rejected. Use Promise.allSettled() to handle partial failures individually.",
  ],
  [
    /async.*not\s+awaited|missing\s+await/i,
    "An async function was called without 'await'. The Promise was never resolved — add 'await' at the call site.",
  ],

  // ── Environment & configuration ───────────────────────────────────────
  [
    /env(?:ironment)?\s+variable|process\.env/i,
    "A required environment variable is missing or undefined. Check your .env file and ensure it is loaded before use.",
  ],
  [
    /config(?:uration)?\s+(?:not\s+found|missing|invalid)/i,
    "Configuration is missing or invalid. Verify config files exist and all required keys are set.",
  ],
  [
    /port\s+(?:in\s+use|already\s+bound)|eaddrinuse/i,
    "The port is already in use. Stop the conflicting process (lsof -i :<port>) or configure a different port.",
  ],

  // ── Rate limiting & quotas ────────────────────────────────────────────
  [
    /rate\s+limit|too\s+many\s+requests|429/i,
    "Rate limit exceeded. Implement exponential back-off, cache responses where possible, and respect Retry-After headers.",
  ],
  [
    /quota\s+exceeded|resource\s+exhausted|limit\s+reached/i,
    "A resource quota has been exceeded. Check usage dashboards, upgrade the plan, or optimise to reduce usage.",
  ],

  // ── Validation ────────────────────────────────────────────────────────
  [
    /validation\s+(?:error|failed|failed)|schema\s+(?:error|invalid)/i,
    "Input validation failed. Check the expected schema and sanitise or coerce the input before processing.",
  ],
  [
    /required\s+field\s+missing|field\s+is\s+required/i,
    "A required field is missing. Ensure all mandatory fields are provided and validated before submitting.",
  ],
  [
    /(?:minimum|maximum)\s+(?:length|value|size)|out\s+of\s+range/i,
    "A value is outside its allowed range. Add boundary validation before passing the value to this function.",
  ],
  [
    /(?:zod|yup|joi|ajv|superstruct|valibot)/i,
    "A schema validation library rejected the input. Read the validation error details and fix the offending fields.",
  ],

  // ── Child process & workers ───────────────────────────────────────────
  [
    /spawn\s+(?:enoent|error|failed)|exec(?:file)?\s+error/i,
    "A child process failed to spawn. Verify the command exists in PATH, check executable permissions, and inspect stderr output.",
  ],
  [
    /worker\s+(?:thread|terminated|error)|workerthread/i,
    "A Worker thread crashed. Check the worker script for unhandled errors and ensure data passed via postMessage is serialisable.",
  ],

  // ── Stream errors ─────────────────────────────────────────────────────
  [
    /stream\s+(?:destroyed|already\s+ended|write\s+after\s+end|not\s+readable)/i,
    "A write/read was attempted on a destroyed or finished stream. Check stream lifecycle and only write while the stream is open.",
  ],
  [
    /err_stream_write_after_end/i,
    "Data was written to a stream after it was closed. Ensure all writes complete before calling end() or destroy().",
  ],

  // ── TypeScript / compiled output ──────────────────────────────────────
  [
    /decorat(?:or|e).*experimental|experimentaldecorators/i,
    "Decorators require 'experimentalDecorators: true' in tsconfig.json.",
  ],
  [
    /cannot\s+use\s+import\s+statement|esm|es\s+module/i,
    "ES module syntax is being used in a CommonJS context. Set 'type: module' in package.json or use require() / .cjs extension.",
  ],

  // ── Node.js internal error codes ─────────────────────────────────────
  [
    /err_invalid_arg_type/i,
    "The wrong type was passed to a Node.js API. Check the function's documentation for the expected argument type.",
  ],
  [
    /err_invalid_arg_value/i,
    "An invalid value was passed to a Node.js API. Verify the value is within the documented allowed range.",
  ],
  [
    /err_out_of_range/i,
    "A numeric argument is outside the allowed range. Add a bounds check before calling this function.",
  ],
  [
    /err_missing_args/i,
    "Required arguments are missing. Check the function signature and supply all mandatory parameters.",
  ],
  [
    /err_http_headers_sent/i,
    "HTTP headers were already sent when a second attempt was made. Ensure res.end() or res.send() is only called once per request.",
  ],
  [
    /err_http_invalid_header_value/i,
    "An invalid value was set as an HTTP header. Headers must be strings — convert numbers or objects before setting.",
  ],
  [
    /err_http2_/i,
    "An HTTP/2 protocol error occurred. Check session state, stream lifecycle, and that both client and server support HTTP/2.",
  ],
  [
    /err_tls_/i,
    "A TLS error occurred. Verify certificate files, cipher suites, and that both ends agree on the TLS version.",
  ],
  [
    /err_socket_/i,
    "A socket-level error occurred. Check that the socket is open before reading/writing and handle the 'close' event.",
  ],
  [
    /err_child_process_/i,
    "A child process error occurred. Inspect the process exit code and stderr output for the underlying reason.",
  ],
  [
    /err_worker_/i,
    "A Worker thread error occurred. Ensure the worker script is valid and that transferred data is structured-cloneable.",
  ],
  [
    /err_crypto_/i,
    "A Node.js crypto error occurred. Check key formats, algorithm names, and that inputs meet minimum length requirements.",
  ],
  [
    /err_buffer_/i,
    "A Buffer error occurred. Check that the offset and length are within bounds and that the encoding is valid.",
  ],
  [
    /err_manifest_/i,
    "A policy manifest error occurred. Review the policy file and ensure allowed modules are listed correctly.",
  ],
  [
    /err_vm_/i,
    "A VM module error occurred. Check that the script context is valid and that the code is syntactically correct.",
  ],
  [
    /err_performance_/i,
    "A performance measurement error occurred. Ensure marks exist before calling measure() and names are unique.",
  ],

  // ── Crypto & hashing ──────────────────────────────────────────────────
  [
    /digest\s+not\s+supported|unknown\s+(?:digest|hash|cipher|algorithm)/i,
    "The specified crypto algorithm is not supported. Use crypto.getHashes() or crypto.getCiphers() to list available algorithms.",
  ],
  [
    /invalid\s+(?:key|iv)\s+(?:length|size)|key\s+too\s+(?:short|long)/i,
    "The crypto key or IV length is incorrect. Check the algorithm's requirements for key size (e.g. AES-256 needs 32 bytes).",
  ],
  [
    /bad\s+decrypt|wrong\s+final\s+block\s+length|unable\s+to\s+decrypt/i,
    "Decryption failed. Verify the key, IV, and algorithm match those used during encryption.",
  ],
  [
    /hmac.*invalid|invalid.*hmac/i,
    "HMAC verification failed. The message may have been tampered with or the wrong secret key was used.",
  ],
  [
    /certificate\s+(?:has\s+expired|not\s+yet\s+valid|revoked)/i,
    "The SSL certificate is expired, not yet valid, or revoked. Renew the certificate or adjust system clock if it is wrong.",
  ],
  [
    /self.signed\s+certificate|unable\s+to\s+verify.*certificate/i,
    "A self-signed or untrusted certificate was encountered. Add it to the trusted store or set NODE_TLS_REJECT_UNAUTHORIZED=0 (dev only).",
  ],
  [
    /random\s+bytes|insufficient\s+entropy/i,
    "Insufficient entropy for random number generation. This is rare — restart the process or check OS entropy sources.",
  ],
  [
    /pbkdf2|scrypt|bcrypt|argon/i,
    "A password hashing function failed. Check the salt length, iteration count, and key length parameters.",
  ],

  // ── Encoding & buffers ────────────────────────────────────────────────
  [
    /invalid\s+(?:utf.?8|utf.?16|ascii|base64|hex)\s+(?:encoding|character|sequence)/i,
    "Invalid encoded data. Verify the input uses the correct character encoding before decoding.",
  ],
  [
    /unknown\s+encoding/i,
    "The specified encoding is not recognised. Supported encodings include: utf8, base64, hex, latin1, ascii, binary.",
  ],
  [
    /buffer\s+is\s+not\s+allocated|buffer.*out\s+of\s+(?:bounds|range)/i,
    "A Buffer access was out of bounds. Check offset and length before reading from or writing to the Buffer.",
  ],
  [
    /atob|btoa|base64.*(?:invalid|decode\s+error)/i,
    "Base64 decoding failed. Ensure the input string is valid Base64 — it should only contain A-Z, a-z, 0-9, +, /, and = padding.",
  ],

  // ── Date & time ───────────────────────────────────────────────────────
  [
    /invalid\s+date|date\s+is\s+(?:invalid|nan)/i,
    "An invalid date was created. Check the date string format — use ISO 8601 (YYYY-MM-DD) for reliable cross-platform parsing.",
  ],
  [
    /timezone|time.zone|tz.*(?:invalid|unknown|not\s+found)/i,
    "An invalid or unknown timezone was specified. Use IANA timezone names (e.g. 'America/New_York') from the Intl API.",
  ],
  [
    /date.*overflow|year.*out\s+of\s+range|epoch/i,
    "A date value has overflowed. JavaScript dates are limited to ±8,640,000,000,000,000 milliseconds from epoch.",
  ],

  // ── Regular expressions ───────────────────────────────────────────────
  [
    /invalid\s+(?:regular\s+expression|regexp|regex)|regex.*(?:error|invalid)/i,
    "The regular expression is invalid. Check for unescaped special characters, unclosed groups, or unsupported flags.",
  ],
  [
    /regular\s+expression\s+too\s+(?:large|complex)|catastrophic\s+backtracking/i,
    "The regex is too complex and may cause catastrophic backtracking. Simplify the pattern or use a non-backtracking engine.",
  ],

  // ── MongoDB / Mongoose ────────────────────────────────────────────────
  [
    /mongotimeouterror|server\s+selection\s+timed\s+out|topology\s+was\s+destroyed/i,
    "MongoDB connection timed out. Check that mongod is running, the connection URI is correct, and network access is allowed.",
  ],
  [
    /mongonetworkerror|failed\s+to\s+connect\s+to\s+server|connection\s+refused.*27017/i,
    "Cannot connect to MongoDB. Verify the host, port (default 27017), and that the MongoDB service is running.",
  ],
  [
    /mongoduplikeyerror|e11000\s+duplicate\s+key/i,
    "A MongoDB unique index violation occurred (E11000). Use findOneAndUpdate with upsert or check for existence before inserting.",
  ],
  [
    /mongoparserrror|invalid\s+(?:uri|connection\s+string).*mongo/i,
    "The MongoDB connection URI is malformed. It must follow: mongodb://[user:pass@]host[:port][/dbname][?options].",
  ],
  [
    /documentnotfounderror|no\s+document\s+found/i,
    "The Mongoose query returned no document. Use findOne() and check for null, or use orFail() to throw on empty results.",
  ],
  [
    /castError|cast\s+to\s+objectid\s+failed|bsontype/i,
    "A Mongoose CastError occurred — the value cannot be cast to the schema type. Validate the ID format before querying.",
  ],
  [
    /validationerror.*mongoose|mongoose.*validationerror/i,
    "Mongoose validation failed. Check the schema definition and ensure required fields meet their constraints.",
  ],
  [
    /mongobulkwriteerror/i,
    "A MongoDB bulk write operation partially failed. Inspect the writeErrors array for per-document failure details.",
  ],
  [
    /writeconcernerror|w.*concern/i,
    "A MongoDB write concern error occurred. Lower the write concern level or ensure enough replica set members are available.",
  ],
  [
    /maxbsonsize|document\s+too\s+large/i,
    "The MongoDB document exceeds the 16 MB BSON size limit. Split large documents or store binary data in GridFS.",
  ],

  // ── Redis ─────────────────────────────────────────────────────────────
  [
    /redis.*(?:connection|connect).*(?:refused|failed|error)|ioredis.*error/i,
    "Cannot connect to Redis. Check that the Redis server is running, the host/port are correct, and firewall rules allow access.",
  ],
  [
    /wrongtype\s+operation|redis.*wrong\s+type/i,
    "A Redis WRONGTYPE error — the key holds a different data type than the command expects. Check the key type with TYPE command.",
  ],
  [
    /redis.*auth.*(?:failed|error)|noauth/i,
    "Redis authentication failed. Verify the password in the connection config matches the requirepass setting in redis.conf.",
  ],
  [
    /redis.*(?:out\s+of\s+memory|oom|maxmemory)/i,
    "Redis has hit its maxmemory limit. Increase the limit in redis.conf or review the eviction policy (maxmemory-policy).",
  ],
  [
    /redis.*(?:cluster|clusterdown)/i,
    "A Redis Cluster error occurred. Check that all cluster nodes are reachable and the cluster state is 'ok' (CLUSTER INFO).",
  ],
  [
    /redis.*(?:loading|busy)/i,
    "Redis is loading data from disk or busy with a blocking operation. Wait for LOADING to complete before sending commands.",
  ],
  [
    /redis.*(?:pipeline|multi|exec)/i,
    "A Redis pipeline/transaction error occurred. Check that MULTI/EXEC blocks are balanced and no watched keys changed.",
  ],
  [
    /keydb|dragonfly|valkey/i,
    "A Redis-compatible server error occurred. Check server logs for the specific error and verify the server version compatibility.",
  ],

  // ── PostgreSQL / pg ───────────────────────────────────────────────────
  [
    /pg.*connection|postgres.*connection|psql.*could\s+not\s+connect/i,
    "Cannot connect to PostgreSQL. Check pg_hba.conf, the connection string, and that the PostgreSQL service is running.",
  ],
  [
    /syntax\s+error.*line\s+\d|error.*at\s+or\s+near/i,
    "A PostgreSQL syntax error occurred. Check the SQL near the reported position for typos or unsupported syntax.",
  ],
  [
    /column\s+.+\s+(?:does\s+not\s+exist|of\s+relation)|undefined\s+column/i,
    "A referenced column does not exist. Run a migration, check column name spelling, or verify the table schema.",
  ],
  [
    /permission\s+denied\s+for\s+(?:table|schema|database|relation)/i,
    "The database user lacks permission for this operation. Grant the necessary privileges: GRANT SELECT ON table TO user.",
  ],
  [
    /could\s+not\s+serialize\s+access|serialization\s+failure/i,
    "A PostgreSQL serialization failure occurred (concurrent update conflict). Retry the transaction — this is expected in SERIALIZABLE isolation.",
  ],
  [
    /numeric\s+field\s+overflow|integer\s+out\s+of\s+range|value\s+too\s+long/i,
    "A PostgreSQL data overflow occurred. Check column type sizes and ensure the value fits (e.g. INT max 2,147,483,647).",
  ],
  [
    /lock\s+not\s+available|could\s+not\s+obtain\s+lock/i,
    "A PostgreSQL lock could not be acquired. Another transaction holds it — retry after the blocking query completes.",
  ],

  // ── MySQL / MariaDB ───────────────────────────────────────────────────
  [
    /er_access_denied|access\s+denied\s+for\s+user.*mysql/i,
    "MySQL access was denied. Check the username, password, and host in the connection config and verify GRANT permissions.",
  ],
  [
    /er_no_such_table|table\s+.+\s+doesn.t\s+exist.*mysql/i,
    "The MySQL table does not exist. Run pending migrations and verify the database name and table spelling.",
  ],
  [
    /er_dup_entry/i,
    "A MySQL duplicate entry error occurred. The value violates a UNIQUE constraint — check for existing records before inserting.",
  ],
  [
    /er_data_too_long/i,
    "The data exceeds the column's maximum length. Increase the column size in the schema or truncate the input.",
  ],
  [
    /er_lock_deadlock|er_lock_wait_timeout/i,
    "A MySQL lock deadlock or timeout occurred. Retry the transaction and review the query order to reduce lock contention.",
  ],

  // ── GraphQL ───────────────────────────────────────────────────────────
  [
    /graphql.*syntax\s+error|synaxerror.*graphql/i,
    "A GraphQL query has a syntax error. Validate the query string using a GraphQL linter or playground before sending.",
  ],
  [
    /cannot\s+query\s+field|field\s+.+\s+does\s+not\s+exist\s+on\s+type/i,
    "The queried field does not exist on this GraphQL type. Check the schema definition and update the query.",
  ],
  [
    /variable\s+.+\s+of\s+type\s+.+\s+used\s+in\s+position/i,
    "A GraphQL variable type mismatch. Ensure the variable type in the query matches the expected schema input type.",
  ],
  [
    /graphql.*(?:network|transport)\s+error/i,
    "A GraphQL network/transport error occurred. Check the endpoint URL, authentication headers, and server availability.",
  ],
  [
    /introspection.*disabled|graphql.*forbidden/i,
    "GraphQL introspection or the endpoint is disabled. Enable it in development or use the published schema.",
  ],
  [
    /complexity\s+limit|depth\s+limit.*graphql|query\s+too\s+(?:complex|deep)/i,
    "The GraphQL query exceeded the server's complexity or depth limit. Simplify the query or request a pagination limit increase.",
  ],
  [
    /n\+1.*(?:query|problem)|dataloader/i,
    "An N+1 query problem was detected. Use DataLoader to batch and cache database lookups within a single request.",
  ],

  // ── WebSocket ─────────────────────────────────────────────────────────
  [
    /websocket.*(?:connection|connect).*(?:failed|refused|error)|ws.*error/i,
    "WebSocket connection failed. Check the server is running, the URL uses ws:// or wss://, and CORS/upgrade headers are correct.",
  ],
  [
    /websocket.*(?:closed|close)|ws.*1006|abnormal\s+closure/i,
    "The WebSocket closed unexpectedly (code 1006). Implement reconnection logic with exponential back-off.",
  ],
  [
    /websocket.*(?:message\s+too\s+large|payload\s+too\s+big)/i,
    "The WebSocket message exceeded the server's maximum payload size. Increase maxPayload on the server or split large messages.",
  ],
  [
    /websocket.*(?:ping|pong|timeout|heartbeat)/i,
    "A WebSocket heartbeat/ping timeout occurred. Ensure the client sends pings and handles pong responses to keep the connection alive.",
  ],
  [
    /socket\.io.*(?:timeout|disconnect|reconnect)/i,
    "A Socket.IO connection issue occurred. Check transport settings, increase pingTimeout/pingInterval, and handle reconnection events.",
  ],

  // ── AWS SDK ───────────────────────────────────────────────────────────
  [
    /no\s+(?:credentials|region)\s+provided|unable\s+to\s+load\s+credentials|credentialsprovider/i,
    "AWS credentials or region are not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables or use an IAM role.",
  ],
  [
    /accessdenied|not\s+authorized\s+to\s+perform|is\s+not\s+authorized.*iam/i,
    "AWS IAM permission denied. Attach the required policy to the IAM user/role — check the Action and Resource in the error details.",
  ],
  [
    /nosuchbucket|the\s+specified\s+bucket\s+does\s+not\s+exist/i,
    "The S3 bucket does not exist. Verify the bucket name, AWS region, and that the bucket was created.",
  ],
  [
    /nosuchkey|the\s+specified\s+key\s+does\s+not\s+exist/i,
    "The S3 object key does not exist. Check the key path for typos and verify the object was uploaded successfully.",
  ],
  [
    /bucketalreadyexists|bucketalreadyownedby/i,
    "The S3 bucket name is already taken (S3 names are globally unique). Choose a different bucket name.",
  ],
  [
    /requestexpired|request\s+has\s+expired.*aws/i,
    "The AWS request timestamp has expired. Synchronise your server clock with NTP — AWS requires requests within 15 minutes of current time.",
  ],
  [
    /throttlingexception|requestlimitexceeded|toomanyrequests.*aws/i,
    "AWS API rate limit exceeded. Implement exponential back-off with jitter using the AWS SDK's retry configuration.",
  ],
  [
    /invalidparameter(?:value|combination|exception)|aws.*validation/i,
    "An AWS API parameter is invalid. Check the AWS documentation for correct parameter names, types, and constraints.",
  ],
  [
    /servicenavailableexception|serviceunavailable.*aws/i,
    "The AWS service is temporarily unavailable. Retry with exponential back-off or check the AWS Service Health Dashboard.",
  ],
  [
    /lambdaerror|function.*timed\s+out.*lambda|lambda.*resource/i,
    "An AWS Lambda error occurred. Check the function logs in CloudWatch and review memory/timeout configuration.",
  ],
  [
    /sqs.*(?:queue|message)|receipthandle|invisibility/i,
    "An SQS error occurred. Verify the queue URL, message visibility timeout, and that the IAM role has sqs:SendMessage/ReceiveMessage permissions.",
  ],
  [
    /dynamodb.*(?:provision|throughput|capacity)|conditioncheckfailed/i,
    "A DynamoDB error occurred. Check provisioned throughput, key schema, and condition expressions in the request.",
  ],

  // ── Google Cloud / Firebase ───────────────────────────────────────────
  [
    /firebase.*(?:permission|auth|token)|firestore.*permission/i,
    "A Firebase permission error occurred. Check Firestore/RTDB security rules and ensure the user is authenticated correctly.",
  ],
  [
    /firebase.*(?:quota|limit|rate)/i,
    "A Firebase quota or rate limit was exceeded. Review Firebase usage in the console and upgrade the plan if needed.",
  ],
  [
    /storage.*object.*not\s+found.*google|gcs.*nosuchobject/i,
    "The Google Cloud Storage object does not exist. Verify the bucket name and object path.",
  ],

  // ── Express.js specific ───────────────────────────────────────────────
  [
    /res\.(?:send|json|end)\s+called\s+multiple\s+times|cannot\s+set\s+headers.*sent/i,
    "The Express response was sent more than once. Ensure only one res.send()/res.json()/res.end() is called per request — add early returns.",
  ],
  [
    /body.parser|request\s+entity\s+too\s+large|payload\s+too\s+large/i,
    "The request body exceeds the body-parser limit. Increase the limit option: express.json({ limit: '10mb' }).",
  ],
  [
    /express.*router|no\s+route\s+found|cannot\s+(?:get|post|put|delete|patch)\s+\//i,
    "No Express route matched the request. Check the route path, HTTP method, and that the router is mounted correctly.",
  ],
  [
    /express.*middleware|next\(\)|next\(err\)/i,
    "An Express middleware error occurred. Ensure next(err) is called with an Error object and that error-handling middleware has 4 parameters (err, req, res, next).",
  ],

  // ── Next.js specific ──────────────────────────────────────────────────
  [
    /next.*build\s+error|nextjs.*compilation|\.next.*not\s+found/i,
    "A Next.js build error occurred. Run 'next build' locally to see the full error and fix compilation issues before deploying.",
  ],
  [
    /getserversideprops|getstaticprops.*error/i,
    "An error occurred in getServerSideProps or getStaticProps. Check that all external data fetches handle failures and return a valid props or notFound object.",
  ],
  [
    /next.*api\s+route|api.*handler.*error/i,
    "A Next.js API route error occurred. Ensure the handler exports a default function and always sends a response (res.json/res.end).",
  ],
  [
    /hydration.*mismatch|text\s+content\s+did\s+not\s+match|hydration\s+error/i,
    "A React hydration mismatch occurred. Ensure server and client render identical HTML — avoid using browser-only globals (window, localStorage) during SSR.",
  ],

  // ── gRPC / Protobuf ───────────────────────────────────────────────────
  [
    /grpc.*(?:unavailable|status.*14)|failed\s+to\s+connect.*grpc/i,
    "A gRPC service is unavailable. Check the server address, port, and that the gRPC server is running and healthy.",
  ],
  [
    /grpc.*deadline.*exceeded|status.*4.*grpc/i,
    "A gRPC deadline was exceeded. Increase the deadline option on the client or optimise the server-side handler.",
  ],
  [
    /grpc.*permission.*denied|status.*7/i,
    "gRPC permission denied. Verify the service account, TLS credentials, and interceptor authentication logic.",
  ],
  [
    /protobuf.*decode|proto.*parse\s+error|invalid\s+wire\s+type/i,
    "Protobuf decoding failed. Ensure the message schema matches between client and server and the binary data is not corrupted.",
  ],

  // ── Message queues (Bull, RabbitMQ, Kafka) ────────────────────────────
  [
    /bull(?:mq)?.*(?:failed|stalled|error)|job.*(?:failed|stalled)/i,
    "A Bull/BullMQ job failed or stalled. Check the worker process is running, increase the job timeout, and inspect the job's failedReason.",
  ],
  [
    /rabbitmq|amqp.*(?:connection|channel|error)/i,
    "A RabbitMQ/AMQP error occurred. Check broker connectivity, exchange/queue declarations, and that the channel is not closed.",
  ],
  [
    /kafka.*(?:offset|partition|consumer|producer|broker)/i,
    "A Kafka error occurred. Check broker addresses, topic existence, consumer group offsets, and network connectivity.",
  ],
  [
    /(?:queue|job)\s+(?:timeout|timed\s+out|expired)/i,
    "A queued job timed out. Increase the job timeout limit or break the operation into smaller jobs.",
  ],

  // ── Email (Nodemailer / SMTP) ─────────────────────────────────────────
  [
    /smtp.*(?:auth|authentication)|535.*authentication/i,
    "SMTP authentication failed. Verify the email credentials and enable 'App Passwords' if 2FA is active on the account.",
  ],
  [
    /smtp.*connect|econnrefused.*(?:25|465|587)/i,
    "Cannot connect to the SMTP server. Check the host, port (25/465/587), and that firewall rules allow outbound SMTP.",
  ],
  [
    /invalid.*(?:email|address|recipient)|recipient.*(?:invalid|not\s+found)/i,
    "An invalid email address was provided. Validate email format before sending and check for typos in the recipient.",
  ],
  [
    /message\s+size\s+exceeds|attachment.*too\s+large.*email/i,
    "The email message or attachment exceeds the server's size limit. Compress attachments or use a file-sharing link instead.",
  ],
  [
    /550\s+5\.1\.|mailbox.*(?:full|unavailable)|user.*unknown/i,
    "The recipient mailbox is full, unknown, or unavailable. Verify the address is correct and handle bounces in your sending logic.",
  ],

  // ── Payment (Stripe) ─────────────────────────────────────────────────
  [
    /stripe.*card_declined|your\s+card\s+was\s+declined/i,
    "The Stripe payment card was declined. Inform the user to check card details, funds, or try a different card.",
  ],
  [
    /stripe.*insufficient_funds/i,
    "The card has insufficient funds. Prompt the user to use a different payment method.",
  ],
  [
    /stripe.*expired_card/i,
    "The Stripe card has expired. Ask the user to update their payment method with a valid card.",
  ],
  [
    /stripe.*invalid_api_key|no\s+such\s+.*stripe|stripe.*authentication/i,
    "Invalid Stripe API key. Ensure you are using the correct publishable or secret key for the environment (test vs. live).",
  ],
  [
    /stripe.*rate_limit/i,
    "Stripe rate limit reached. Implement exponential back-off and reduce the frequency of API calls.",
  ],
  [
    /stripe.*idempotency/i,
    "A Stripe idempotency key conflict occurred. Use a unique idempotency key per logical request to safely retry.",
  ],

  // ── File upload & multipart ───────────────────────────────────────────
  [
    /file.*(?:too\s+large|exceeds.*limit)|maxfilesize|upload.*limit/i,
    "The uploaded file exceeds the size limit. Increase the limit in multer/formidable config or validate file size before upload.",
  ],
  [
    /unsupported.*(?:mime|file\s+type)|invalid\s+(?:file\s+type|extension)/i,
    "The uploaded file type is not allowed. Validate the MIME type and file extension against an allowlist before processing.",
  ],
  [
    /multipart.*(?:boundary|parse\s+error)|formdata.*error/i,
    "A multipart form parsing error occurred. Check that the Content-Type header includes the boundary parameter.",
  ],
  [
    /virus|malware|infected\s+file/i,
    "A file was flagged as potentially malicious. Quarantine the file, scan with an antivirus service, and do not process it.",
  ],

  // ── Image processing ──────────────────────────────────────────────────
  [
    /sharp.*(?:error|unsupported|invalid)|jimp.*error/i,
    "An image processing error occurred. Verify the input is a valid image format (JPEG, PNG, WebP, etc.) and not corrupted.",
  ],
  [
    /image.*(?:too\s+large|dimensions|resolution)/i,
    "The image dimensions or resolution exceed processing limits. Resize or downsample the image before processing.",
  ],
  [
    /exif|metadata.*(?:corrupt|invalid).*image/i,
    "Image EXIF metadata is corrupt or invalid. Strip metadata before processing or use a library that handles corrupt EXIF gracefully.",
  ],

  // ── PDF generation ────────────────────────────────────────────────────
  [
    /puppeteer.*(?:browser|launch|timeout)|chromium.*error/i,
    "Puppeteer failed to launch or timed out. Ensure Chromium is installed (npx puppeteer browsers install chrome), and set the correct executablePath.",
  ],
  [
    /pdf.*(?:generation|create|render).*error|pdfkit.*error/i,
    "A PDF generation error occurred. Check that all fonts are loaded, images are accessible, and the template is valid.",
  ],

  // ── Process & signals ─────────────────────────────────────────────────
  [
    /sigterm|sigkill|sigint.*received/i,
    "The process received a termination signal. Implement graceful shutdown: listen for SIGTERM, finish in-flight work, then exit.",
  ],
  [
    /process.*exit(?:ed)?\s+with\s+code\s+[^0]|non.zero\s+exit/i,
    "A process exited with a non-zero code indicating failure. Check the process's stderr output for the root cause.",
  ],
  [
    /uncaughtexception|uncaught\s+exception/i,
    "An uncaught exception crashed the process. Add a process.on('uncaughtException') handler and fix the underlying error to prevent data loss.",
  ],

  // ── TypeScript compiler diagnostics ──────────────────────────────────
  [
    /ts\(2345\)|argument.*not\s+assignable|type.*not\s+assignable\s+to\s+type/i,
    "A TypeScript type mismatch — the argument type is not assignable to the parameter type. Check generics and add type assertions or guards.",
  ],
  [
    /ts\(2304\)|cannot\s+find\s+name/i,
    "TypeScript cannot find the name. Add a type declaration, install @types/* package, or check the import path.",
  ],
  [
    /ts\(2307\)|cannot\s+find\s+module.*(?:ts|tsx)/i,
    "TypeScript cannot find the module. Check tsconfig paths, moduleResolution, and that the module or its @types are installed.",
  ],
  [
    /ts\(2339\)|property.*does\s+not\s+exist\s+on\s+type/i,
    "TypeScript reports a missing property. Add the property to the type definition, use a type assertion, or check for typos.",
  ],
  [
    /ts\(2554\)|expected\s+\d+\s+arguments.*but\s+got/i,
    "Wrong number of arguments passed to the function. Check the function signature for required and optional parameters.",
  ],
  [
    /ts\(7006\)|ts\(7031\)|parameter.*implicitly\s+has\s+an\s+'any'\s+type/i,
    "A TypeScript parameter has an implicit 'any' type. Add an explicit type annotation or enable/disable noImplicitAny in tsconfig.",
  ],
  [
    /ts\(2322\)|type.*is\s+not\s+assignable/i,
    "A TypeScript assignment type error. Align the types on both sides or use a type narrowing guard.",
  ],

  // ── Jest / Vitest / testing ───────────────────────────────────────────
  [
    /jest.*timeout|vitest.*timeout|test.*timed\s+out/i,
    "A test timed out. Increase the timeout with jest.setTimeout() or the test's timeout option, and check for unresolved promises.",
  ],
  [
    /expect.*received.*toBe|assertion.*failed|expected.*but\s+received/i,
    "A test assertion failed. Check the actual vs. expected values and verify the test data setup (beforeEach/fixtures).",
  ],
  [
    /cannot\s+spy|cannot\s+mock|jest\.mock.*error|vi\.mock.*error/i,
    "A Jest/Vitest mock setup failed. Ensure the module path is correct and use vi.mock/jest.mock at the top level of the test file.",
  ],
  [
    /snapshot.*(?:obsolete|failed|mismatch)|toMatchSnapshot/i,
    "A snapshot test failed. Run tests with --updateSnapshot to regenerate snapshots, or fix the component output to match the stored snapshot.",
  ],
  [
    /open\s+handles.*jest|detected\s+open\s+handles/i,
    "Jest detected open handles preventing clean exit. Close database connections, timers, or servers in afterAll()/afterEach().",
  ],

  // ── Docker / containerisation ─────────────────────────────────────────
  [
    /docker.*(?:daemon|socket).*(?:not\s+running|refused|connect)/i,
    "Cannot connect to the Docker daemon. Start Docker Desktop or run: sudo systemctl start docker.",
  ],
  [
    /image.*(?:not\s+found|pull\s+access\s+denied|does\s+not\s+exist).*docker/i,
    "A Docker image was not found or access was denied. Check the image name/tag, log in with 'docker login', and verify registry permissions.",
  ],
  [
    /container.*(?:exited|stopped|oom\s+killed)/i,
    "A Docker container stopped or was OOM-killed. Check container logs (docker logs <id>) and increase memory limits in the compose/run config.",
  ],

  // ── Kubernetes / Helm ────────────────────────────────────────────────
  [
    /crashloopbackoff/i,
    "A Kubernetes pod is in CrashLoopBackOff. Check pod logs (kubectl logs <pod> --previous) for the startup error and fix the application or liveness probe.",
  ],
  [
    /oomkilled|out\s+of\s+memory.*kubernetes|container.*memory\s+limit/i,
    "A Kubernetes container was OOM-killed. Increase the memory limit in the container spec or reduce the application's memory usage.",
  ],
  [
    /imagepullbackoff|errimagepull|image.*cannot\s+be\s+pulled/i,
    "Kubernetes cannot pull the container image. Verify the image name/tag, check registry credentials in an imagePullSecret, and confirm network access to the registry.",
  ],
  [
    /kubectl.*(?:connection\s+refused|unreachable|context)/i,
    "kubectl cannot reach the cluster. Run 'kubectl config current-context' and ensure your kubeconfig points to the correct and reachable cluster.",
  ],
  [
    /pending.*pod|pod.*unschedulable|insufficient\s+(?:cpu|memory).*kubernetes/i,
    "A Kubernetes pod is stuck in Pending state. Check node resource availability (kubectl describe pod) and adjust resource requests/limits.",
  ],
  [
    /configmap.*not\s+found|secret.*not\s+found.*kubernetes/i,
    "A referenced Kubernetes ConfigMap or Secret does not exist. Apply the missing resource (kubectl apply -f) before deploying the pod.",
  ],
  [
    /helm.*(?:release.*failed|upgrade.*failed|install.*failed)/i,
    "A Helm release failed. Run 'helm status <release>' and 'helm history <release>' to see the error, then fix the chart values or rollback with 'helm rollback'.",
  ],
  [
    /rbac.*authorization\s+failed|forbidden.*kubernetes|user.*cannot.*resource/i,
    "Kubernetes RBAC authorization denied the request. Check the ServiceAccount, ClusterRole, and RoleBinding for the resource and verb.",
  ],
  [
    /liveness.*probe\s+failed|readiness.*probe\s+failed/i,
    "A Kubernetes liveness or readiness probe is failing. Check the probe endpoint, increase initialDelaySeconds, and inspect the application health endpoint.",
  ],
  [
    /persistentvolumeclaim|pvc.*(?:bound|pending|failed)|storageclass/i,
    "A Kubernetes PersistentVolumeClaim error occurred. Check the StorageClass, available PVs, and that the provisioner is functioning.",
  ],

  // ── CI/CD (GitHub Actions, Jenkins) ──────────────────────────────────
  [
    /github\s+actions.*(?:failed|error)|workflow.*failed|action.*failed/i,
    "A GitHub Actions workflow failed. Check the step's output in the Actions tab and review the workflow YAML for syntax errors or incorrect secrets.",
  ],
  [
    /secrets?\s+(?:not\s+set|undefined|missing).*(?:actions|ci|workflow)/i,
    "A required CI/CD secret is not set. Add the secret in repository Settings → Secrets and update the workflow to reference it correctly.",
  ],
  [
    /artifact.*(?:not\s+found|upload\s+failed|download\s+failed)/i,
    "A CI/CD artifact upload or download failed. Check storage quotas, artifact name spelling, and that the upload step completed successfully.",
  ],
  [
    /pipeline.*(?:timeout|timed\s+out).*(?:jenkins|gitlab|ci)/i,
    "A CI/CD pipeline timed out. Increase the timeout setting, parallelise slow steps, or investigate which stage is taking too long.",
  ],
  [
    /runner.*(?:offline|not\s+found|unavailable)|no\s+agents\s+available/i,
    "No CI/CD runner is available. Register a new runner, scale the runner pool, or check existing runner connectivity.",
  ],
  [
    /docker.*build.*(?:failed|error).*(?:ci|dockerfile)/i,
    "The Docker build failed in CI. Check the Dockerfile for errors, ensure base image tags exist, and verify build context files are present.",
  ],
  [
    /deployment.*(?:failed|rollback).*(?:k8s|kubernetes|heroku|vercel|netlify|render)/i,
    "A deployment failed. Review deployment logs, check health checks, and confirm environment variables and secrets are configured correctly.",
  ],
  [
    /test.*(?:coverage|threshold)\s+(?:below|failed|not\s+met)/i,
    "Test coverage fell below the required threshold. Add tests for uncovered code paths or adjust the coverage threshold if intentional.",
  ],

  // ── Git errors ────────────────────────────────────────────────────────
  [
    /merge\s+conflict|conflict.*both\s+modified|automatic\s+merge\s+failed/i,
    "A Git merge conflict occurred. Resolve conflicts in the marked files, stage them with 'git add', then run 'git commit'.",
  ],
  [
    /rejected.*non-fast-forward|tip\s+of\s+your\s+current\s+branch|push.*rejected/i,
    "The push was rejected (non-fast-forward). Pull the latest changes ('git pull --rebase'), resolve any conflicts, then push again.",
  ],
  [
    /repository.*not\s+found.*git|remote.*does\s+not\s+exist/i,
    "The Git remote repository was not found. Verify the URL with 'git remote -v' and confirm access permissions.",
  ],
  [
    /authentication\s+failed.*git|git.*invalid\s+credentials|permission.*denied.*publickey/i,
    "Git authentication failed. Re-configure credentials, regenerate SSH keys, or create a new personal access token with repo scope.",
  ],
  [
    /detached\s+head|not\s+on\s+any\s+branch/i,
    "Git is in detached HEAD state. Create a new branch ('git switch -c <name>') to preserve your commits.",
  ],
  [
    /(?:stash|unstash).*conflict|stash.*failed/i,
    "A Git stash operation failed or produced conflicts. Run 'git stash show -p' to inspect the stash and resolve conflicts manually.",
  ],
  [
    /submodule.*(?:not\s+initialised|missing|failed)/i,
    "A Git submodule is missing or not initialised. Run 'git submodule update --init --recursive'.",
  ],
  [
    /large\s+file|lfs.*pointer|git-lfs/i,
    "A Git LFS issue occurred. Ensure git-lfs is installed ('git lfs install') and the LFS endpoint is accessible.",
  ],

  // ── Package managers (npm / yarn / pnpm) ─────────────────────────────
  [
    /npm\s+err.*peer\s+dep|peer\s+dependency\s+conflict|unmet\s+peer\s+dep/i,
    "A peer dependency conflict was detected. Use '--legacy-peer-deps' to bypass, or align package versions to satisfy all peer requirements.",
  ],
  [
    /package.*not\s+found.*registry|404.*npm\s+registry|npm.*e404/i,
    "The npm package was not found. Check the package name spelling, verify it exists on npmjs.com, and ensure registry config is correct.",
  ],
  [
    /eintegrity|sha.*integrity\s+check\s+failed|checksum\s+mismatch/i,
    "A package integrity check failed. Delete node_modules and package-lock.json/yarn.lock, then reinstall: 'npm ci'.",
  ],
  [
    /lockfile.*conflict|package-lock.*conflict|yarn\.lock.*conflict/i,
    "The lockfile has conflicts. Resolve the conflict in package-lock.json/yarn.lock by running 'npm install' or 'yarn install' fresh.",
  ],
  [
    /engines.*node.*required|node.*version.*required|unsupported\s+node/i,
    "The package requires a different Node.js version. Check the 'engines' field and use nvm/fnm to switch to the required version.",
  ],
  [
    /enotaregistry|npm\s+registry.*unreachable|npm\s+network/i,
    "The npm registry is unreachable. Check internet connectivity, proxy settings, and run 'npm config get registry' to verify the registry URL.",
  ],
  [
    /yarn.*(?:network\s+timeout|error\s+an\s+unexpected\s+error)/i,
    "Yarn encountered a network or unexpected error. Clear the cache with 'yarn cache clean', check network, and retry.",
  ],
  [
    /pnpm.*(?:peer|store|lockfile)|store.*integrity/i,
    "A pnpm store or lockfile error occurred. Run 'pnpm store prune' to clean the store, then reinstall dependencies.",
  ],

  // ── Nginx / proxy / load balancer ────────────────────────────────────
  [
    /upstream.*(?:connection\s+refused|timed\s+out|no\s+live)/i,
    "Nginx cannot reach the upstream server. Ensure the application server is running, the proxy_pass address is correct, and health checks pass.",
  ],
  [
    /502\s+bad\s+gateway|nginx.*502/i,
    "A 502 Bad Gateway error — the upstream server returned an invalid response. Check application server logs and ensure it is running.",
  ],
  [
    /504\s+gateway\s+timeout|nginx.*504/i,
    "A 504 Gateway Timeout — the upstream did not respond in time. Increase proxy_read_timeout in Nginx config or optimise the backend.",
  ],
  [
    /413\s+request\s+entity\s+too\s+large|client_max_body_size/i,
    "The request body exceeds Nginx's client_max_body_size. Increase it in nginx.conf: 'client_max_body_size 50m;'",
  ],
  [
    /ssl_certificate.*not\s+found|nginx.*ssl.*error/i,
    "Nginx cannot find the SSL certificate. Verify the ssl_certificate and ssl_certificate_key paths in nginx.conf and run 'nginx -t'.",
  ],

  // ── Security (OWASP / injection / XSS) ───────────────────────────────
  [
    /sql\s+injection|sqli|unsafe.*query.*(?:user|input)/i,
    "Potential SQL injection risk. Always use parameterised queries or prepared statements — never interpolate user input into SQL strings.",
  ],
  [
    /xss|cross.site\s+scripting|script\s+injection|unsanitized.*(?:html|output)/i,
    "Potential XSS vulnerability. Escape all user-provided content before rendering it as HTML. Use a trusted sanitisation library.",
  ],
  [
    /prototype\s+pollution|__proto__|constructor.*prototype/i,
    "Potential prototype pollution attack. Avoid setting properties from user input directly on objects. Use Object.create(null) or sanitise input keys.",
  ],
  [
    /path\s+traversal|directory\s+traversal|\.\.\//i,
    "Potential path traversal attack. Sanitise file paths and use path.resolve() + validation to ensure the final path stays within the allowed directory.",
  ],
  [
    /open\s+redirect|unvalidated\s+redirect/i,
    "Potential open redirect vulnerability. Validate redirect URLs against an allowlist — never redirect to arbitrary user-supplied URLs.",
  ],
  [
    /insecure.*(?:deserialization|pickle|eval)|eval.*user.*input/i,
    "Insecure deserialisation or eval of user input detected. Never deserialise untrusted data or eval user-provided strings.",
  ],
  [
    /(?:hard.coded|hardcoded)\s+(?:secret|password|key|token)/i,
    "A hard-coded secret or credential was detected. Move it to environment variables or a secrets manager (AWS Secrets Manager, Vault, etc.).",
  ],
  [
    /content.security.policy|csp.*violation|csp.*blocked/i,
    "A Content Security Policy violation occurred. Review the CSP header directives and whitelist only trusted sources.",
  ],

  // ── React errors ──────────────────────────────────────────────────────
  [
    /react.*(?:hook.*called\s+conditionally|rules\s+of\s+hooks)/i,
    "A React Hook was called conditionally or outside a component. Hooks must be called at the top level of a function component — never inside conditionals or loops.",
  ],
  [
    /too\s+many\s+re.renders|maximum\s+update\s+depth\s+exceeded/i,
    "React detected an infinite render loop. A state update inside render or a useEffect with incorrect dependencies is causing repeated re-renders.",
  ],
  [
    /each\s+child.*unique\s+key|missing.*key.*prop|key\s+prop.*required/i,
    "React list items are missing unique 'key' props. Add a stable, unique key (e.g. item ID) to each element in the array.",
  ],
  [
    /cannot\s+update.*(?:unmounted|during\s+render)|state\s+update.*unmounted/i,
    "A state update was attempted on an unmounted React component. Cancel async operations in the useEffect cleanup function to prevent memory leaks.",
  ],
  [
    /invalid\s+hook\s+call|hooks\s+can\s+only\s+be\s+called/i,
    "An invalid React Hook call was detected. Ensure hooks are only called from React function components or custom hooks, not class components or plain functions.",
  ],
  [
    /react.*did\s+not\s+expect|server.*rendered.*html|client.*render/i,
    "React hydration failed — server HTML does not match client render. Ensure data fetching is consistent between SSR and client, and avoid non-deterministic rendering.",
  ],
  [
    /context.*(?:provider|consumer)|usecontext.*undefined/i,
    "A React Context value is undefined. Ensure the component consuming the context is wrapped inside the corresponding Provider.",
  ],
  [
    /suspense.*boundary|react\.lazy.*failed|dynamic\s+import.*failed/i,
    "A React Suspense or lazy-load error occurred. Wrap lazy components in a <Suspense> boundary with a fallback, and handle chunk load failures with an error boundary.",
  ],

  // ── Vue.js errors ─────────────────────────────────────────────────────
  [
    /\[vue\s+warn\].*missing\s+required\s+prop|prop.*required.*vue/i,
    "A required Vue prop is missing. Check the component's props definition and ensure the parent passes all required props.",
  ],
  [
    /\[vue\s+warn\].*avoid\s+mutating\s+a\s+prop/i,
    "A Vue component is directly mutating a prop. Use a local data copy or emit an event to the parent instead of mutating props directly.",
  ],
  [
    /vuex.*mutation.*outside|pinia.*action.*outside/i,
    "A Vuex mutation or Pinia action was called outside the store context. Ensure state changes happen inside mutations (Vuex) or actions (Pinia).",
  ],
  [
    /vue.*router.*navigation\s+(?:duplicated|cancelled|aborted)/i,
    "A Vue Router navigation error occurred. Handle NavigationDuplicated errors in router.push().catch() and use router guards for cancelled/aborted navigations.",
  ],
  [
    /\[vue\s+warn\].*component.*not\s+registered|unknown.*component/i,
    "A Vue component is not registered. Import and register it in the components option or use app.component() for global registration.",
  ],

  // ── Prisma specific ───────────────────────────────────────────────────
  [
    /prisma.*p1001|connection.*failed.*prisma/i,
    "Prisma cannot connect to the database. Check the DATABASE_URL in .env, ensure the database server is running, and verify network access.",
  ],
  [
    /prisma.*p1002|timed\s+out\s+fetching.*prisma/i,
    "Prisma connection timed out. Increase connection_timeout in the DATABASE_URL or check database server load.",
  ],
  [
    /prisma.*p2002|unique\s+constraint\s+failed.*prisma/i,
    "Prisma unique constraint violation. The field(s) listed must be unique — check for duplicate data before inserting or use upsert.",
  ],
  [
    /prisma.*p2003|foreign\s+key\s+constraint\s+failed.*prisma/i,
    "Prisma foreign key constraint failed. Ensure the referenced record exists before creating the dependent record.",
  ],
  [
    /prisma.*p2025|record.*not\s+found.*prisma|prisma.*not\s+found/i,
    "Prisma could not find the record. The operation requires a record that doesn't exist — check IDs and filters, or use findUnique with null handling.",
  ],
  [
    /prisma.*p2016|query.*interpretation\s+error/i,
    "Prisma query interpretation error. Check the query structure against the Prisma schema — field names and types must match.",
  ],
  [
    /prisma.*migrate|migration.*failed.*prisma/i,
    "A Prisma migration failed. Run 'npx prisma migrate status' to see the state, fix the migration file, and rerun 'npx prisma migrate deploy'.",
  ],
  [
    /prisma.*generate|prisma\s+client.*not\s+generated/i,
    "Prisma Client is not generated or out of date. Run 'npx prisma generate' after modifying the schema.",
  ],

  // ── Sequelize specific ────────────────────────────────────────────────
  [
    /sequelize.*connection.*refused|sequelize.*authenticate/i,
    "Sequelize cannot authenticate with the database. Check the database credentials, host, port, and dialect configuration.",
  ],
  [
    /sequelizeuniqueconstrain|sequelize.*unique\s+constraint/i,
    "A Sequelize unique constraint error occurred. Use Model.findOrCreate() or check for existence before saving.",
  ],
  [
    /sequelize.*validation\s+error|sequelizevalidation/i,
    "Sequelize model validation failed. Check the model's validate option and ensure all field constraints are satisfied.",
  ],
  [
    /sequelize.*association|through.*model|belongsto.*missing/i,
    "A Sequelize association error occurred. Verify that models are associated before the sync and that junction table models are correctly defined.",
  ],
  [
    /sequelize.*dialect.*not\s+found|sequelize.*dialect.*missing/i,
    "A Sequelize dialect package is missing. Install the required package: npm install pg (PostgreSQL), mysql2 (MySQL), or better-sqlite3 (SQLite).",
  ],
  [
    /sequelize.*migration|umzug.*error/i,
    "A Sequelize migration failed. Run migrations with --debug flag and check the migration file for SQL errors.",
  ],

  // ── Elasticsearch / OpenSearch ────────────────────────────────────────
  [
    /elasticsearch.*connection|opensearch.*connection|index.*not\s+found.*elastic/i,
    "Cannot connect to Elasticsearch/OpenSearch or the index is missing. Verify the cluster URL, index name, and that the cluster is healthy (GET /_cluster/health).",
  ],
  [
    /index.*already\s+exists.*elastic|resource.*already\s+exists.*elastic/i,
    "The Elasticsearch index already exists. Use PUT /<index> with create=false or catch the 400 error and handle it as an existing index.",
  ],
  [
    /query.*malformed|parsing_exception.*elastic|search.*phase.*exception/i,
    "An Elasticsearch query is malformed. Validate the query DSL against the Elasticsearch documentation and check for unsupported field types.",
  ],
  [
    /mapping.*conflict|field.*different\s+type.*elastic|type.*mismatch.*elastic/i,
    "An Elasticsearch mapping conflict occurred. A field is indexed with a different type. Reindex the data or use dynamic templates to control mapping.",
  ],
  [
    /bulk.*partial\s+failure|elasticsearch.*bulk.*error/i,
    "An Elasticsearch bulk operation had partial failures. Inspect the 'errors' array in the bulk response for per-document failure details.",
  ],
  [
    /circuit.breaker.*elasticsearch|too.*much.*heap.*elastic/i,
    "Elasticsearch circuit breaker tripped due to memory pressure. Reduce request size, add JVM heap, or optimise aggregations.",
  ],
  [
    /shard.*unavailable|no\s+shard\s+available|cluster.*red/i,
    "Elasticsearch cluster is in RED state with unavailable shards. Check cluster health (GET /_cluster/health) and node availability.",
  ],

  // ── Cassandra / ScyllaDB ──────────────────────────────────────────────
  [
    /cassandra.*(?:connection|timeout|unavailable)|nosystemavailable/i,
    "A Cassandra connection or unavailability error occurred. Check that Cassandra nodes are running and the contact points and datacenter are correct.",
  ],
  [
    /cassandra.*write.*timeout|writeTimeoutException/i,
    "A Cassandra write timeout occurred. Check cluster load, increase write_request_timeout_in_ms, or reduce consistency level.",
  ],
  [
    /cassandra.*read.*timeout|readTimeoutException/i,
    "A Cassandra read timeout occurred. Check replica availability, increase read_request_timeout_in_ms, or adjust consistency level.",
  ],
  [
    /cassandra.*overloaded|too\s+many\s+(?:requests|in\s+flight).*cassandra/i,
    "Cassandra is overloaded. Implement back-pressure with retry policies and reduce request concurrency.",
  ],

  // ── InfluxDB / TimescaleDB / time-series ──────────────────────────────
  [
    /influx.*(?:connection|unreachable|bucket.*not\s+found)/i,
    "An InfluxDB error occurred. Check the URL, org, bucket name, and token in the InfluxDB client configuration.",
  ],
  [
    /influx.*token.*unauthorized|influx.*forbidden/i,
    "InfluxDB authentication failed. Verify the API token has the correct read/write permissions for the organisation and bucket.",
  ],
  [
    /timescale.*(?:hypertable|continuous\s+aggregate)|tsdb/i,
    "A TimescaleDB error occurred. Verify the hypertable is created and the TimescaleDB extension is enabled (CREATE EXTENSION IF NOT EXISTS timescaledb).",
  ],
  [
    /retention\s+policy|data.*expired.*series/i,
    "A time-series data retention policy issue occurred. Check the database retention policy settings and ensure queries target the correct time range.",
  ],

  // ── OAuth2 / OIDC ─────────────────────────────────────────────────────
  [
    /invalid_client|client\s+authentication\s+failed.*oauth/i,
    "OAuth2 client authentication failed. Verify the client_id and client_secret match the registered application credentials.",
  ],
  [
    /invalid_grant|authorization\s+code.*(?:expired|used)|refresh_token.*invalid/i,
    "The OAuth2 authorization code or refresh token is invalid or expired. Redirect the user through the authorization flow to obtain fresh tokens.",
  ],
  [
    /invalid_scope|requested\s+scope.*not\s+allowed/i,
    "The requested OAuth2 scope is not allowed. Check the scopes registered for the application and request only permitted scopes.",
  ],
  [
    /redirect_uri.*mismatch|redirect_uri.*not\s+registered/i,
    "The OAuth2 redirect_uri does not match the registered URI. Register the exact redirect URI (including trailing slashes) in the auth provider's application settings.",
  ],
  [
    /pkce.*code_verifier|code_challenge.*failed/i,
    "An OAuth2 PKCE verification failed. Ensure the code_verifier used in the token exchange matches the code_challenge sent in the authorization request.",
  ],
  [
    /oidc.*(?:discovery|well.known|issuer.*mismatch)/i,
    "An OIDC configuration error occurred. Verify the issuer URL and check the /.well-known/openid-configuration endpoint is accessible.",
  ],

  // ── JWT specific ──────────────────────────────────────────────────────
  [
    /jwt.*expired|tokenexpirederror/i,
    "The JWT has expired. Implement token refresh logic using the refresh token before the access token expires.",
  ],
  [
    /jwt.*not\s+(?:active|valid\s+yet)|nbf.*claim/i,
    "The JWT is not yet valid (nbf claim). Check the 'not before' timestamp and ensure system clocks are synchronised.",
  ],
  [
    /jwt.*audience.*invalid|aud.*claim.*mismatch/i,
    "The JWT audience (aud) claim does not match. Verify the token is intended for this service by configuring the expected audience in the JWT library.",
  ],
  [
    /jwt.*issuer.*invalid|iss.*claim.*mismatch/i,
    "The JWT issuer (iss) claim does not match the expected issuer. Verify the token source and configure the expected issuer in the JWT verification options.",
  ],
  [
    /jwt.*malformed|invalid\s+jwt|jwt.*structure/i,
    "The JWT is malformed — it does not have the expected three-part Base64 structure. Verify the token is complete and not truncated.",
  ],

  // ── Webhooks ──────────────────────────────────────────────────────────
  [
    /webhook.*signature.*(?:invalid|mismatch|failed)|hmac.*webhook/i,
    "A webhook signature validation failed. Compute the HMAC using the shared secret and compare it to the provided signature header.",
  ],
  [
    /webhook.*delivery.*failed|webhook.*timeout/i,
    "A webhook delivery failed or timed out. Your endpoint must respond with 2xx within the provider's timeout window (typically 5-30s).",
  ],
  [
    /webhook.*replay|webhook.*duplicate.*event/i,
    "A duplicate or replayed webhook event was received. Track processed event IDs to implement idempotent event handling.",
  ],
  [
    /webhook.*payload.*too\s+large/i,
    "The webhook payload exceeded the size limit. Process large payloads asynchronously or request paginated delivery from the provider.",
  ],

  // ── Terraform / Infrastructure as Code ───────────────────────────────
  [
    /terraform.*state.*lock|state.*file.*locked/i,
    "Terraform state is locked. Another operation is in progress, or a previous run crashed. Force-unlock with 'terraform force-unlock <lock-id>' if safe.",
  ],
  [
    /terraform.*plan.*error|provider.*required|required\s+provider/i,
    "A Terraform provider or plan error occurred. Run 'terraform init' to initialise providers and 'terraform validate' to check configuration.",
  ],
  [
    /resource.*already\s+exists.*terraform|terraform.*already\s+managed/i,
    "Terraform tried to create a resource that already exists. Import it into state with 'terraform import <resource> <id>' instead of recreating.",
  ],
  [
    /terraform.*destroy.*failed|resource.*deletion.*failed/i,
    "A Terraform resource deletion failed. Resources with dependent relationships may require manual cleanup before destroy can proceed.",
  ],
  [
    /terraform.*output.*not\s+found|output.*not\s+set/i,
    "A Terraform output value is not set. Run 'terraform apply' to ensure outputs are computed and check the output block definition.",
  ],

  // ── Azure ─────────────────────────────────────────────────────────────
  [
    /azure.*(?:authentication|credentials).*failed|msal.*error/i,
    "Azure authentication failed. Check the tenant ID, client ID, client secret, and that the service principal has the required role assignments.",
  ],
  [
    /azure.*resource.*not\s+found|subscriptionnotfound/i,
    "An Azure resource was not found. Verify the subscription ID, resource group name, and resource name in the request.",
  ],
  [
    /azure.*quota.*exceeded|azure.*throttle|azure.*too\s+many\s+requests/i,
    "An Azure quota or rate limit was exceeded. Request a quota increase in the Azure portal or implement retry with exponential back-off.",
  ],
  [
    /cosmosdb.*(?:rate\s+limit|request\s+unit|ru\/s)|too\s+many\s+requests.*cosmos/i,
    "Azure Cosmos DB request unit (RU/s) limit exceeded. Increase provisioned throughput or optimise queries to reduce RU consumption.",
  ],
  [
    /blob.*(?:not\s+found|access.*denied).*azure|azure.*storage/i,
    "An Azure Blob Storage error occurred. Check the container name, blob path, storage account key, and access tier.",
  ],
  [
    /azure.*keyvault|key\s+vault.*(?:secret|certificate|key).*not\s+found/i,
    "An Azure Key Vault error occurred. Verify the vault URI, secret name, and that the service principal has 'Get' permissions in the access policy.",
  ],

  // ── Concurrency & async patterns ──────────────────────────────────────
  [
    /race\s+condition|concurrent.*modification|data.*race/i,
    "A race condition was detected. Use mutexes, semaphores, or atomic operations to synchronise concurrent access to shared state.",
  ],
  [
    /deadlock.*detected|circular.*lock|lock.*order/i,
    "A deadlock was detected. Ensure locks are always acquired in the same order across all code paths and release locks promptly.",
  ],
  [
    /promise.*(?:concurrency|all.*reject)|p.limit.*error/i,
    "A concurrency control error occurred. Use a concurrency limiter (p-limit, bottleneck) to control the number of parallel Promises.",
  ],
  [
    /semaphore.*timeout|mutex.*(?:timeout|acquire)/i,
    "A semaphore or mutex acquisition timed out. The resource is contended — investigate long-held locks and add timeout handling.",
  ],
  [
    /event\s+loop\s+blocked|blocking.*async|sync.*in.*async/i,
    "The event loop is being blocked by a synchronous operation. Move CPU-intensive work to a Worker thread or use async alternatives.",
  ],

  // ── Transactions ──────────────────────────────────────────────────────
  [
    /transaction.*already.*(?:started|open|active)|nested.*transaction/i,
    "A transaction was started inside an already open transaction. Use savepoints for nested transactions or restructure to avoid nesting.",
  ],
  [
    /transaction.*(?:rolled\s+back|rollback)|abort.*transaction/i,
    "A database transaction was rolled back. Check the error that triggered the rollback, fix the underlying cause, and retry the operation.",
  ],
  [
    /transaction.*(?:not\s+started|no\s+active)|outside.*transaction/i,
    "An operation requiring a transaction was executed outside one. Wrap the operation in a transaction block.",
  ],
  [
    /optimistic.*lock.*(?:failed|conflict)|version.*mismatch.*entity/i,
    "An optimistic locking conflict occurred — the record was modified by another process. Re-fetch the latest data and retry the update.",
  ],
  [
    /two.phase\s+commit|distributed\s+transaction.*failed/i,
    "A distributed transaction or two-phase commit failed. Implement the Saga pattern or compensating transactions for cross-service consistency.",
  ],

  // ── Caching ───────────────────────────────────────────────────────────
  [
    /cache.*(?:miss|cold\s+start|invalidation\s+failed)/i,
    "A cache miss or invalidation issue occurred. Check the cache key strategy and TTL settings to improve hit rates.",
  ],
  [
    /stale.*cache|cache.*(?:expired|ttl)|cache.*poisoning/i,
    "A stale or potentially poisoned cache entry was detected. Validate cache data before use and ensure TTL values are appropriate.",
  ],
  [
    /cache.*memory.*(?:full|exceeded|limit)|eviction.*policy/i,
    "The cache is full and evicting entries. Increase cache size, reduce item TTL, or review the eviction policy (LRU, LFU, etc.).",
  ],
  [
    /thundering\s+herd|cache\s+stampede|dogpile/i,
    "A cache stampede (thundering herd) occurred. Use cache locking, probabilistic early expiration, or staggered TTLs to prevent simultaneous cache rebuilding.",
  ],

  // ── Pagination / cursor errors ────────────────────────────────────────
  [
    /cursor.*(?:invalid|expired|not\s+found)|invalid\s+page\s+token/i,
    "The pagination cursor is invalid or expired. Cursors are typically time-limited — restart pagination from the beginning if the cursor is no longer valid.",
  ],
  [
    /page.*(?:out\s+of\s+range|number.*negative)|offset.*negative/i,
    "An invalid page number or offset was provided. Page numbers must be ≥1 and offsets must be ≥0 — validate pagination parameters before querying.",
  ],
  [
    /limit.*(?:too\s+large|exceeds.*maximum)|max.*(?:results|items).*exceeded/i,
    "The requested page size exceeds the maximum limit. Reduce the limit parameter and use pagination to retrieve all results.",
  ],

  // ── Twilio / SMS / communication ──────────────────────────────────────
  [
    /twilio.*(?:auth|credentials|invalid\s+account)/i,
    "Twilio authentication failed. Verify the Account SID and Auth Token in the Twilio console and update your environment variables.",
  ],
  [
    /twilio.*(?:invalid\s+phone|number.*not\s+verified|21211|21608)/i,
    "An invalid or unverified phone number was used. Use E.164 format (+1234567890) and verify the number in your Twilio trial account.",
  ],
  [
    /sendgrid.*(?:unauthorized|api\s+key.*invalid)|twilio\s+sendgrid/i,
    "SendGrid authentication failed. Verify the API key has the correct permissions (Mail Send) and is not restricted by IP.",
  ],
  [
    /sendgrid.*(?:unsubscribed|bounced|spam)|email\s+suppression/i,
    "The email recipient is on a SendGrid suppression list (unsubscribed, bounced, or spam). Check SendGrid's Suppressions dashboard before sending.",
  ],

  // ── Observability (OpenTelemetry / Sentry) ────────────────────────────
  [
    /sentry.*(?:dsn.*invalid|not\s+initialised|dsn.*missing)/i,
    "Sentry is not properly initialised. Check the DSN value and ensure Sentry.init() is called before any other code.",
  ],
  [
    /opentelemetry.*(?:span|trace|exporter)\s+error/i,
    "An OpenTelemetry span or exporter error occurred. Check the collector endpoint, authentication headers, and that the OTLP exporter is configured correctly.",
  ],
  [
    /trace.*(?:context|propagation)|baggage.*invalid/i,
    "A distributed trace context propagation error occurred. Ensure trace context headers (traceparent, tracestate) are correctly forwarded between services.",
  ],

  // ── Serverless / cloud functions ──────────────────────────────────────
  [
    /function.*(?:cold\s+start|initialization.*timeout)|lambda.*init/i,
    "A serverless function cold start timed out. Reduce initialisation code, use provisioned concurrency, or keep functions warm with scheduled pings.",
  ],
  [
    /function.*memory.*exceeded|lambda.*memory\s+limit|cloud\s+function.*memory/i,
    "The serverless function exceeded its memory limit. Increase the function's memory allocation or optimise memory-heavy operations.",
  ],
  [
    /vercel.*(?:function.*timeout|serverless.*timeout)|function.*duration.*exceeded/i,
    "A Vercel/serverless function timed out. Move long-running operations to a background queue or increase the maxDuration setting.",
  ],
  [
    /cloud\s+run.*(?:timeout|container.*failed\s+to\s+start)|cloudrun/i,
    "A Google Cloud Run error occurred. Ensure the container starts within 60s, listens on the PORT env variable, and returns health check responses.",
  ],

  // ── HTTP client libraries (axios / got / node-fetch / ky) ────────────
  [
    /axios.*(?:network\s+error|err_network)|axioserror/i,
    "An Axios network error occurred. Check internet connectivity, the request URL, and CORS configuration. Inspect error.response for server-side details.",
  ],
  [
    /axios.*(?:timeout|etimedout|econnaborted)|timeout\s+of\s+\d+ms\s+exceeded/i,
    "An Axios request timed out. Increase the timeout option (axios.create({ timeout: 10000 })) or check server response time.",
  ],
  [
    /request\s+failed\s+with\s+status\s+code\s+\d+/i,
    "The HTTP request returned an error status. Check error.response.status and error.response.data for the server's error message.",
  ],
  [
    /got.*(?:timeoutoferror|requesterror|httperror)|got\s+http\s+error/i,
    "A 'got' HTTP client error occurred. Check the URL, timeout settings, and inspect error.response for the response body.",
  ],
  [
    /fetch.*(?:failed|aborted)|abortcontroller|aborted.*fetch/i,
    "A fetch request was aborted or failed. Check the AbortController signal, request URL, and network connectivity.",
  ],
  [
    /httperror.*statuscode|response.*(?:not\s+ok|non.2xx)/i,
    "An HTTP client received a non-2xx response. Check the response status and body for error details from the server.",
  ],
  [
    /node-fetch.*(?:error|failed)|cross-fetch/i,
    "A node-fetch error occurred. Verify the URL is correct, the server is reachable, and handle non-ok responses explicitly with response.ok.",
  ],
  [
    /interceptor.*(?:error|failed)|request.*interceptor/i,
    "An Axios/HTTP interceptor threw an error. Check the request and response interceptors for logic errors and ensure they call next() or return the value.",
  ],

  // ── Passport.js / authentication middleware ───────────────────────────
  [
    /passport.*(?:failed\s+to\s+serialize|failed\s+to\s+deserialize)/i,
    "Passport.js failed to serialize/deserialize the user. Check the serializeUser and deserializeUser callbacks and ensure the user ID is stored in session.",
  ],
  [
    /passport.*strategy.*(?:not\s+registered|unknown|failed)/i,
    "A Passport.js strategy is not registered. Call passport.use(new Strategy(...)) before using it, and verify the strategy name matches.",
  ],
  [
    /passport.*(?:authentication\s+failed|unauthorized|missing\s+credentials)/i,
    "Passport.js authentication failed. Check the strategy configuration, verify credentials, and ensure the callback handles failures with info messages.",
  ],
  [
    /session.*(?:not\s+found|destroyed|expired)|req\.session.*undefined/i,
    "The session was not found, destroyed, or expired. Ensure express-session is configured before passport.session(), and check session store connectivity.",
  ],

  // ── Multer / file upload middleware ───────────────────────────────────
  [
    /multer.*(?:unexpected\s+field|field.*not\s+allowed)/i,
    "Multer rejected a form field. Only fields declared in upload.fields() or upload.single() are accepted — check the field name in the form.",
  ],
  [
    /multer.*(?:limit|maxcount|maxfilesize|maxfieldsize)/i,
    "Multer limit exceeded. Adjust the limits option: multer({ limits: { fileSize: 10 * 1024 * 1024 } }).",
  ],
  [
    /multer.*(?:storage\s+engine|destination|filename)/i,
    "A Multer storage engine error occurred. Check diskStorage destination/filename callbacks for errors and ensure the target directory exists with write permissions.",
  ],

  // ── Webpack / Vite / esbuild / bundler ────────────────────────────────
  [
    /module\s+build\s+failed|webpack.*error|compilation\s+failed/i,
    "Webpack compilation failed. Check the error output for the specific file and loader, and ensure all loaders and plugins are correctly configured.",
  ],
  [
    /loader.*(?:not\s+found|missing)|no\s+loader\s+configured/i,
    "A Webpack loader is not configured for this file type. Add the appropriate loader rule in webpack.config.js (e.g. babel-loader for .js/.jsx).",
  ],
  [
    /chunk\s+load\s+(?:error|failed)|loading\s+chunk\s+\d+\s+failed/i,
    "A Webpack chunk failed to load. This is typically a network error or the chunk file was deleted after build. Reload the page or redeploy the build.",
  ],
  [
    /vite.*(?:failed\s+to\s+resolve|cannot\s+find\s+module|optimiz)/i,
    "A Vite module resolution error occurred. Check the import alias configuration in vite.config.ts and that all dependencies are installed.",
  ],
  [
    /vite.*(?:hmr|hot\s+module\s+replacement)/i,
    "Vite HMR (Hot Module Replacement) encountered an error. Check browser console for the specific error — you may need to do a full page reload.",
  ],
  [
    /esbuild.*(?:error|transform\s+failed|parse\s+error)/i,
    "esbuild failed to transform the file. Check for unsupported syntax, ensure the target platform is set correctly, and verify esbuild plugins.",
  ],
  [
    /rollup.*(?:error|failed\s+to\s+resolve|could\s+not\s+resolve)/i,
    "Rollup failed to bundle. Check external/output configuration, resolve path aliases, and ensure all imports can be found.",
  ],
  [
    /(?:tree.shaking|dead\s+code|side\s+effects).*warning/i,
    "A bundler tree-shaking warning was generated. Mark pure functions with /*#__PURE__*/ or configure sideEffects in package.json to enable safe tree-shaking.",
  ],

  // ── WebAssembly (WASM) ────────────────────────────────────────────────
  [
    /webassembly.*(?:compile\s+error|link\s+error|instantiate|import)/i,
    "A WebAssembly error occurred. Verify the .wasm file is not corrupted, the imports object matches the module's expected imports, and the runtime supports the WASM features used.",
  ],
  [
    /wasm.*(?:memory|grow|out\s+of\s+bounds|unreachable)/i,
    "A WASM runtime error occurred (trap). Check for out-of-bounds memory access, integer overflow, or unreachable instructions in the WASM module.",
  ],
  [
    /wasm.*(?:streaming|instantiatestreaming)|content-type.*wasm/i,
    "WebAssembly streaming compilation failed. The server must serve .wasm files with Content-Type: application/wasm for streaming instantiation to work.",
  ],

  // ── Native addons (node-gyp / napi) ──────────────────────────────────
  [
    /node-gyp|gyp.*(?:error|failed)|binding\.gyp/i,
    "A native addon (node-gyp) build failed. Install build tools: 'npm install --global node-gyp' and ensure Python 3 and a C++ compiler are available.",
  ],
  [
    /was\s+compiled\s+against\s+a\s+different\s+node\.js\s+version|napi.*version\s+mismatch/i,
    "A native addon was compiled for a different Node.js version. Rebuild it: 'npm rebuild' or delete node_modules and reinstall.",
  ],
  [
    /napi.*(?:error|failed)|node\s+api.*error/i,
    "A Node-API (N-API) error occurred. Check the addon version compatibility and ensure the N-API version matches the Node.js runtime.",
  ],

  // ── Playwright / browser automation ──────────────────────────────────
  [
    /playwright.*(?:browser.*not\s+found|executable.*not\s+found)/i,
    "Playwright cannot find the browser executable. Run 'npx playwright install' to download required browsers.",
  ],
  [
    /playwright.*(?:timeout|navigation.*timeout|waiting.*timeout)/i,
    "A Playwright operation timed out. Increase the timeout option, check that the page element exists, and use waitForSelector/waitForLoadState.",
  ],
  [
    /playwright.*(?:selector|locator).*(?:not\s+found|no\s+element)/i,
    "A Playwright selector matched no elements. Verify the selector string, check page state, and use page.waitForSelector() to wait for elements.",
  ],
  [
    /playwright.*(?:context|page).*(?:closed|destroyed)/i,
    "The Playwright page or browser context was closed. Ensure you are not reusing pages/contexts after they have been closed.",
  ],
  [
    /playwright.*(?:launch\s+failed|browser.*crash)/i,
    "Playwright failed to launch the browser. Check system resources, sandbox settings (--no-sandbox in CI), and that the browser binary is not corrupted.",
  ],

  // ── gRPC status codes (detailed) ─────────────────────────────────────
  [/grpc.*status.*0|grpc.*ok/i, "gRPC returned OK status — no action needed."],
  [
    /grpc.*status.*1|grpc.*cancelled/i,
    "The gRPC call was cancelled by the client. Handle cancellation gracefully on both client and server side.",
  ],
  [
    /grpc.*status.*3|grpc.*invalid_argument/i,
    "gRPC received an invalid argument. Validate all input fields before making the RPC call and check the protobuf field constraints.",
  ],
  [
    /grpc.*status.*5|grpc.*not_found/i,
    "The requested gRPC resource was not found. Verify resource identifiers and that the resource has been created.",
  ],
  [
    /grpc.*status.*6|grpc.*already_exists/i,
    "The gRPC resource already exists. Use an upsert operation or check for existence before creating.",
  ],
  [
    /grpc.*status.*8|grpc.*resource_exhausted/i,
    "gRPC resource exhausted (quota/rate limit). Implement retry with exponential back-off and respect server backpressure.",
  ],
  [
    /grpc.*status.*9|grpc.*failed_precondition/i,
    "gRPC precondition failed. The system is not in the required state for this operation. Check preconditions and retry after the state changes.",
  ],
  [
    /grpc.*status.*10|grpc.*aborted/i,
    "The gRPC operation was aborted (e.g. concurrency conflict). Retry the entire transaction after re-reading current state.",
  ],
  [
    /grpc.*status.*13|grpc.*internal/i,
    "A gRPC internal error occurred. Check server-side logs for the underlying exception and fix the server implementation.",
  ],
  [
    /grpc.*status.*16|grpc.*unauthenticated/i,
    "gRPC request is unauthenticated. Attach valid credentials or tokens to the call metadata.",
  ],

  // ── SSE (Server-Sent Events) ──────────────────────────────────────────
  [
    /(?:eventsource|sse).*(?:error|failed|closed)/i,
    "A Server-Sent Events connection error occurred. Check the endpoint URL, ensure the server sends valid 'data:' lines, and implement reconnection with the 'retry:' field.",
  ],
  [
    /content.type.*text\/event.stream|sse.*content.type/i,
    "The SSE endpoint is not returning Content-Type: text/event-stream. Ensure the server sets this header and does not compress SSE responses.",
  ],

  // ── CORS preflight ────────────────────────────────────────────────────
  [
    /preflight.*(?:failed|blocked|error)|options.*method.*blocked/i,
    "A CORS preflight OPTIONS request failed. Ensure the server handles OPTIONS requests and returns Access-Control-Allow-Methods and Access-Control-Allow-Headers.",
  ],
  [
    /access-control-allow-origin.*missing|cors.*header.*not\s+present/i,
    "The Access-Control-Allow-Origin header is missing from the response. Configure the server to include this header for the requesting origin.",
  ],
  [
    /cors.*credentials.*wildcard|withcredentials.*cors/i,
    "CORS credentials mode conflicts with a wildcard origin. When using withCredentials=true, set Access-Control-Allow-Origin to the specific origin and Access-Control-Allow-Credentials: true.",
  ],

  // ── HTTP/2 ────────────────────────────────────────────────────────────
  [
    /http2.*(?:stream\s+error|goaway|rst_stream|protocol\s+error)/i,
    "An HTTP/2 stream or protocol error occurred. Check for incompatible HTTP/2 settings, ensure TLS is configured correctly, and review the GOAWAY frame code.",
  ],
  [
    /http2.*(?:settings|handshake|alpn)/i,
    "An HTTP/2 settings or handshake error occurred. Ensure both client and server support HTTP/2, TLS 1.2+ is used, and ALPN negotiation succeeds.",
  ],
  [
    /h2c.*(?:upgrade|cleartext)|http.*upgrade.*h2/i,
    "An HTTP/2 cleartext (h2c) upgrade failed. Many servers only support HTTP/2 over TLS — use https:// or configure h2c support explicitly.",
  ],

  // ── WebAuthn / FIDO2 ─────────────────────────────────────────────────
  [
    /webauthn.*(?:not\s+supported|unavailable)|publickeycredential/i,
    "WebAuthn is not supported in this browser or context. Ensure the page is served over HTTPS and the browser supports the Web Authentication API.",
  ],
  [
    /webauthn.*(?:timeout|user.*cancelled|notallowederror)/i,
    "The WebAuthn operation was cancelled or timed out. The user dismissed the authenticator prompt — handle this gracefully with a retry option.",
  ],
  [
    /webauthn.*(?:attestation|verification\s+failed)|authenticator.*error/i,
    "WebAuthn attestation or verification failed. Check the expected origin, RP ID, and challenge match what was sent during registration.",
  ],
  [
    /credential.*(?:not\s+found|already\s+registered)|authenticator.*excluded/i,
    "A WebAuthn credential was not found or is already registered. Provide fallback authentication and handle credential management flows.",
  ],

  // ── Health checks / readiness ─────────────────────────────────────────
  [
    /health.*check.*(?:failed|timeout)|readiness.*probe|liveness.*(?:failed|timeout)/i,
    "A health check is failing. Verify the /health or /ready endpoint returns 200, check dependent service connectivity, and review application startup time.",
  ],
  [
    /dependency.*(?:unhealthy|down|unavailable).*health/i,
    "A health check dependency is unhealthy. Identify the failing dependency in the health response and restore it before serving traffic.",
  ],
  [
    /(?:startup|readiness).*timeout.*(?:exceeded|probe)|not\s+ready.*traffic/i,
    "The application is not ready to serve traffic. Check startup dependencies, increase the readiness probe timeout, or investigate slow initialisation.",
  ],

  // ── Graceful shutdown ─────────────────────────────────────────────────
  [
    /(?:graceful|clean)\s+shutdown.*(?:failed|timeout)|shutdown.*(?:timed\s+out|error)/i,
    "Graceful shutdown failed or timed out. Ensure all in-flight requests complete, close database pools, and deregister from service registries before process exit.",
  ],
  [
    /server.*close.*(?:timeout|failed)|http.*server.*not\s+stopping/i,
    "The HTTP server is not stopping cleanly. Use server.close() with a callback and force-close idle keep-alive connections after a timeout.",
  ],
  [
    /(?:drain|draining).*connections|waiting.*(?:requests|connections)\s+to\s+finish/i,
    "Connection draining is taking too long. Set a drain timeout and forcefully close connections that don't finish within the grace period.",
  ],

  // ── Circuit breaker ───────────────────────────────────────────────────
  [
    /circuit.*(?:breaker|open|half.open)|breaker.*(?:open|tripped)/i,
    "The circuit breaker is open — the downstream service is marked as unavailable. Wait for the half-open probe or implement fallback logic for degraded operation.",
  ],
  [
    /opossum.*(?:open|timeout|fallback)|brakes.*open/i,
    "An Opossum/Brakes circuit breaker triggered. Check the failing service and implement a fallback function to handle the open-circuit state.",
  ],
  [
    /failure\s+(?:threshold|rate).*exceeded|error\s+rate.*circuit/i,
    "The circuit breaker failure threshold was exceeded. Investigate the downstream service errors before the circuit can recover.",
  ],

  // ── Retry patterns ────────────────────────────────────────────────────
  [
    /max.*retries.*(?:exceeded|reached)|retry.*(?:limit|exhausted)/i,
    "Maximum retries have been exhausted. Implement proper back-off (exponential + jitter), log the final error, and alert if critical.",
  ],
  [
    /p.retry.*(?:failed|aborted)|async.retry.*failed/i,
    "A p-retry or async-retry operation failed after all attempts. Review the retry options (retries, minTimeout, maxTimeout) and the underlying error.",
  ],
  [
    /retry.*(?:after|delay)|backoff.*(?:exceeded|strategy)/i,
    "Retry back-off limit exceeded. Review back-off strategy (exponential, linear, fixed) and ensure Retry-After headers are respected.",
  ],
  [
    /idempotency.*(?:key|conflict|replay)/i,
    "An idempotency key conflict or replay issue occurred. Use unique, per-request idempotency keys and store processed key hashes to detect replays.",
  ],

  // ── Feature flags ─────────────────────────────────────────────────────
  [
    /launchdarkly.*(?:error|sdk.*not\s+initialised)|feature.*flag.*(?:error|unavailable)/i,
    "A LaunchDarkly SDK or feature flag error occurred. Check the SDK key, ensure the client is initialised with waitForInitialization(), and implement fallback default values.",
  ],
  [
    /unleash.*(?:error|unavailable|client.*not\s+ready)/i,
    "An Unleash feature flag error occurred. Verify the Unleash server URL, API token, and that the client is connected and the toggle names are correct.",
  ],
  [
    /flipt.*(?:error|flag.*not\s+found)|flagsmith.*error/i,
    "A feature flag service error occurred. Ensure the flag key is correct, the service is reachable, and implement default flag values for when the service is unavailable.",
  ],

  // ── Service mesh / sidecar ────────────────────────────────────────────
  [
    /istio.*(?:503|upstream\s+connect\s+error|reset\s+before\s+headers)/i,
    "An Istio service mesh error occurred. Check destination rules, virtual services, circuit breakers, and that the target service's pods are healthy.",
  ],
  [
    /envoy.*(?:upstream\s+reset|no\s+healthy\s+upstream|connect\s+error)/i,
    "An Envoy proxy upstream error occurred. Verify the upstream cluster health, check load balancing policies, and review Envoy access logs.",
  ],
  [
    /linkerd.*(?:error|gateway\s+timeout)|service\s+mesh.*error/i,
    "A Linkerd service mesh error occurred. Run 'linkerd check' to verify the mesh health and inspect the proxy logs on the failing pod.",
  ],

  // ── API Gateway ───────────────────────────────────────────────────────
  [
    /api\s+gateway.*(?:timeout|error|throttled)|aws\s+api\s+gateway.*error/i,
    "An API Gateway error occurred. Check the integration response mapping, Lambda function logs, and gateway timeout settings (default 29s for AWS).",
  ],
  [
    /kong.*(?:plugin\s+error|upstream\s+error|rate\s+limit)/i,
    "A Kong API Gateway error occurred. Check the Kong plugin configuration, upstream service availability, and gateway logs.",
  ],
  [
    /apigee.*error|azure\s+api\s+management.*error/i,
    "An API management gateway error occurred. Review the policy configuration, backend service health, and gateway analytics for error patterns.",
  ],

  // ── Logging infrastructure ────────────────────────────────────────────
  [
    /winston.*(?:error|transport\s+failed)|pino.*error/i,
    "A Winston/Pino logger transport error occurred. Check the log transport configuration (file paths, HTTP endpoints) and ensure destinations are writable.",
  ],
  [
    /log.*(?:rotation\s+failed|file.*full|appender.*error)/i,
    "Log rotation or log file write failed. Check disk space, file permissions, and the log rotation configuration (max size/age).",
  ],
  [
    /(?:datadog|newrelic|dynatrace).*(?:agent|collector).*(?:error|unreachable)/i,
    "An APM agent or collector is unreachable. Verify the agent configuration, API key, and network connectivity to the APM endpoint.",
  ],

  // ── Fastify specific ──────────────────────────────────────────────────
  [
    /fastify.*(?:schema.*validation|ajv.*error)|route.*schema.*invalid/i,
    "A Fastify schema validation error occurred. Verify the request body/params/query schema matches the incoming data, and check AJV keyword usage.",
  ],
  [
    /fastify.*(?:plugin.*not\s+registered|dependency.*not\s+met)/i,
    "A Fastify plugin dependency is not satisfied. Check plugin registration order and ensure dependencies are declared in the plugin's fastify-plugin options.",
  ],
  [
    /fastify.*(?:reply.*already\s+sent|duplicate.*send)/i,
    "A Fastify reply was already sent. Ensure only one reply.send() is called per request — use early returns to prevent multiple sends.",
  ],
  [
    /fastify.*(?:route.*conflict|duplicate.*route)/i,
    "A duplicate Fastify route was registered. Check for conflicting route paths and ensure dynamic parameters don't collide with static routes.",
  ],

  // ── NestJS specific ───────────────────────────────────────────────────
  [
    /nestjs.*(?:circular\s+dependency|circular\s+reference)|cannot\s+resolve.*provider/i,
    "A NestJS circular dependency was detected. Use forwardRef(() => ModuleClass) on both sides of the circular dependency to resolve it.",
  ],
  [
    /nest.*provider.*not\s+found|dependency.*injection.*failed|no\s+provider/i,
    "A NestJS dependency injection error occurred. Ensure the provider is declared in the module's providers array and exported if used in another module.",
  ],
  [
    /nest.*(?:pipe|guard|interceptor|filter).*error/i,
    "A NestJS pipe, guard, interceptor, or exception filter threw an error. Check the implementation and ensure it handles edge cases and returns the correct types.",
  ],
  [
    /typeorm.*entity.*not\s+found\s+in\s+connection|repository.*not\s+found/i,
    "A TypeORM entity is not registered. Add it to the entities array in the TypeORM connection configuration or module forFeature() call.",
  ],

  // ── tRPC specific ─────────────────────────────────────────────────────
  [
    /trpc.*(?:procedure.*not\s+found|no\s+procedure)/i,
    "A tRPC procedure was not found. Verify the procedure name matches the router definition and the router is correctly mounted.",
  ],
  [
    /trpc.*(?:input.*parse\s+error|zod.*trpc)|trpc.*validation/i,
    "A tRPC input validation error occurred. The client input does not match the procedure's Zod schema — check the input types on both client and server.",
  ],
  [
    /trpc.*(?:unauthorized|context.*failed)|trpc.*middleware.*error/i,
    "A tRPC authorization or middleware error occurred. Check the procedure's middleware chain and ensure the context is populated correctly.",
  ],

  // ── Drizzle ORM ───────────────────────────────────────────────────────
  [
    /drizzle.*(?:schema|migration|push\s+failed)/i,
    "A Drizzle ORM schema or migration error occurred. Run 'npx drizzle-kit push' or 'npx drizzle-kit migrate' and check the schema definition.",
  ],
  [
    /drizzle.*(?:query.*error|relation.*not\s+found)/i,
    "A Drizzle ORM query error occurred. Verify the table and column names match the schema, and that relations are defined using Drizzle's relational query API.",
  ],

  // ── Zod / Yup / Joi (detailed) ────────────────────────────────────────
  [
    /zod.*(?:invalid_type|expected.*received)|z\..*error/i,
    "A Zod type validation error occurred. The actual type doesn't match the expected schema type. Check the schema definition and input data types.",
  ],
  [
    /zod.*(?:too_small|too_big|invalid_string|invalid_enum)/i,
    "A Zod constraint validation error occurred. Check min/max, regex, and enum constraints in the Zod schema against the input value.",
  ],
  [
    /yup.*(?:validationerror|at\s+\w+\s+\[|is\s+a\s+required\s+field)/i,
    "A Yup validation error occurred. Inspect error.inner for nested errors and error.path to identify the failing field.",
  ],
  [
    /joi.*(?:validationerror|\\"[^"]+\\"\s+is\s+required|fails\s+to\s+pass)/i,
    "A Joi validation error occurred. Check error.details for per-field failure messages and align the input with the schema's constraints.",
  ],
  [
    /ajv.*(?:validation\s+failed|schema.*invalid|keyword.*error)/i,
    "An AJV JSON Schema validation error occurred. Check the schema definition and input data. Use ajv.errors to inspect individual failures.",
  ],

  // ── Deno / Bun runtime ────────────────────────────────────────────────
  [
    /deno.*(?:permission\s+denied|--allow-|access.*denied)/i,
    "Deno permission denied. Grant the required permission flag: --allow-net, --allow-read, --allow-write, --allow-env, etc.",
  ],
  [
    /deno.*(?:module.*not\s+found|import.*error|specifier)/i,
    "A Deno module import error occurred. Use absolute URLs or import maps for dependencies. Run 'deno cache' to pre-cache imports.",
  ],
  [
    /bun.*(?:install\s+failed|lockfile|resolution\s+failed)/i,
    "A Bun package installation error occurred. Run 'bun install --frozen-lockfile' or delete bun.lockb and reinstall.",
  ],
  [
    /bun.*(?:run\s+failed|script.*error)|bunx.*error/i,
    "A Bun script execution error occurred. Check the script in package.json and ensure the entry file exists and is syntactically valid.",
  ],

  // ── TypeORM specific ──────────────────────────────────────────────────
  [
    /typeorm.*(?:connection.*not\s+established|no\s+connection)/i,
    "TypeORM has no active database connection. Ensure DataSource.initialize() resolves successfully before running queries.",
  ],
  [
    /typeorm.*(?:migration.*error|pending\s+migration)/i,
    "A TypeORM migration error occurred. Run 'typeorm migration:run' and inspect migration files for SQL syntax errors.",
  ],
  [
    /typeorm.*(?:metadata.*not\s+found|entity.*not\s+decorated)/i,
    "TypeORM cannot find entity metadata. Ensure all entities are decorated with @Entity() and listed in the DataSource entities configuration.",
  ],
  [
    /typeorm.*(?:query\s+failed|query\s+runner)/i,
    "A TypeORM query runner error occurred. Check the SQL query, database connection state, and ensure the query runner is released after use.",
  ],

  // ── bcrypt / argon2 / password hashing ───────────────────────────────
  [
    /bcrypt.*(?:error|invalid\s+salt|rounds)|bcryptjs.*error/i,
    "A bcrypt error occurred. Ensure the salt rounds are a positive integer (10-12 recommended) and the input is a string, not a Buffer.",
  ],
  [
    /argon2.*(?:error|invalid\s+parameter|memory\s+cost)/i,
    "An Argon2 hashing error occurred. Check memory cost, time cost, and parallelism parameters. Minimum memory is 8 KiB per thread.",
  ],
  [
    /password.*(?:hash\s+failed|verify\s+failed|invalid\s+hash)/i,
    "Password hashing or verification failed. Ensure you are passing a string, not undefined/null, and that the hash was generated by the same algorithm.",
  ],

  // ── Stripe (extended) ─────────────────────────────────────────────────
  [
    /stripe.*incorrect_cvc|stripe.*cvc.*(?:error|invalid)/i,
    "The Stripe card CVC is incorrect. Inform the user to re-enter their card details with the correct security code.",
  ],
  [
    /stripe.*do_not_honor|stripe.*generic_decline/i,
    "The Stripe payment was generically declined by the issuing bank. Ask the user to contact their bank or try a different card.",
  ],
  [
    /stripe.*webhook.*(?:signature|event)|stripe-signature/i,
    "A Stripe webhook signature verification failed. Compute the signature using the webhook secret and the raw request body (not parsed JSON).",
  ],

  // ── PayPal / payments ─────────────────────────────────────────────────
  [
    /paypal.*(?:error|invalid\s+token|unauthorized|access_token)/i,
    "A PayPal API error occurred. Check the client ID and secret, ensure you are using the correct sandbox/live environment, and refresh the access token.",
  ],
  [
    /paypal.*(?:order.*failed|capture.*failed|instrument.*declined)/i,
    "A PayPal payment capture failed. The buyer's payment instrument was declined — handle INSTRUMENT_DECLINED by prompting the buyer to retry.",
  ],

  // ── Remix specific ────────────────────────────────────────────────────
  [
    /remix.*loader.*(?:error|failed|throw)|loader.*returned.*(?:null|undefined)/i,
    "A Remix loader threw or returned an invalid value. Loaders must return a Response, plain object, or throw a Response — never return undefined.",
  ],
  [
    /remix.*action.*(?:error|failed)|action.*validation/i,
    "A Remix action failed. Ensure the action returns a Response or redirect(), handles validation errors with json({ errors }), and always returns a value.",
  ],
  [
    /remix.*errorboundary|caught.*response.*remix/i,
    "A Remix ErrorBoundary or CatchBoundary was triggered. Export an ErrorBoundary component from the route to handle loader/action errors gracefully.",
  ],
  [
    /remix.*hydration|@remix-run.*error/i,
    "A Remix hydration error occurred. Ensure loader data is serialisable (no Date/Map/Set without custom serialisation) and server/client rendering is consistent.",
  ],

  // ── SvelteKit specific ────────────────────────────────────────────────
  [
    /sveltekit.*load.*(?:error|failed)|svelte.*load\s+function/i,
    "A SvelteKit load function failed. Return { status, error } or throw error(statusCode, message) to handle errors in +page.server.ts load functions.",
  ],
  [
    /sveltekit.*(?:hooks|handle).*error|svelte.*handle.*request/i,
    "A SvelteKit hooks.server.ts handle function threw. Check the handleError hook and ensure it returns a structured error object.",
  ],
  [
    /sveltekit.*endpoint.*(?:error|invalid\s+response)|svelte.*server.*route/i,
    "A SvelteKit API endpoint error occurred. Ensure the +server.ts handler returns a Response object and handles all HTTP methods.",
  ],
  [
    /vite.*svelte|svelte.*(?:compile\s+error|preprocessor)/i,
    "A Svelte compilation or preprocessor error occurred. Check the component syntax, ensure preprocessors (sass, typescript) are configured in svelte.config.js.",
  ],

  // ── Angular specific ──────────────────────────────────────────────────
  [
    /ng.*(?:module\s+not\s+found|no\s+provider\s+for|nullinjectorerror)/i,
    "Angular dependency injection failed — no provider for this token. Add the service to the providers array or use providedIn: 'root' in the @Injectable decorator.",
  ],
  [
    /expressionchangedafterithasbeencheckederror/i,
    "An Angular ExpressionChangedAfterItHasBeenCheckedError occurred. Avoid changing data bindings in lifecycle hooks — use ChangeDetectorRef.detectChanges() if needed.",
  ],
  [
    /angular.*(?:module.*already\s+loaded|lazy.*load\s+error)|ng.*chunk/i,
    "An Angular lazy-loaded module error occurred. Check the loadChildren path, ensure the module exists, and that the Router is configured correctly.",
  ],
  [
    /angular.*(?:httpclient|httpresponse).*error|http.*interceptor.*angular/i,
    "An Angular HttpClient error occurred. Inspect the HttpErrorResponse for status/error details and handle errors in the interceptor or service.",
  ],
  [
    /angular.*reactive\s+form|formcontrol.*(?:invalid|null)|validators.*angular/i,
    "An Angular Reactive Form validation error occurred. Check the FormControl validators, use form.valid before submission, and display error messages via form.get('field').errors.",
  ],
  [
    /angular.*change\s+detection|detectchanges.*error/i,
    "An Angular change detection error occurred. If using OnPush strategy, manually call ChangeDetectorRef.markForCheck() when data changes outside the zone.",
  ],

  // ── Electron specific ─────────────────────────────────────────────────
  [
    /electron.*(?:ipc|ipcmain|ipcrenderer).*(?:error|failed)/i,
    "An Electron IPC error occurred. Check ipcMain.handle/on and ipcRenderer.invoke/send call names match exactly, and that the handler returns a value.",
  ],
  [
    /electron.*(?:main\s+process\s+crash|renderer.*crash)|electron.*uncaught/i,
    "An Electron process crashed. Check the crashReporter output and add process.on('uncaughtException') in the main process for error recovery.",
  ],
  [
    /electron.*(?:content\s+security\s+policy|csp.*electron|node\s+integration)/i,
    "An Electron CSP or node integration error occurred. Disable nodeIntegration in webPreferences and use contextBridge to expose safe APIs to the renderer.",
  ],
  [
    /electron.*(?:autoupdate|squirrel|update.*error)/i,
    "An Electron auto-update error occurred. Check the update feed URL, verify code signing, and handle autoUpdater error events gracefully.",
  ],
  [
    /electron.*(?:dialog|notification|tray).*error/i,
    "An Electron native UI element error occurred. Ensure these APIs are called from the main process, not the renderer, unless using contextBridge.",
  ],

  // ── Tauri specific ────────────────────────────────────────────────────
  [
    /tauri.*(?:command.*error|invoke.*failed)|tauri.*not\s+allowed/i,
    "A Tauri command invocation failed. Check the Rust command handler signature, ensure the command is registered in tauri.conf.json allowlist, and inspect Rust error output.",
  ],
  [
    /tauri.*(?:allowlist|capability|permission\s+denied)/i,
    "A Tauri permission or allowlist error occurred. Enable the required API in tauri.conf.json under allowlist or update the capability permissions.",
  ],
  [
    /tauri.*(?:build.*failed|bundle.*error)|cargo.*tauri/i,
    "A Tauri build failed. Run 'cargo tauri build' for detailed Rust compilation errors. Check Rust toolchain version and Cargo.toml dependencies.",
  ],

  // ── Cloudflare Workers / KV / D1 ─────────────────────────────────────
  [
    /cloudflare.*worker.*(?:error|exceeded\s+cpu|exceeded\s+memory)/i,
    "A Cloudflare Worker error occurred. Check CPU time limits (10ms free/50ms paid), memory limits (128MB), and use wrangler tail to stream live logs.",
  ],
  [
    /cloudflare.*kv.*(?:not\s+found|error|limit)|kv.*namespace/i,
    "A Cloudflare KV error occurred. Verify the binding name in wrangler.toml matches the Worker code, and check KV namespace IDs.",
  ],
  [
    /cloudflare.*d1.*(?:error|query.*failed)|d1.*database/i,
    "A Cloudflare D1 database error occurred. Check the SQL syntax, ensure the D1 binding is configured in wrangler.toml, and use wrangler d1 execute to test queries.",
  ],
  [
    /cloudflare.*r2.*(?:error|not\s+found|access\s+denied)/i,
    "A Cloudflare R2 storage error occurred. Verify the bucket name, access keys, and S3-compatible endpoint configuration.",
  ],
  [
    /wrangler.*(?:error|deploy.*failed|login)/i,
    "A Wrangler CLI error occurred. Run 'wrangler login' to authenticate, check wrangler.toml for syntax errors, and verify your Cloudflare account permissions.",
  ],

  // ── Supabase ──────────────────────────────────────────────────────────
  [
    /supabase.*(?:error|auth.*failed|policy\s+violation)/i,
    "A Supabase error occurred. Check Row Level Security (RLS) policies, ensure the user is authenticated, and verify the table permissions.",
  ],
  [
    /supabase.*(?:realtime|subscription).*error/i,
    "A Supabase Realtime subscription error occurred. Verify the table has replication enabled and that the subscription filter is valid.",
  ],
  [
    /supabase.*(?:storage.*error|bucket.*not\s+found)/i,
    "A Supabase Storage error occurred. Check the bucket name, storage policies, and that the file path does not contain illegal characters.",
  ],
  [
    /supabase.*(?:edge\s+function|invoke.*error)/i,
    "A Supabase Edge Function error occurred. Check the function logs in the Supabase dashboard and verify the function is deployed and healthy.",
  ],

  // ── PlanetScale / Neon / Turso ────────────────────────────────────────
  [
    /planetscale.*(?:error|branch.*not\s+found|deploy\s+request)/i,
    "A PlanetScale error occurred. Check the database branch name, connection string, and ensure the branch is not in a read-only deploy request state.",
  ],
  [
    /neondb.*(?:error|endpoint.*not\s+found)|neon.*connection/i,
    "A Neon serverless Postgres error occurred. Check the connection string, ensure the project/branch is active (may be suspended), and use @neondatabase/serverless for edge runtimes.",
  ],
  [
    /turso.*(?:error|libsql.*error)|libsql.*(?:connection|auth)/i,
    "A Turso/libSQL error occurred. Verify the database URL (libsql://...) and authentication token, and check that the database is not suspended.",
  ],
  [
    /xata.*(?:error|record.*not\s+found)|xata.*api/i,
    "A Xata database error occurred. Check the workspace, database, and branch names, and verify the API key has the correct permissions.",
  ],

  // ── React Native / Expo ───────────────────────────────────────────────
  [
    /react\s+native.*(?:bridge\s+error|native\s+module.*not\s+found)/i,
    "A React Native native module or bridge error occurred. Ensure the native module is linked (npx pod-install for iOS), and rebuild the native app after adding new native dependencies.",
  ],
  [
    /expo.*(?:error|module.*not\s+found|sdk.*incompatible)/i,
    "An Expo error occurred. Check Expo SDK version compatibility, run 'expo doctor' for diagnostics, and ensure all packages are compatible with the installed Expo SDK.",
  ],
  [
    /metro.*bundler.*error|react\s+native.*bundle\s+failed/i,
    "A Metro bundler error occurred. Clear the cache with 'npx react-native start --reset-cache' or 'expo start -c' and check the import paths.",
  ],
  [
    /react\s+native.*(?:red\s+screen|error.*boundary|fatal\s+error)/i,
    "A React Native fatal error occurred (red screen). Add an error boundary component and use react-native-error-boundary for production crash handling.",
  ],
  [
    /android.*(?:build\s+failed|gradle.*error)|ios.*(?:build\s+failed|xcode.*error)/i,
    "A native mobile build failed. Check Gradle/Xcode build logs, ensure native dependencies are installed, and verify environment variables (ANDROID_HOME, JAVA_HOME).",
  ],

  // ── Internationalisation (i18n) ───────────────────────────────────────
  [
    /i18next.*(?:missing\s+key|key\s+not\s+found|translation.*missing)/i,
    "An i18next translation key is missing. Add the key to the translation file or configure a fallback language with fallbackLng option.",
  ],
  [
    /intl.*(?:error|format.*failed|unsupported.*locale)|locale.*not\s+found/i,
    "An Intl API or locale error occurred. Verify the locale string is a valid BCP 47 tag (e.g. 'en-US') and that the locale data is available in the runtime.",
  ],
  [
    /pluralisation\s+error|plural.*form.*missing|i18n.*plural/i,
    "A pluralisation rule is missing. Define plural forms for the locale using the correct plural category keys (zero, one, two, few, many, other).",
  ],
  [
    /react-i18next|next-intl|vue-i18n.*error/i,
    "An i18n framework error occurred. Check the provider configuration, translation file loading, and that the language code matches the available locales.",
  ],

  // ── Accessibility (a11y) ──────────────────────────────────────────────
  [
    /aria.*(?:invalid|required|expanded|role)|axe.*(?:violation|error)/i,
    "An accessibility (ARIA) violation was detected. Check that ARIA roles, states, and properties are used correctly. Use axe DevTools to identify and fix violations.",
  ],
  [
    /focus.*(?:trap.*error|management.*failed)|focusable.*element/i,
    "A focus management error occurred. Ensure interactive elements are focusable, focus traps are properly implemented, and keyboard navigation is functional.",
  ],

  // ── Worker Threads (advanced) ─────────────────────────────────────────
  [
    /worker.*(?:not\s+started|already\s+stopped|exit\s+code\s+[^0])/i,
    "A Worker thread exited with an error. Check the worker script for uncaught exceptions and ensure the worker emits 'error' events for the parent to handle.",
  ],
  [
    /postmessage.*(?:not\s+serializable|could\s+not\s+be\s+cloned)|structuredclone.*error/i,
    "The data passed to a Worker via postMessage is not serialisable. Remove functions, Promises, and non-transferable objects — only send structured-cloneable data.",
  ],
  [
    /sharedarraybuffer.*(?:not\s+allowed|cross-origin|error)|atomics.*error/i,
    "SharedArrayBuffer requires cross-origin isolation. Set COOP and COEP headers: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp.",
  ],
  [
    /worker.*(?:memory\s+limit|resourcelimitexceeded|heap)/i,
    "A Worker thread exceeded memory limits. Increase resourceLimits.maxOldGenerationSizeMb in the Worker constructor options.",
  ],

  // ── AsyncLocalStorage / AsyncContext ─────────────────────────────────
  [
    /asynclocalstorage.*(?:error|not\s+available)|async_hooks.*error/i,
    "An AsyncLocalStorage error occurred. Ensure Node.js ≥16 is used, the store is initialised with run(), and values are accessed inside the async context.",
  ],
  [
    /async\s+context.*(?:lost|not\s+found)|context.*not\s+propagated/i,
    "Async context was lost. Avoid manual Promise construction that breaks async context propagation — use async/await or maintain the context with AsyncLocalStorage.run().",
  ],

  // ── Performance API / profiling ───────────────────────────────────────
  [
    /performance\.mark.*(?:error|already\s+exists)|performance\.measure.*failed/i,
    "A Performance API error occurred. Ensure marks are created before calling measure(), and use unique mark names to avoid conflicts.",
  ],
  [
    /(?:memory\s+leak|heap\s+snapshot|allocation\s+profile)/i,
    "A memory leak or excessive allocation was detected. Take heap snapshots with Node.js inspector, profile with --expose-gc, and identify retained object roots.",
  ],
  [
    /perf_hooks.*observer|performanceobserver.*error/i,
    "A PerformanceObserver error occurred. Check the observed entry types are valid and the observer is disconnected when no longer needed.",
  ],

  // ── Source maps ───────────────────────────────────────────────────────
  [
    /source\s+map.*(?:error|invalid|not\s+found|parse\s+failed)/i,
    "A source map error occurred. Regenerate source maps by rebuilding the project. Ensure source-map-support is initialised before any code runs.",
  ],
  [
    /originalposition.*error|sourcemap.*(?:missing|corrupt|version)/i,
    "Source map position lookup failed. The source map may be outdated or corrupt. Delete dist/ and rebuild to generate fresh source maps.",
  ],

  // ── V8 / runtime flags ────────────────────────────────────────────────
  [
    /--max-old-space-size|v8.*heap.*size|heap.*size.*exceeded/i,
    "V8 heap size exceeded. Increase memory with NODE_OPTIONS='--max-old-space-size=4096' and profile with --inspect to find memory leaks.",
  ],
  [
    /v8.*(?:stack\s+size|call\s+stack\s+size)|--stack-size/i,
    "V8 stack size exceeded. Increase with --stack-size=65536 or convert deep recursion to an iterative algorithm.",
  ],
  [
    /v8.*serializ|v8.*deserializ/i,
    "A V8 serialisation error occurred. Only structured-cloneable values can be serialised. Remove functions, Symbols, and prototype chains from the object.",
  ],
  [
    /harmony.*flag|--experimental\s+flag|unknown\s+v8\s+option/i,
    "An unknown or experimental V8/Node.js flag was used. Check the Node.js version supports this flag with 'node --v8-options' or remove deprecated flags.",
  ],

  // ── Network partition / split-brain ───────────────────────────────────
  [
    /split.brain|network\s+partition|cluster.*split/i,
    "A network partition or split-brain condition was detected. Implement quorum-based consensus and handle partition scenarios with PACELC tradeoffs in mind.",
  ],
  [
    /(?:leader|primary).*(?:election|failover)|replica.*promotion/i,
    "A database leader election or failover occurred. Retry the operation after the new primary is elected and connections re-established.",
  ],
  [
    /replication.*(?:lag|behind|delay)|replica.*stale/i,
    "A database replica is lagging behind. Route read queries to the primary if strong consistency is required, or increase replication capacity.",
  ],

  // ── Content negotiation ───────────────────────────────────────────────
  [
    /406\s+not\s+acceptable|accept.*header.*mismatch|content\s+negotiation/i,
    "Content negotiation failed (406). Ensure the Accept header matches the server's supported Content-Types, or set Accept: */* for flexibility.",
  ],
  [
    /415\s+unsupported\s+media\s+type|content.type.*not\s+supported/i,
    "Unsupported Media Type (415). Set the correct Content-Type header (e.g. application/json) to match the API's expected format.",
  ],

  // ── Streaming / chunked transfer ──────────────────────────────────────
  [
    /chunked.*(?:encoding\s+error|transfer\s+failed)|transfer.encoding.*invalid/i,
    "A chunked transfer encoding error occurred. Check that the response stream is properly terminated and no extra data is written after the final chunk.",
  ],
  [
    /(?:readable|writable|transform)\s+stream.*(?:error|destroyed|aborted)/i,
    "A Node.js stream error occurred. Handle 'error' events on all streams, pipe with error propagation (stream.pipeline), and check stream state before writing.",
  ],
  [
    /backpressure|highwatermark|stream.*drain/i,
    "Stream backpressure detected — the write buffer is full. Wait for the 'drain' event before writing more data, or use stream.pipeline() which handles backpressure automatically.",
  ],
  [
    /multistream|parallel.*stream|stream.*merge/i,
    "A multi-stream merge or parallel stream error occurred. Use stream.PassThrough or the 'merge2' library and ensure all source streams handle errors independently.",
  ],

  // ── Prisma extended (P2xxx errors) ───────────────────────────────────
  [
    /prisma.*p2000|value.*too\s+long.*field/i,
    "Prisma P2000: The value is too long for the column. Increase the column size in the schema or truncate the input value.",
  ],
  [
    /prisma.*p2001|record.*does\s+not\s+exist.*search/i,
    "Prisma P2001: The record does not exist for the search criteria. Verify the where clause values are correct.",
  ],
  [
    /prisma.*p2011|null\s+constraint\s+violation/i,
    "Prisma P2011: A NULL constraint was violated. The field is required — ensure the value is not null/undefined before saving.",
  ],
  [
    /prisma.*p2014|relation.*required|required.*relation.*missing/i,
    "Prisma P2014: A required relation does not exist. Ensure the related record is created before creating the dependent record.",
  ],
  [
    /prisma.*p2021|table.*not\s+exist.*current.*database/i,
    "Prisma P2021: The table does not exist. Run 'npx prisma migrate deploy' to apply pending migrations.",
  ],

  // ── Datadog / New Relic / Dynatrace APM ───────────────────────────────
  [
    /datadog.*(?:agent.*not\s+running|api\s+key.*invalid|trace.*failed)/i,
    "A Datadog APM error occurred. Check the DD_API_KEY, ensure the Datadog Agent is running (datadog-agent status), and verify the tracing library is initialised before other requires.",
  ],
  [
    /new\s+relic.*(?:license.*key|agent.*error|transaction.*error)/i,
    "A New Relic agent error occurred. Verify the license key, ensure 'newrelic' is required as the first module, and check newrelic_agent.log for errors.",
  ],

  // ── Next.js App Router specific ───────────────────────────────────────
  [
    /next.*server\s+component.*(?:error|client\s+component)/i,
    "A Next.js Server Component error occurred. Server Components cannot use useState, useEffect, or browser APIs — move client-side logic to a Client Component with 'use client'.",
  ],
  [
    /next.*(?:not-found|notfound).*throw|next.*redirect.*error/i,
    "A Next.js notFound() or redirect() was called outside a Server Component or Route Handler. These functions can only be called in Server Components, Route Handlers, and Server Actions.",
  ],
  [
    /next.*server\s+action.*(?:error|failed)|use\s+server.*error/i,
    "A Next.js Server Action failed. Ensure 'use server' is at the top of the file, the function is async, and errors are handled with try/catch returning structured error objects.",
  ],
  [
    /next.*middleware.*(?:error|failed)|matcher.*config/i,
    "A Next.js middleware error occurred. Middleware runs on the Edge Runtime — it cannot use Node.js APIs. Check the matcher config and use only Web APIs.",
  ],
  [
    /next.*image.*(?:error|domain.*not\s+allowed|unoptimized)/i,
    "A Next.js Image error occurred. Add the image hostname to the remotePatterns config in next.config.js and ensure the image URL is accessible.",
  ],

  // ── Solid.js / Qwik / Astro ──────────────────────────────────────────
  [
    /solid.*(?:store.*error|createSignal.*error|createEffect.*error)/i,
    "A SolidJS reactivity error occurred. Ensure signals are read inside reactive contexts (JSX, createEffect, createMemo) and not at the top level of non-reactive code.",
  ],
  [
    /solid.*(?:hydration|mismatch|ssr.*error)/i,
    "A SolidJS SSR or hydration error occurred. Ensure server-rendered and client-rendered output is identical — avoid browser-only globals during SSR.",
  ],
  [
    /qwik.*(?:serializ|deserializ|lazy.*error)|qwikloader.*error/i,
    "A Qwik serialisation error occurred. Qwik serialises component state to HTML — ensure all state values are JSON-serialisable and closures don't capture non-serialisable values.",
  ],
  [
    /qwik.*(?:optimizer|vite.*plugin|transform.*error)/i,
    "A Qwik Optimizer error occurred. Check that the Qwik Vite plugin is configured correctly and that dollar-sign naming conventions ($) are used for lazy-loadable code.",
  ],
  [
    /astro.*(?:build.*error|integration.*error|component.*error)/i,
    "An Astro build or integration error occurred. Run 'astro build' with --verbose for details, check integration configuration in astro.config.mjs, and verify component imports.",
  ],
  [
    /astro.*(?:content.*collection|getCollection|schema.*zod)/i,
    "An Astro Content Collections error occurred. Verify the collection schema in config.ts matches the frontmatter in your content files.",
  ],
  [
    /astro.*(?:endpoint.*error|api\s+route.*astro)|\.astro.*server/i,
    "An Astro API endpoint or SSR error occurred. Ensure the endpoint exports GET/POST etc. handler functions and returns a Response object.",
  ],

  // ── Nuxt specific ─────────────────────────────────────────────────────
  [
    /nuxt.*(?:usefetch.*error|useasyncdata.*error)|nuxt.*data.*fetch/i,
    "A Nuxt useFetch/useAsyncData error occurred. Add error handling: const { data, error } = await useFetch(...) and check error.value for details.",
  ],
  [
    /nuxt.*(?:module.*error|plugin.*error)|nuxt\.config.*error/i,
    "A Nuxt module or plugin error occurred. Check nuxt.config.ts for syntax errors and verify that all listed modules/plugins are installed.",
  ],
  [
    /nuxt.*(?:server\s+route|server\/api)|nuxt.*middleware/i,
    "A Nuxt server route or middleware error occurred. Ensure event handlers in server/api/ return data or use createError() for proper error responses.",
  ],
  [
    /nuxt.*(?:build.*failed|nitro.*error|nitro.*build)/i,
    "A Nuxt/Nitro build error occurred. Check the Nitro server configuration, ensure preset is correct for your deployment target, and look for incompatible modules.",
  ],

  // ── Hono / Elysia / Bun HTTP ──────────────────────────────────────────
  [
    /hono.*(?:error|not\s+found|method\s+not\s+allowed)/i,
    "A Hono HTTP framework error occurred. Check route definitions, ensure HTTP methods match, and add a global error handler with app.onError().",
  ],
  [
    /elysia.*(?:error|validation|parse.*body)/i,
    "An Elysia framework error occurred. Check the route schema definitions, body validation rules, and add error handling with .onError().",
  ],
  [
    /bun.*(?:serve.*error|http.*server.*bun|fetch.*handler)/i,
    "A Bun HTTP server error occurred. Check the fetch handler in Bun.serve(), ensure it always returns a Response object, and verify port availability.",
  ],

  // ── SQLite / better-sqlite3 / libsql ──────────────────────────────────
  [
    /better.sqlite3.*(?:error|database.*locked|disk.*image)/i,
    "A better-sqlite3 error occurred. Ensure only one writer accesses the database at a time, check for WAL mode compatibility, and verify the database file is not corrupted.",
  ],
  [
    /sqlite.*(?:constraint|unique|not\s+null|foreign\s+key).*violation/i,
    "A SQLite constraint violation occurred. Check the schema constraints and validate input data before inserting or updating.",
  ],
  [
    /sqlite.*(?:readonly|file.*locked|unable\s+to\s+open)/i,
    "A SQLite file access error occurred. Check file permissions, ensure no other process has an exclusive lock, and verify the database path.",
  ],
  [
    /sqlite.*(?:malformed|corrupt|disk\s+image)/i,
    "The SQLite database file is corrupted. Run 'PRAGMA integrity_check;' to diagnose. Restore from backup or run 'sqlite3 db.sqlite .recover > recovered.sql'.",
  ],
  [
    /drizzle.*(?:sqlite|better.sqlite|libsql).*error/i,
    "A Drizzle ORM SQLite error occurred. Verify the database file path, schema definitions, and that drizzle-orm and the SQLite driver versions are compatible.",
  ],

  // ── GraphQL Federation / Supergraph ──────────────────────────────────
  [
    /federation.*(?:error|subgraph.*unavailable|supergraph)/i,
    "A GraphQL Federation error occurred. Check that all subgraph services are reachable, schema composition is valid, and the Apollo Router/Gateway is configured correctly.",
  ],
  [
    /apollo.*(?:gateway.*error|rover.*error|schema.*composition)/i,
    "An Apollo Gateway or schema composition error occurred. Run 'rover supergraph compose' to validate the supergraph schema and check subgraph schema compatibility.",
  ],
  [
    /graphql.*subscription.*(?:error|transport|websocket)/i,
    "A GraphQL subscription error occurred. Verify the WebSocket transport (graphql-ws or subscriptions-transport-ws) is correctly configured on both client and server.",
  ],
  [
    /graphql.*persisted.*query|automatic\s+persisted\s+queries/i,
    "A GraphQL Persisted Query error occurred. Ensure the persisted query hash matches the stored operation, or send the full query document on cache miss.",
  ],

  // ── NATS / messaging ──────────────────────────────────────────────────
  [
    /nats.*(?:connection|connect).*(?:error|refused|timeout)/i,
    "Cannot connect to NATS. Check the server URL (nats://host:4222), ensure the NATS server is running, and verify authentication credentials.",
  ],
  [
    /nats.*(?:permission|authorization.*violation)/i,
    "NATS authorisation denied. Check the subject permissions for the client's credentials/NKey/JWT in the NATS server configuration.",
  ],
  [
    /nats.*(?:max.*payload|message.*too\s+large)/i,
    "The NATS message exceeds the server's max_payload limit. Reduce message size or increase max_payload in the NATS server configuration.",
  ],
  [
    /stan.*(?:error|connection)|jetstream.*(?:error|stream.*not\s+found)/i,
    "A NATS JetStream or STAN error occurred. Verify the stream exists (nats stream ls), consumer configuration, and that JetStream is enabled on the server.",
  ],

  // ── Temporal workflow engine ──────────────────────────────────────────
  [
    /temporal.*(?:workflow.*error|activity.*error|worker.*error)/i,
    "A Temporal workflow or activity error occurred. Check the Temporal Web UI for workflow history, inspect activity failures, and verify the worker is polling the correct task queue.",
  ],
  [
    /temporal.*(?:non.determinism|nondeterministic)/i,
    "A Temporal non-determinism error occurred. Workflow code must be deterministic — avoid Date.now(), Math.random(), and non-deterministic I/O directly in workflows.",
  ],
  [
    /temporal.*(?:timeout|schedule.*to.*start|start.*to.*close)/i,
    "A Temporal activity or workflow timed out. Increase the scheduleToCloseTimeout, startToCloseTimeout, or implement heartbeat-based timeouts for long-running activities.",
  ],

  // ── Redis Streams ─────────────────────────────────────────────────────
  [
    /xadd.*(?:error|maxlen)|redis.*stream.*(?:error|full)/i,
    "A Redis Streams XADD error occurred. Check the MAXLEN option to cap stream length and ensure the stream key exists.",
  ],
  [
    /xread.*(?:error|block)|xgroup.*(?:error|busygroup|already\s+exists)/i,
    "A Redis Streams consumer group error occurred. Use XGROUP CREATE ... $ MKSTREAM to create the group, and handle BUSYGROUP errors gracefully.",
  ],
  [
    /xack.*(?:error|pending)|redis.*stream.*consumer\s+group/i,
    "A Redis Streams consumer group acknowledgement error occurred. Ensure messages are ACKed after processing and use XPENDING to track unacknowledged messages.",
  ],

  // ── Oracle / DB2 ──────────────────────────────────────────────────────
  [
    /ora-\d{5}|oracle.*(?:connection|error|database)/i,
    "An Oracle database error occurred. Check the ORA- error code in the Oracle documentation, verify TNS connection string, and ensure the Oracle client libraries are installed.",
  ],
  [
    /db2.*(?:sql\s*error|sqlstate|connection.*failed)|sqlcode/i,
    "A DB2 SQL error occurred. Look up the SQLCODE or SQLSTATE in the IBM DB2 documentation, check the connection parameters, and verify user permissions.",
  ],

  // ── SSH2 / SFTP ───────────────────────────────────────────────────────
  [
    /ssh2.*(?:authentication\s+failed|auth.*error|handshake.*failed)/i,
    "An SSH2 authentication failed. Check username, password, private key path, and key format. Use ssh2's debug option to trace the handshake.",
  ],
  [
    /ssh2.*(?:connection.*error|host.*key|known_hosts)/i,
    "An SSH2 connection or host key error occurred. Verify the server fingerprint, check ~/.ssh/known_hosts, and ensure the host is reachable on port 22.",
  ],
  [
    /sftp.*(?:error|permission\s+denied|no\s+such\s+file)|ssh.*sftp/i,
    "An SFTP error occurred. Check remote file permissions, verify the remote path exists, and ensure the SFTP subsystem is enabled on the SSH server.",
  ],

  // ── DNS (detailed) ────────────────────────────────────────────────────
  [
    /dns.*(?:servfail|server\s+failure|query\s+refused)/i,
    "The DNS server returned SERVFAIL or refused the query. Check DNS server health, firewall rules for UDP/TCP port 53, and try a different DNS resolver.",
  ],
  [
    /dns.*(?:nxdomain|non-existent\s+domain)|enotfound.*dns/i,
    "The DNS lookup returned NXDOMAIN — the domain does not exist. Verify the domain name spelling and check DNS propagation with dig or nslookup.",
  ],
  [
    /dns.*(?:timeout|temporary\s+failure|try\s+again)/i,
    "A DNS query timed out. Check network connectivity to the DNS resolver, consider using multiple resolvers, and retry with exponential back-off.",
  ],
  [
    /dnssec.*(?:failed|validation|bogus)/i,
    "DNSSEC validation failed. The DNS response may have been tampered with, or the domain's DNSSEC configuration is incorrect. Check DNSSEC records with dnsviz.net.",
  ],
  [
    /dns.*cache.*(?:poison|invalidat)|negative\s+caching/i,
    "A DNS cache issue occurred. Flush the DNS cache (systemd-resolved: resolvectl flush-caches) and check for DNS poisoning indicators.",
  ],

  // ── WebRTC ────────────────────────────────────────────────────────────
  [
    /webrtc.*(?:ice.*failed|ice.*disconnected|peer.*connection)/i,
    "A WebRTC ICE failure occurred. Check STUN/TURN server configuration, firewall rules for UDP, and ensure both peers exchange ICE candidates correctly.",
  ],
  [
    /webrtc.*(?:sdp.*error|offer.*answer|negotiation.*failed)/i,
    "A WebRTC SDP negotiation error occurred. Ensure offer/answer are set in the correct order (setLocalDescription then setRemoteDescription) and codec compatibility.",
  ],
  [
    /webrtc.*(?:track.*error|mediastream|getUserMedia)/i,
    "A WebRTC media track or getUserMedia error occurred. Check browser permissions for camera/microphone and handle NotAllowedError and NotFoundError.",
  ],

  // ── Service Workers / PWA ─────────────────────────────────────────────
  [
    /service.*worker.*(?:install\s+failed|activate\s+failed|registration\s+failed)/i,
    "A Service Worker installation or activation failed. Check the service worker script for syntax errors and ensure it is served from the same origin over HTTPS.",
  ],
  [
    /service.*worker.*(?:fetch.*failed|network.*error|offline)/i,
    "A Service Worker fetch handler error occurred. Add a try/catch in the fetch event handler and provide a fallback cached response for offline scenarios.",
  ],
  [
    /workbox.*(?:precach|runtimecach|strateg).*error/i,
    "A Workbox caching strategy error occurred. Check the Workbox configuration, verify URL patterns match, and ensure cache storage limits are not exceeded.",
  ],
  [
    /push.*notification.*(?:denied|blocked|error)|notification.*permission/i,
    "Push notification permission was denied or an error occurred. Handle 'denied' permission gracefully, use a soft-ask pattern before requesting permission.",
  ],
  [
    /indexeddb.*(?:error|blocked|version.*conflict|upgradeneeded)/i,
    "An IndexedDB error occurred. Handle versionchange events, ensure the database version is incremented when changing schema, and check for blocked upgrades from other tabs.",
  ],

  // ── gRPC-Web ──────────────────────────────────────────────────────────
  [
    /grpc.web.*(?:error|transport|http.*proxy)|envoy.*grpc.web/i,
    "A gRPC-Web error occurred. gRPC-Web requires a proxy (Envoy or grpc-web-proxy) — verify the proxy is running and the content-type is application/grpc-web.",
  ],
  [
    /grpc.web.*(?:trailers|metadata.*error|header.*frame)/i,
    "A gRPC-Web trailer or metadata error occurred. Ensure the proxy correctly forwards trailers as response body for browsers that don't support HTTP trailers.",
  ],

  // ── Microservices / distributed systems patterns ───────────────────────
  [
    /bulkhead.*(?:full|rejected|overflow)|thread.*pool.*exhausted/i,
    "A bulkhead pattern limit was exceeded — too many concurrent requests. Increase the bulkhead size or add a fallback response for shed load.",
  ],
  [
    /saga.*(?:compensation|rollback|failed)|compensating.*transaction/i,
    "A Saga pattern compensation transaction failed. Implement idempotent compensating actions and ensure each step's rollback handles partial failures.",
  ],
  [
    /outbox.*(?:pattern|failed|pending)|transactional.*outbox/i,
    "A transactional outbox pattern error occurred. Ensure the outbox table is part of the same transaction as the business data and the relay process is running.",
  ],
  [
    /event.*sourcing.*(?:error|replay\s+failed)|eventstore.*error/i,
    "An event sourcing error occurred. Check the event store connectivity, ensure events are idempotent, and validate event schema compatibility during replay.",
  ],
  [
    /cqrs.*(?:command\s+failed|query\s+failed)|command.*handler.*error/i,
    "A CQRS command or query handler error occurred. Check the command/query handler implementation, ensure eventual consistency is handled, and inspect the event log.",
  ],

  // ── HTTP status codes (generic fallbacks) ─────────────────────────────
  [
    /\b400\b|bad\s+request/i,
    "The server rejected the request as malformed. Validate the request payload, headers, and query parameters.",
  ],
  [
    /\b404\b|not\s+found/i,
    "The requested resource does not exist. Double-check the URL, ID, or path parameters.",
  ],
  [
    /\b408\b|request\s+timeout/i,
    "The server timed out waiting for the request. Retry with exponential back-off.",
  ],
  [
    /\b409\b|conflict/i,
    "A conflict occurred (e.g. optimistic locking or duplicate resource). Fetch the latest state and retry.",
  ],
  [
    /\b422\b|unprocessable/i,
    "The server understood the request but rejected the data. Check the API schema and fix the invalid fields.",
  ],
  [
    /\b429\b/i,
    "Too many requests. Throttle your calls, implement a request queue, and honour the Retry-After header.",
  ],
  [
    /\b5[0-9]{2}\b|internal\s+server\s+error|service\s+unavailable|bad\s+gateway/i,
    "A server-side error occurred. Check server logs, add retry logic with back-off, and alert on-call if it persists.",
  ],
]) as ReadonlyArray<readonly [RegExp, string]>;

// ─────────────────────────────────────────────
// Sensitive data redaction
// ─────────────────────────────────────────────

/** Placeholder used in place of a redacted value. */
export const REDACTED_VALUE = "[REDACTED]";

// ─────────────────────────────────────────────
// Metadata / serialisation limits
// ─────────────────────────────────────────────

/** Maximum length (chars) for a truncated string metadata value. */
export const TRUNCATED_SUFFIX = "…[truncated]";

/** Max characters kept in a response body / large metadata value. */
export const MAX_RESPONSE_BODY_CHARS = 500;

// ─────────────────────────────────────────────
// Fingerprinting
// ─────────────────────────────────────────────

/** Separator used when joining fingerprint components before hashing. */
export const FINGERPRINT_SEPARATOR = ":";
