import { EventEmitter } from "node:events";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  signInternalRequest,
  internalRequestOperation,
} from "../../src/infra/security/internal-request";

// Ephemeral keys are generated per test process, never committed or printed.
export const gatewayIdentity = generateKeyPairSync("ed25519");
export const accountsIdentity = generateKeyPairSync("ed25519");
export const cmsIdentity = generateKeyPairSync("ed25519");
export const docsIdentity = generateKeyPairSync("ed25519");
const identities = { gateway: gatewayIdentity, accounts: accountsIdentity, cms: cmsIdentity, docs: docsIdentity };
const keyIds = { gateway: 'g1', accounts: 'a1', cms: 'c1', docs: 'd1' };
const dir = mkdtempSync(join(tmpdir(), "sec003-test-"));
const privateFile = join(dir, "private.pem");
const trustFile = join(dir, "trust.json");
writeFileSync(
  privateFile,
  accountsIdentity.privateKey.export({ type: "pkcs8", format: "pem" }),
  { mode: 0o600 },
);
writeFileSync(
  trustFile,
  JSON.stringify(Object.entries(identities).map(([issuer, identity]) => ({
    issuer, keyId: keyIds[issuer as keyof typeof keyIds],
    publicKey: identity.publicKey.export({ type: 'spki', format: 'pem' }),
  }))),
  { mode: 0o600 },
);
process.env.INTERNAL_REQUEST_PRIVATE_KEY_FILE = privateFile;
process.env.INTERNAL_REQUEST_KEY_ID = "a1";
process.env.INTERNAL_REQUEST_TRUST_FILE = trustFile;
export function signedInit(
  path: string,
  init: RequestInit,
  issuer: keyof typeof identities = "accounts",
  audience = "authz-service",
): RequestInit {
  const body = typeof init.body === "string" ? init.body : "";
  const headers = new Headers(init.headers);
  const operation = internalRequestOperation(audience, path, body);
  const identity = identities[issuer];
  headers.set(
    "X-Internal-Service-Token",
    signInternalRequest(
      {
        audience,
        operation,
        method: init.method ?? "POST",
        url: `http://localhost${path}`,
        headers,
        body,
      },
      {
        issuer,
        keyId: keyIds[issuer],
        privateKey: identity.privateKey,
      },
    ),
  );
  return { ...init, headers };
}

EventEmitter.prototype.once.call(process, "exit", () =>
  rmSync(dir, { recursive: true, force: true }),
);

export function signedCheckInit(init: RequestInit, issuer: keyof typeof identities = 'gateway'): RequestInit {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string') {
    try {
      const body: unknown = JSON.parse(init.body);
      if (typeof body === 'object' && body !== null) {
        if ('userId' in body && typeof body.userId === 'string' && !headers.has('X-XS-User-Id')) headers.set('X-XS-User-Id', body.userId);
        if ('workspaceId' in body && typeof body.workspaceId === 'string' && !headers.has('X-Workspace-Id')) headers.set('X-Workspace-Id', body.workspaceId);
      }
    } catch { /* Malformed input is deliberately signed for boundary rejection tests. */ }
  }
  return signedInit('/authz/check', { ...init, headers }, issuer);
}
