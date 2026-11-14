import { APIError } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AI_MODELS, approxCostPerTip, costMicros, failureReason, findModel, InsightError } from "./aiModels";

describe("AI models", () => {
  it("puts each provider's cheapest model first (its default)", () => {
    for (const provider of ["anthropic", "openai"] as const) {
      const models = AI_MODELS.filter((m) => m.provider === provider);
      const prices = models.map((m) => approxCostPerTip(m));
      expect(prices[0]).toBe(Math.min(...prices));
    }
    expect(AI_MODELS.find((m) => m.provider === "anthropic")?.id).toBe("claude-haiku-5-5");
    expect(AI_MODELS.find((m) => m.provider === "openai")?.id).toBe("gpt-6-luna");
  });

  it("works out cost from tokens at the model's price, rounded up to millionths of a dollar", () => {
    const haiku = findModel("claude-haiku-5-5");
    const opus = findModel("claude-opus-5-5");
    if (!haiku || !opus) throw new Error("missing model");
    expect(costMicros(haiku, 2_500, 1_500)).toBe(1_000); // $0.001
    expect(costMicros(opus, 2_500, 1_500)).toBe(40_000); // $0.04
    expect(costMicros(haiku, 3, 0)).toBe(1); // rounded up
  });

  it("has unique IDs", () => {
    expect(new Set(AI_MODELS.map((m) => m.id)).size).toBe(AI_MODELS.length);
  });
});

const apiError = (status: number, message = "error") =>
  APIError.generate(status, { type: "error", error: { type: "x", message } }, message, new Headers());

describe("failureReason", () => {

  it("says which part failed, from the provider's status", () => {
    expect(failureReason(apiError(401))).toContain("rejected the app's API key");
    expect(failureReason(apiError(403))).toContain("isn't allowed");
    expect(failureReason(apiError(404))).toContain("isn't available");
    expect(failureReason(apiError(400, "Your credit balance is too low"))).toContain("out of credit");
    expect(failureReason(apiError(429))).toContain("limiting requests");
    expect(failureReason(apiError(529))).toContain("busy");
  });

  it("covers an unusable answer and anything unexpected", () => {
    expect(failureReason(new InsightError("No usable answer (refusal)", 0))).toContain("usable answer");
    expect(failureReason(new Error("boom"))).toContain("something went wrong");
  });
});
