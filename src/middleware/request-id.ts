import type { Context, Next } from "hono";
import { generateRequestId } from "../lib/api-error";

export function withRequestId() {
  return async (c: Context, next: Next) => {
    const existing = c.get("requestId");
    if (typeof existing !== "string" || existing.length === 0) {
      c.set("requestId", generateRequestId());
    }
    return next();
  };
}

