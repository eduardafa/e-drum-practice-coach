import { describe, expect, it } from "vitest";
import { AI_MODELS, approxCostPerTip, costMicros, findModel } from "./aiModels";

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
