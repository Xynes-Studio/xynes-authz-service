import { describe, it, expect } from "bun:test";
import { createHmac } from "node:crypto";
import {
  verifyInternalJwt,
  looksLikeJwt,
  type ServiceKey,
  type InternalJwtPayload,
} from "../../../../src/infra/security/internal-jwt";

/**
 * Helper to create a valid HS256 JWT for testing
 */
function createTestJwt(
  payload: Partial<InternalJwtPayload> & Record<string, unknown>,
  signingKey: string
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", signingKey)
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Create a valid payload with all required fields
 */
function createValidPayload(
  overrides: Partial<InternalJwtPayload> = {}
): InternalJwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: "authz-service" as ServiceKey,
    iat: now,
    exp: now + 60,
    internal: true,
    requestId: "test-request-id-123",
    ...overrides,
  };
}

const TEST_SIGNING_KEY = "test-signing-key-for-unit-tests";

describe("looksLikeJwt", () => {
  it("returns true for valid 3-part JWT structure with alg header", () => {
    const jwt = createTestJwt(createValidPayload(), TEST_SIGNING_KEY);
    expect(looksLikeJwt(jwt)).toBe(true);
  });

  it("returns false for plain tokens", () => {
    expect(looksLikeJwt("plain-token")).toBe(false);
  });

  it("returns false for 2-part strings", () => {
    expect(looksLikeJwt("part1.part2")).toBe(false);
  });

  it("returns false for invalid base64 header", () => {
    expect(looksLikeJwt("!!!.payload.signature")).toBe(false);
  });

  it("returns false for header without alg field", () => {
    const header = base64UrlEncode(JSON.stringify({ typ: "JWT" }));
    expect(looksLikeJwt(`${header}.payload.signature`)).toBe(false);
  });
});

describe("verifyInternalJwt", () => {
  const now = Math.floor(Date.now() / 1000);
  const expectedAudience: ServiceKey = "authz-service";

  describe("valid tokens", () => {
    it("returns valid for correctly signed token with valid payload", () => {
      const payload = createValidPayload();
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.aud).toBe("authz-service");
      expect(result.payload?.internal).toBe(true);
      expect(result.payload?.requestId).toBe("test-request-id-123");
    });
  });

  describe("signature validation", () => {
    it("returns invalid_signature for wrong signing key", () => {
      const payload = createValidPayload();
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, "wrong-key", {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("returns invalid_signature for tampered payload", () => {
      const payload = createValidPayload();
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);
      // Tamper with the payload
      const parts = jwt.split(".");
      parts[1] = base64UrlEncode(
        JSON.stringify({ ...payload, aud: "cms-service" })
      );
      const tamperedJwt = parts.join(".");

      const result = verifyInternalJwt(tamperedJwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });
  });

  describe("payload validation", () => {
    it("returns audience_mismatch for wrong audience", () => {
      const payload = createValidPayload({ aud: "cms-service" as ServiceKey });
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("audience_mismatch");
    });

    it("returns not_internal_token when internal !== true", () => {
      const payload = { ...createValidPayload(), internal: false };
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("not_internal_token");
    });

    it("returns missing_request_id when requestId is missing", () => {
      const payload = createValidPayload();
      // @ts-expect-error - testing missing field
      delete payload.requestId;
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("missing_request_id");
    });

    it("returns missing_request_id when requestId is empty string", () => {
      const payload = createValidPayload({ requestId: "" });
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("missing_request_id");
    });
  });

  describe("expiration validation", () => {
    it("returns token_expired for expired tokens", () => {
      const payload = createValidPayload({
        iat: now - 120,
        exp: now - 60, // Expired 60 seconds ago
      });
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("token_expired");
    });

    it("accepts token within clock skew tolerance", () => {
      const payload = createValidPayload({
        iat: now - 30,
        exp: now - 10, // Expired 10 seconds ago, but within 30s skew
      });
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
        clockSkewSeconds: 30,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("iat validation", () => {
    it("returns iat_future for future-dated tokens", () => {
      const payload = createValidPayload({
        iat: now + 120, // 2 minutes in the future
        exp: now + 180,
      });
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
        clockSkewSeconds: 30, // Only 30s tolerance
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("iat_future");
    });

    it("returns iat_too_old for tokens beyond maxAgeSeconds", () => {
      const payload = createValidPayload({
        iat: now - 300, // 5 minutes ago
        exp: now + 60, // Still not expired
      });
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
        maxAgeSeconds: 120, // Token max age is 2 minutes
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("iat_too_old");
    });

    it("accepts token with iat slightly in future within clock skew", () => {
      const payload = createValidPayload({
        iat: now + 15, // 15 seconds in the future
        exp: now + 60,
      });
      const jwt = createTestJwt(payload, TEST_SIGNING_KEY);

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
        nowEpochSeconds: now,
        clockSkewSeconds: 30, // 30s tolerance
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("format validation", () => {
    it("returns invalid_format for non-JWT strings", () => {
      const result = verifyInternalJwt("not-a-jwt", TEST_SIGNING_KEY, {
        expectedAudience,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("invalid_format");
    });

    it("returns missing_parts for incomplete JWT", () => {
      const result = verifyInternalJwt("part1..part3", TEST_SIGNING_KEY, {
        expectedAudience,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("missing_parts");
    });

    it("returns unsupported_algorithm for non-HS256 tokens", () => {
      const header = { alg: "RS256", typ: "JWT" };
      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const encodedPayload = base64UrlEncode(
        JSON.stringify(createValidPayload())
      );
      const jwt = `${encodedHeader}.${encodedPayload}.fakesignature`;

      const result = verifyInternalJwt(jwt, TEST_SIGNING_KEY, {
        expectedAudience,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("unsupported_algorithm");
    });
  });
});
