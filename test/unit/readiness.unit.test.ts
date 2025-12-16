import { describe, expect, test, mock } from "bun:test";
import { checkPostgresReadiness } from "../../src/infra/readiness";

describe("checkPostgresReadiness (Unit via injected client)", () => {
  test("queries pg_namespace when schemaName is provided and always closes", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const end = mock();
    end.mockResolvedValueOnce(undefined);

    const sql: any = (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join(""), values });
      return Promise.resolve([]);
    };
    sql.end = end;

    await checkPostgresReadiness({
      databaseUrl: "postgres://unused",
      schemaName: "public",
      createClient: () => sql,
    });

    expect(calls.length).toBe(1);
    expect(calls[0]!.text).toContain("FROM pg_namespace");
    expect(calls[0]!.values).toEqual(["public"]);
    expect(end).toHaveBeenCalledTimes(1);
  });

  test("runs SELECT 1 when schemaName is omitted and closes even on errors", async () => {
    const end = mock();
    end.mockResolvedValueOnce(undefined);

    const sql: any = () => Promise.reject(new Error("boom"));
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

