/**
 * SEC-INTERNAL-AUTH-2: Internal Service Authentication Middleware
 *
 * This middleware authenticates internal service-to-service calls.
 * It supports both JWT-based auth (preferred) and legacy static token (transitional).
 *
 * Security considerations:
 * - Token values are NEVER logged
 * - Uses timing-safe comparison for both JWT and legacy tokens
 * - JWT tokens include audience validation to prevent cross-service attacks
 */

import type { Context, Next } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createErrorResponse, getOrCreateRequestId } from "../lib/api-error";
import {
  verifyInternalJwt,
  looksLikeJwt,
  type ServiceKey,
} from "../infra/security/internal-jwt";

/**
 * Expected service key for this service.
 * Used as the audience claim in JWT verification.
 */
const SERVICE_KEY: ServiceKey = "authz-service";

/**
 * Timing-safe token comparison for legacy static tokens.
 */
function tokensMatch(provided: string, expected: string): boolean {
  const key = Buffer.from(expected);
  const providedDigest = createHmac("sha256", key).update(provided).digest();
  const expectedDigest = createHmac("sha256", key).update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Get the internal auth mode from environment.
 * - 'hybrid': Accept both JWT and legacy token (transitional)
 * - 'jwt': Require JWT only (production target)
 */
function getAuthMode(): "hybrid" | "jwt" {
  const mode = process.env.INTERNAL_AUTH_MODE;
  return mode === "jwt" ? "jwt" : "hybrid";
}

/**
 * Internal service authentication middleware.
 *
 * Validates the X-Internal-Service-Token header using:
 * 1. JWT verification (if INTERNAL_JWT_SIGNING_KEY is set and token looks like JWT)
 * 2. Legacy static token comparison (if in hybrid mode and token is not JWT)
 *
 * Rejects requests with:
 * - 500 if neither JWT signing key nor legacy token is configured
 * - 401 if token is missing
 * - 403 if token is invalid
 */
export function requireInternalServiceAuth() {
  return async (c: Context, next: Next) => {
    const requestId = getOrCreateRequestId(c);

    const jwtSigningKey = process.env.INTERNAL_JWT_SIGNING_KEY;
    const legacyToken = process.env.INTERNAL_SERVICE_TOKEN;
    const authMode = getAuthMode();

    // Check configuration
    if (!jwtSigningKey && !legacyToken) {
      console.error(
        "[InternalAuth] Misconfigured: No signing key or token set",
        {
          requestId,
          path: c.req.path,
          method: c.req.method,
        }
      );
      return c.json(
        createErrorResponse(
          "INTERNAL_ERROR",
          "Internal auth misconfigured",
          requestId
        ),
        500
      );
    }

    const provided = c.req.header("X-Internal-Service-Token");
    if (!provided) {
      console.warn("[InternalAuth] Rejected: missing token header", {
        requestId,
        path: c.req.path,
        method: c.req.method,
      });
      return c.json(
        createErrorResponse(
          "UNAUTHORIZED",
          "Missing internal auth token",
          requestId
        ),
        401
      );
    }

    // Try JWT verification first if signing key is configured
    if (jwtSigningKey && looksLikeJwt(provided)) {
      const result = verifyInternalJwt(provided, jwtSigningKey, {
        expectedAudience: SERVICE_KEY,
      });

      if (result.valid) {
        // Set request ID from JWT payload for correlation
        if (result.payload?.requestId) {
          c.set("requestId", result.payload.requestId);
        }
        return next();
      }

      // Log verification failure without token value
      console.warn("[InternalAuth] JWT verification failed", {
        requestId,
        path: c.req.path,
        method: c.req.method,
        reason: result.error,
      });

      // In jwt-only mode, reject immediately
      if (authMode === "jwt") {
        return c.json(
          createErrorResponse(
            "FORBIDDEN",
            "Invalid internal auth token",
            requestId
          ),
          403
        );
      }
      // In hybrid mode, fall through to legacy token check
    }

    // Legacy token verification (hybrid mode only)
    if (authMode === "hybrid" && legacyToken) {
      if (tokensMatch(provided, legacyToken)) {
        return next();
      }
    }

    // If we get here, authentication failed
    console.warn("[InternalAuth] Rejected: invalid token", {
      requestId,
      path: c.req.path,
      method: c.req.method,
      authMode,
    });

    return c.json(
      createErrorResponse(
        "FORBIDDEN",
        "Invalid internal auth token",
        requestId
      ),
      403
    );
  };
}
