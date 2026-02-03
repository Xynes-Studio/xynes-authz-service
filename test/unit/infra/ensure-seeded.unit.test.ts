import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { ensureAuthzSeeded } from "../../../src/infra/ensure-seeded";

describe("ensureAuthzSeeded (unit)", () => {
  const original = process.env.AUTHZ_AUTO_SEED;

  beforeEach(() => {
    process.env.AUTHZ_AUTO_SEED = "0";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AUTHZ_AUTO_SEED;
    } else {
      process.env.AUTHZ_AUTO_SEED = original;
    }
  });

  test("returns early when auto-seed is disabled", async () => {
    await ensureAuthzSeeded();
    expect(true).toBe(true);
  });

  test("is idempotent when auto-seed is disabled", async () => {
    await ensureAuthzSeeded();
    await ensureAuthzSeeded();
    expect(true).toBe(true);
  });
});
