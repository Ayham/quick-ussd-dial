// Ed25519 signing for the license verdict/policy blob.
//
// The client (src/lib/signed-cache.ts) verifies the signed blob with the
// embedded PUBLIC key and treats any blob that fails verification as
// tampered -> unverified -> protected transfers blocked (fail closed).
//
// Deployment requirement:
//   supabase secrets set LICENSE_SIGNING_PRIVATE_KEY=<base64url seed>
//   supabase functions deploy validate-license
// The private key MUST live in a Supabase secret, never in this repo.

const encoder = new TextEncoder();

function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let signingKey: CryptoKey | null = null;

// RFC 8410: an Ed25519 PKCS#8 private key is a single OCTET STRING wrapping
// the raw 32-byte seed. Deno's WebCrypto cannot import Ed25519 private keys
// in "raw" format ("Invalid key usage"), so wrap the seed before import.
function pkcs8FromSeed(seed: Uint8Array): Uint8Array {
  const prefix = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);
  const der = new Uint8Array(prefix.length + seed.length);
  der.set(prefix, 0);
  der.set(seed, prefix.length);
  return der;
}

export async function getEd25519SigningKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  const secret = Deno.env.get("LICENSE_SIGNING_PRIVATE_KEY");
  if (!secret) {
    throw new Error("signing_key_missing: set LICENSE_SIGNING_PRIVATE_KEY secret");
  }
  signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8FromSeed(base64UrlDecode(secret)),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  return signingKey;
}

export async function signBlob(blob: string): Promise<string> {
  const key = await getEd25519SigningKey();
  const sig = await crypto.subtle.sign("Ed25519", key, encoder.encode(blob));
  return base64UrlEncode(new Uint8Array(sig));
}

// Deterministic canonical payload. Key order is fixed so the client can
// verify the exact serialized bytes (it verifies `blob` verbatim, then
// parses it).
export function canonicalBlob(
  serverTime: string,
  verdict: Record<string, unknown>,
  policy: Record<string, unknown>,
): string {
  return JSON.stringify({ server_time: serverTime, verdict, policy });
}
