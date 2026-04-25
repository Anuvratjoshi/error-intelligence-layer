import type {
  AnalyzedError,
  AnalyzeOptions,
  FormatType,
  RequestContext,
} from "../types/index.js";
import { analyzeError, formatError } from "../core/analyzer.js";
import { getConfig } from "../core/config.js";

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

interface AdapterOptions {
  /** Output format sent as the response body. Default: "json". */
  format?: FormatType;
  /** Include process/env info in the analyzed error. Default: true. */
  includeEnv?: boolean;
  /**
   * Optional side-effect hook called after analysis.
   * Use for external logging, alerting, etc.
   */
  onError?: (analyzed: AnalyzedError, raw: unknown) => void;
}

function extractRequestContext(req: Record<string, unknown>): RequestContext {
  return {
    method: typeof req["method"] === "string" ? req["method"] : undefined,
    url: typeof req["url"] === "string" ? req["url"] : undefined,
    headers:
      (req["headers"] as Record<string, string> | undefined) ?? undefined,
    params: (req["params"] as Record<string, unknown> | undefined) ?? undefined,
    body: req["body"],
  };
}

function resolveStatusCode(raw: unknown): number {
  if (raw === null || typeof raw !== "object") return 500;
  const obj = raw as Record<string, unknown>;
  const code = obj["statusCode"] ?? obj["status"];
  if (typeof code === "number" && code >= 100 && code < 600) return code;
  return 500;
}

// ─────────────────────────────────────────────
// Express adapter
// ─────────────────────────────────────────────

/**
 * Express error-handling middleware.
 *
 * Register LAST, after all routes:
 * ```ts
 * app.use(expressErrorHandler());
 * ```
 */
export function expressErrorHandler(options: AdapterOptions = {}) {
  const fmt = options.format ?? getConfig().defaultFormat;
  const includeEnv = options.includeEnv ?? getConfig().includeEnv;

  // Express error middleware has signature (err, req, res, next)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function eilExpressMiddleware(
    err: unknown,
    req: Record<string, unknown>,
    res: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: unknown,
  ): void {
    const analyzeOpts: AnalyzeOptions = {
      request: extractRequestContext(req),
      includeEnv,
    };

    const analyzed = analyzeError(err, analyzeOpts);
    options.onError?.(analyzed, err);

    const statusCode = resolveStatusCode(err);
    const body = formatError(analyzed, fmt);

    const resSend = res as unknown as {
      status: (code: number) => {
        send: (body: string) => void;
        set: (k: string, v: string) => { send: (body: string) => void };
      };
      set: (k: string, v: string) => void;
    };

    const contentType = fmt === "json" ? "application/json" : "text/plain";
    resSend.status(statusCode).set("Content-Type", contentType).send(body);
  };
}

// ─────────────────────────────────────────────
// Fastify adapter
// ─────────────────────────────────────────────

/**
 * Fastify plugin that registers a global error handler.
 *
 * ```ts
 * await app.register(fastifyErrorPlugin, { format: "json" });
 * ```
 */
export function fastifyErrorPlugin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify: Record<string, any>,
  options: AdapterOptions,
  done: () => void,
): void {
  const fmt = options.format ?? getConfig().defaultFormat;
  const includeEnv = options.includeEnv ?? getConfig().includeEnv;

  fastify["setErrorHandler"](function (
    err: unknown,
    request: Record<string, unknown>,
    reply: Record<string, unknown>,
  ) {
    const analyzeOpts: AnalyzeOptions = {
      request: extractRequestContext(request),
      includeEnv,
    };

    const analyzed = analyzeError(err, analyzeOpts);
    options.onError?.(analyzed, err);

    const statusCode = resolveStatusCode(err);
    const body = formatError(analyzed, fmt);
    const contentType = fmt === "json" ? "application/json" : "text/plain";

    const rep = reply as unknown as {
      code: (n: number) => {
        header: (k: string, v: string) => { send: (b: string) => void };
      };
    };
    rep.code(statusCode).header("Content-Type", contentType).send(body);
  });

  done();
}

// ─────────────────────────────────────────────
// Next.js App Router (route handler wrapper)
// ─────────────────────────────────────────────

type NextRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
};
type NextResponse = unknown;
type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>;

/**
 * Wraps a Next.js App Router route handler.
 * On unhandled error, returns a JSON `Response` with the analyzed error.
 *
 * ```ts
 * export const GET = withNextErrorHandler(async (req) => { … });
 * ```
 */
export function withNextErrorHandler(
  handler: RouteHandler,
  options: AdapterOptions = {},
): RouteHandler {
  const fmt = options.format ?? "json";
  const includeEnv = options.includeEnv ?? getConfig().includeEnv;

  return async function eilNextHandler(
    req: NextRequest,
    ctx?: unknown,
  ): Promise<NextResponse> {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const analyzeOpts: AnalyzeOptions = {
        request: {
          method: req.method,
          url: req.url,
          headers: req.headers,
        },
        includeEnv,
      };

      const analyzed = analyzeError(err, analyzeOpts);
      options.onError?.(analyzed, err);

      const body = formatError(analyzed, fmt);
      const statusCode = resolveStatusCode(err);

      // Use globalThis.Response so this works in the Next.js edge and Node runtimes
      // without importing next/server directly (keeps this adapter zero-dep).
      // Typed loosely to avoid requiring DOM lib globals.
      const ResponseCtor = (globalThis as Record<string, unknown>)[
        "Response"
      ] as
        | (new (
            body: string,
            init: { status: number; headers: Record<string, string> },
          ) => unknown)
        | undefined;

      if (ResponseCtor) {
        return new ResponseCtor(body, {
          status: statusCode,
          headers: { "Content-Type": "application/json" },
        }) as unknown as NextResponse;
      }

      // Fallback: return a plain object (works with custom response helpers)
      return { status: statusCode, body: analyzed } as unknown as NextResponse;
    }
  };
}

// ─────────────────────────────────────────────
// Next.js Pages Router (API route wrapper)
// ─────────────────────────────────────────────

type NextApiRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
};
type NextApiResponse = {
  status: (code: number) => NextApiResponse;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (k: string, v: string) => void;
};
type NextApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
) => Promise<void> | void;

/**
 * Wraps a Next.js Pages Router API route handler.
 * On unhandled error, responds with the analyzed error JSON.
 *
 * ```ts
 * export default withNextApiErrorHandler(async (req, res) => { … });
 * ```
 */
export function withNextApiErrorHandler(
  handler: NextApiHandler,
  options: AdapterOptions = {},
): NextApiHandler {
  const includeEnv = options.includeEnv ?? getConfig().includeEnv;

  return async function eilNextApiHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ): Promise<void> {
    try {
      await handler(req, res);
    } catch (err) {
      const analyzeOpts: AnalyzeOptions = {
        request: {
          method: req.method,
          url: req.url,
          headers: req.headers,
          params: req.query,
          body: req.body,
        },
        includeEnv,
      };

      const analyzed = analyzeError(err, analyzeOpts);
      options.onError?.(analyzed, err);

      const statusCode = resolveStatusCode(err);
      res.status(statusCode).json(analyzed);
    }
  };
}
