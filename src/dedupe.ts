import type { Lead } from "./types";

/** Repeat submissions inside this window are treated as duplicates. */
export const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 30;

const sha256 = async (text: string): Promise<string> => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Fingerprints a lead by phone, falling back to email. Only the hash is stored,
 * so the KV namespace never holds contact details.
 */
export async function leadFingerprint(lead: Lead): Promise<string> {
  return sha256(`lead:${lead.phone ?? lead.email}`);
}

/** Returns true when the lead was already seen; otherwise records it. */
export async function isDuplicate(kv: KVNamespace, lead: Lead): Promise<boolean> {
  const key = await leadFingerprint(lead);
  if (await kv.get(key)) return true;
  await kv.put(key, lead.receivedAt, { expirationTtl: DEDUPE_TTL_SECONDS });
  return false;
}
