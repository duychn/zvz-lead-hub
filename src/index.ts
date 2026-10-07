import { isDuplicate } from "./dedupe";
import { demoPage } from "./demo";
import { forwardLead } from "./forward";
import { fetchMetaLead, isValidMetaSignature, leadgenIds, verifyMetaSubscription } from "./meta";
import { InvalidLeadError, normalizeLead } from "./normalize";
import { scoreLead } from "./score";
import type { Env, IncomingLead } from "./types";

const MAX_BODY_BYTES = 16 * 1024;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function readBody(request: Request): Promise<string> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new InvalidLeadError("Request body is too large.");
  return text;
}

async function readLead(request: Request): Promise<IncomingLead> {
  try {
    return JSON.parse(await readBody(request)) as IncomingLead;
  } catch (error) {
    if (error instanceof InvalidLeadError) throw error;
    throw new InvalidLeadError("Body must be JSON.");
  }
}

/** Full pipeline for a real lead: normalize → dedupe → score → forward. */
async function processLead(input: IncomingLead, env: Env) {
  const lead = normalizeLead(input);
  if (await isDuplicate(env.LEADS, lead)) return { duplicate: true as const };
  const score = await scoreLead(lead, env.ANTHROPIC_API_KEY);
  const forwarded = await forwardLead(lead, score, { hubspotToken: env.HUBSPOT_TOKEN, n8nUrl: env.N8N_WEBHOOK_URL });
  return { duplicate: false as const, lead, score, forwarded };
}

const isAuthorized = (request: Request, token?: string) =>
  Boolean(token) && request.headers.get("authorization") === `Bearer ${token}`;

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;

  switch (key) {
    case "GET /":
      return new Response(demoPage(), { headers: { "content-type": "text/html; charset=utf-8" } });

    case "GET /health":
      return json({ ok: true, scorer: env.ANTHROPIC_API_KEY ? "claude" : "rules" });

    // Public demo: scores a sample lead without storing or forwarding it.
    case "POST /v1/leads/preview": {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      if (env.DEMO_LIMITER && !(await env.DEMO_LIMITER.limit({ key: ip })).success) {
        return json({ error: "Too many requests. Try again in a minute." }, 429);
      }
      const lead = normalizeLead(await readLead(request));
      return json({ lead, score: await scoreLead(lead, env.ANTHROPIC_API_KEY), stored: false, forwarded: false });
    }

    case "POST /v1/leads": {
      if (!env.INTAKE_TOKEN) return json({ error: "Intake is not configured." }, 503);
      if (!isAuthorized(request, env.INTAKE_TOKEN)) return json({ error: "Unauthorized." }, 401);
      return json(await processLead(await readLead(request), env), 201);
    }

    case "GET /webhooks/meta":
      return verifyMetaSubscription(url, env.META_VERIFY_TOKEN);

    case "POST /webhooks/meta": {
      if (!env.META_APP_SECRET || !env.META_PAGE_TOKEN) return json({ error: "Meta webhook is not configured." }, 503);
      const body = await readBody(request);
      if (!(await isValidMetaSignature(body, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET))) {
        return json({ error: "Invalid signature." }, 401);
      }
      const ids = leadgenIds(JSON.parse(body));
      // Acknowledge fast; Meta retries slow webhooks. Each lead is processed in the background.
      ctx.waitUntil(Promise.allSettled(ids.map(async (id) => {
        const result = await processLead(await fetchMetaLead(id, env.META_PAGE_TOKEN!), env);
        console.log(`Meta lead ${id}:`, result.duplicate ? "duplicate" : `${result.score.tier} (${result.score.scorer})`);
      })));
      return json({ received: ids.length });
    }
  }
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof InvalidLeadError) return json({ error: error.message }, 400);
      console.error(error);
      return json({ error: "Internal error." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
