import { z } from "zod";

export const authzCheckRequestSchema = z
  .object({
    userId: z.string().uuid(),
    workspaceId: z.string().uuid().nullable(),
    actionKey: z.string().min(1).max(256),
  })
  .strict();

export type AuthzCheckRequest = z.infer<typeof authzCheckRequestSchema>;

