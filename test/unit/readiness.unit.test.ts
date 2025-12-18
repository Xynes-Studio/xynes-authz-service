import { describe, expect, test, mock } from "bun:test";
import { checkPostgresReadiness } from "../../src/infra/readiness";

describe("checkPostgresReadiness (Unit via injected client)", () => {
  type SqlClient = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
    end: () => Promise<void>;
  };

  test("queries pg_namespace when schemaName is provided and always closes", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const end = mock();
    end.mockResolvedValueOnce(undefined);

    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join(""), values });
      return Promise.resolve([]);
    }) as SqlClient;
    sql.end = end;

    await checkPostgresReadiness({
      databaseUrl: "postgres://unused",
      schemaName: "public",
      createClient: () => sql,
    });

    expect(calls.length).toBe(1);
    const firstCall = calls.at(0);
    if (!firstCall) throw new Error("Expected sql to be called once");
    expect(firstCall.text).toContain("FROM pg_namespace");
    expect(firstCall.values).toEqual(["public"]);
    expect(end).toHaveBeenCalledTimes(1);
  });

  test("runs SELECT 1 when schemaName is omitted and closes even on errors", async () => {
    const end = mock();
    end.mockResolvedValueOnce(undefined);

    const sql = (() => Promise.reject(new Error("boom"))) as unknown as SqlClient;
    sql.end = end;

    await expect(
      checkPostgresReadiness({
        databaseUrl: "postgres://unused",
        createClient: () => sql,
      })
    ).rejects.toThrow("boom");

    expect(end).toHaveBeenCalledTimes(1);
  });
});
