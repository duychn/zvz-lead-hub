# zvz-lead-hub

Lead intake, scoring and CRM routing for [ZvZ AI Hub](https://zvzdigital.com/product.html), running on Cloudflare Workers.

**Live demo:** https://demo.zvzdigital.com — score a sample lead. Demo data is not stored or forwarded.

> Status: early prototype. This repository is the first working slice of ZvZ AI Hub (lead intake → scoring → CRM). Zalo ZNS, the dashboard and multi-tenant accounts are not built yet. See the [product roadmap](https://zvzdigital.com/product.html#roadmap).

## What it does

```
Meta Lead Ads webhook ─┐
Website form / API ────┼─► normalize ─► de-duplicate ─► score ─► HubSpot / n8n webhook
                       │   (VN phone,    (hashed         (Claude API,
                       │    email)        fingerprint)    or rules)
```

- **Normalize** Vietnamese phone numbers to E.164 (`090 123 4567` → `+84901234567`) and clean emails.
- **De-duplicate** repeat submissions for 30 days. KV stores only a SHA-256 fingerprint, never contact details.
- **Score** each lead 0–100 with a one-sentence reason a salesperson can read quickly. Uses the Claude API (`claude-opus-5-5`, structured outputs) when `ANTHROPIC_API_KEY` is set; otherwise a transparent rule-based scorer. Claude refusals and API errors fall back to the rules.
- **Forward** to HubSpot (standard contact properties only) and/or an n8n/Make webhook.
- **Meta Lead Ads**: handles the webhook handshake, verifies `X-Hub-Signature-256`, fetches answers from the Graph API and runs them through the same pipeline.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/` | – | Demo page |
| `GET` | `/health` | – | Which scorer is active |
| `POST` | `/v1/leads/preview` | – | Normalize + score only. Rate limited to 10/min per IP. |
| `POST` | `/v1/leads` | `Bearer INTAKE_TOKEN` | Full pipeline |
| `GET`/`POST` | `/webhooks/meta` | Meta signature | Meta Lead Ads |

```bash
curl -X POST https://demo.zvzdigital.com/v1/leads/preview \
  -H 'content-type: application/json' \
  -d '{"name":"Minh Anh","phone":"090 123 4567","message":"Cho mình xin báo giá, tuần này cần gấp"}'
```

## Run locally

```bash
npm ci
cp .dev.vars.example .dev.vars   # all values optional
npm run dev                      # http://localhost:8787
npm test
```

## Deploy

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # optional, enables Claude scoring
npx wrangler secret put INTAKE_TOKEN        # required for POST /v1/leads
npm run deploy
```

## Responsible use

Follow-up messages go only to people who opted in, and every message must include a way to opt out. Lead fields are passed to Claude as data, not instructions. See the [ZvZ responsible use policy](https://zvzdigital.com/responsible-use.html) and [Anthropic's Usage Policy](https://www.anthropic.com/legal/aup).

## License

MIT © ZvZ Digital
