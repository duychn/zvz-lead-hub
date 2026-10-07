import type { IncomingLead } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Answers Meta's webhook verification handshake (GET with hub.* params). */
export function verifyMetaSubscription(url: URL, verifyToken?: string): Response {
  const ok = url.searchParams.get("hub.mode") === "subscribe"
    && Boolean(verifyToken)
    && url.searchParams.get("hub.verify_token") === verifyToken;
  return ok
    ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
    : new Response("Forbidden", { status: 403 });
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Checks X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret). */
export async function isValidMetaSignature(body: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Pulls leadgen IDs out of a Meta "leadgen" webhook payload. */
export function leadgenIds(payload: unknown): string[] {
  const entries = (payload as { entry?: { changes?: { field?: string; value?: { leadgen_id?: string } }[] }[] })?.entry ?? [];
  return entries.flatMap((e) => e.changes ?? [])
    .filter((c) => c.field === "leadgen" && c.value?.leadgen_id)
    .map((c) => c.value!.leadgen_id!);
}

/** Maps Meta Lead Ads field_data to our lead shape. Field names follow Meta's standard form questions. */
export function mapMetaFields(fieldData: { name: string; values: string[] }[], campaign?: string): IncomingLead {
  const get = (...names: string[]) => fieldData.find((f) => names.includes(f.name))?.values[0];
  return {
    name: get("full_name", "first_name"),
    phone: get("phone_number"),
    email: get("email"),
    company: get("company_name"),
    message: get("message", "comments") ?? "",
    source: "meta",
    campaign,
  };
}

/** Fetches one lead's answers from the Graph API with a Page access token. */
export async function fetchMetaLead(leadgenId: string, pageToken: string): Promise<IncomingLead> {
  const url = `${GRAPH}/${encodeURIComponent(leadgenId)}?fields=field_data,campaign_name&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Graph API returned ${res.status} for lead ${leadgenId}`);
  const data = (await res.json()) as { field_data?: { name: string; values: string[] }[]; campaign_name?: string };
  return mapMetaFields(data.field_data ?? [], data.campaign_name);
}
