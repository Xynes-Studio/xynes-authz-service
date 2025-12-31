import { describe, expect, test } from "bun:test";
import { AUTHZ_CHECK_MAX_BODY_BYTES } from "../../src/config/http";

describe("HTTP config (unit)", () => {
  test("AUTHZ_CHECK_MAX_BODY_BYTES is 8kb", () => {
    expect(AUTHZ_CHECK_MAX_BODY_BYTES).toBe(8 * 1024);
  });
});
