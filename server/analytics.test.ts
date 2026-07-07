import "dotenv/config";
import { describe, it, expect } from "vitest";
import { analyticsRouter } from "./routers/analytics";
import type { TrpcContext } from "./_core/context";
import { loadEnv } from "./_core/env";

loadEnv(process.env);

function createCtx(): TrpcContext {
  return { env: null };
}

describe("analytics router", () => {
  it("keyMetrics returns numeric values for 30days period", async () => {
    const caller = analyticsRouter.createCaller(createCtx());
    const result = await caller.keyMetrics({ period: "30days" });
    expect(typeof result.sessions).toBe("number");
    expect(typeof result.bounceRate).toBe("number");
    expect(typeof result.avgSessionDuration).toBe("number");
    expect(typeof result.screenPageViewsPerSession).toBe("number");
  }, 30000);

  it("realtimeUsers returns activeUsers count", async () => {
    const caller = analyticsRouter.createCaller(createCtx());
    const result = await caller.realtimeUsers();
    expect(typeof result.activeUsers).toBe("number");
    expect(Array.isArray(result.activeUsersByMinute)).toBe(true);
  }, 30000);
});
