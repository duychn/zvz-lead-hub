import { describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";

const env = { LEADS: {} as KVNamespace } as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const call = (req: Request) => worker.fetch!(req as Request<unknown, IncomingRequestCfProperties>, env, ctx);

const preflight = (origin: string) =>
  new Request("https://demo.zvzdigital.com/v1/leads/preview", { method: "OPTIONS", headers: { origin } });

describe("preview CORS", () => {
  it("allows the ZvZ website", async () => {
    const res = await call(preflight("https://zvzdigital.com"));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://zvzdigital.com");
  });

  it("ignores other origins", async () => {
    const res = await call(preflight("https://evil.example"));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("adds CORS headers to error responses too", async () => {
    const res = await call(new Request("https://demo.zvzdigital.com/v1/leads/preview", {
      method: "POST", headers: { origin: "https://www.zvzdigital.com" }, body: "{\"phone\":\"1\"}",
    }));
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://www.zvzdigital.com");
  });

  it("keeps the authenticated intake endpoint closed to browsers", async () => {
    const res = await call(new Request("https://demo.zvzdigital.com/v1/leads", {
      method: "POST", headers: { origin: "https://zvzdigital.com" }, body: "{}",
    }));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
