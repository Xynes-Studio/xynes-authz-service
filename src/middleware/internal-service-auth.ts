import type { Context, Next } from "hono";
import {
  internalRequestOperation,
  loadInternalRequestTrust,
  readInternalRequestBody,
  verifyInternalRequest,
} from "../infra/security/internal-request";
import { createErrorResponse, getOrCreateRequestId } from "../lib/api-error";
import { requireInternalServiceAuth as requireLegacyReadCheckAuth } from "./legacy-read-check-auth";
import { AUTHZ_CHECK_MAX_BODY_BYTES } from "../config/http";

export function requireInternalServiceAuth(
  options: { allowLegacyReadCheck?: boolean } = {},
) {
  return async (c: Context, next: Next) => {
    const requestId = getOrCreateRequestId(c);
    const token = c.req.header("X-Internal-Service-Token");
    if (!token)
      return c.json(
        createErrorResponse(
          "UNAUTHORIZED",
          "Missing internal auth token",
          requestId,
        ),
        401,
      );
    // This compatibility path cannot authenticate any mutation or role listing.
    if (
      options.allowLegacyReadCheck &&
      c.req.method === "POST" &&
      c.req.path === "/authz/check"
    ) {
      let bound = false;
      try {
        const header: unknown = JSON.parse(
          Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"),
        );
        bound =
          !!header &&
          typeof header === "object" &&
          "typ" in header &&
          header.typ === "xynes-internal-request+jwt";
      } catch {
        /* A static token is handled only by the read-only adapter. */
      }
      if (!bound) return requireLegacyReadCheckAuth()(c, next);
    }
    let trust: ReturnType<typeof loadInternalRequestTrust>;
    try {
      trust = loadInternalRequestTrust();
    } catch {
      return c.json(
        createErrorResponse(
          "INTERNAL_ERROR",
          "Internal auth misconfigured",
          requestId,
        ),
        500,
      );
    }
    let body: Uint8Array;
    try {
      body = await readInternalRequestBody(
        c.req.raw,
        c.req.path === "/authz/check" ? AUTHZ_CHECK_MAX_BODY_BYTES : 32 * 1024,
      );
    } catch {
      return c.json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "Request body too large",
          requestId,
        ),
        400,
      );
    }
    const operation = internalRequestOperation(
      "authz-service",
      c.req.path,
      body,
    );
    if (
      !verifyInternalRequest(
        token,
        {
          audience: "authz-service",
          operation,
          url: c.req.url,
          method: c.req.method,
          headers: c.req.raw.headers,
          body,
        },
        trust,
      )
    ) {
      return c.json(
        createErrorResponse(
          "FORBIDDEN",
          "Invalid internal request identity or context",
          requestId,
        ),
        403,
      );
    }
    c.set("requestId", c.req.header("X-Request-Id"));
    // Reuse only the bounded, verified bytes in the existing route parser.
    c.req.raw = new Request(c.req.raw, {
      body: Buffer.from(body),
      duplex: "half",
    });
    return next();
  };
}
