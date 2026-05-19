import { describe, it, expect } from "vitest"
import {
  calcWeightedCostPer1M,
  calcCostMultiplier,
  findCheapestCostPer1M,
  calcModelMixFromUsage,
  calcAicCostRatio,
  calcSubstitutionSavings,
  type TokenRatio,
} from "@/lib/calculations"
import { MODEL_PRICING } from "@/data/models"

const AGENT_RATIO: TokenRatio = { input: 40, cached: 30, output: 30 }
const CHAT_RATIO: TokenRatio = { input: 60, cached: 10, output: 30 }

const opus46 = MODEL_PRICING.find(m => m.id === "claude-opus-4.6")!
const sonnet46 = MODEL_PRICING.find(m => m.id === "claude-sonnet-4.6")!
const gpt41 = MODEL_PRICING.find(m => m.id === "gpt-4.1")!
const gpt54nano = MODEL_PRICING.find(m => m.id === "gpt-5.4-nano")!

describe("calcWeightedCostPer1M", () => {
  it("calculates weighted cost for a non-Anthropic model (no cache write)", () => {
    // GPT-4.1: input=$2, cached=$0.50, output=$8
    // Agent ratio: 40% input, 30% cached, 30% output
    // = 0.40*2 + 0.30*0.50 + 0.30*8 = 0.80 + 0.15 + 2.40 = 3.35
    const cost = calcWeightedCostPer1M(gpt41, AGENT_RATIO)
    expect(cost).toBeCloseTo(3.35, 2)
  })

  it("calculates weighted cost for Anthropic model (includes cache write)", () => {
    // Claude Opus 4.6: input=$5, cached=$0.50, cacheWrite=$6.25, output=$25
    // Agent ratio: 40% input, 30% cached, 30% output
    // Cached split (default 20% write): 30% * 80% = 24% read, 30% * 20% = 6% write
    // = 0.40*5 + 0.24*0.50 + 0.06*6.25 + 0.30*25
    // = 2.00 + 0.12 + 0.375 + 7.50 = 9.995
    const cost = calcWeightedCostPer1M(opus46, AGENT_RATIO)
    expect(cost).toBeCloseTo(9.995, 2)
  })

  it("supports custom cache write fraction", () => {
    // 0% cache write = all reads
    const costNoWrite = calcWeightedCostPer1M(opus46, AGENT_RATIO, 0)
    // = 0.40*5 + 0.30*0.50 + 0.30*25 = 2.00 + 0.15 + 7.50 = 9.65
    expect(costNoWrite).toBeCloseTo(9.65, 2)
  })
})

describe("findCheapestCostPer1M", () => {
  it("returns the lowest weighted cost across all models", () => {
    const cheapest = findCheapestCostPer1M(MODEL_PRICING, CHAT_RATIO)
    expect(cheapest).toBeGreaterThan(0)
    // GPT-5.4 nano should be the cheapest (or tied with it)
    const nanoCost = calcWeightedCostPer1M(gpt54nano, CHAT_RATIO)
    expect(cheapest).toBeLessThanOrEqual(nanoCost)
  })
})

describe("calcCostMultiplier", () => {
  it("returns 1 for the cheapest model", () => {
    const cheapest = findCheapestCostPer1M(MODEL_PRICING, AGENT_RATIO)
    const cheapestModel = MODEL_PRICING.find(
      m => Math.abs(calcWeightedCostPer1M(m, AGENT_RATIO) - cheapest) < 0.001
    )!
    const mult = calcCostMultiplier(cheapestModel, cheapest, AGENT_RATIO)
    expect(mult).toBeCloseTo(1, 2)
  })

  it("returns a multiplier > 1 for expensive models", () => {
    const cheapest = findCheapestCostPer1M(MODEL_PRICING, AGENT_RATIO)
    const mult = calcCostMultiplier(opus46, cheapest, AGENT_RATIO)
    expect(mult).toBeGreaterThan(1)
  })
})

describe("calcAicCostRatio", () => {
  it("Opus→Sonnet ratio is < 1 (Sonnet is cheaper)", () => {
    const ratio = calcAicCostRatio(opus46, sonnet46, AGENT_RATIO)
    expect(ratio).toBeLessThan(1)
  })

  it("Sonnet→Opus ratio is > 1 (Opus is more expensive)", () => {
    const ratio = calcAicCostRatio(sonnet46, opus46, AGENT_RATIO)
    expect(ratio).toBeGreaterThan(1)
  })

  it("same model ratio is 1", () => {
    const ratio = calcAicCostRatio(opus46, opus46, AGENT_RATIO)
    expect(ratio).toBeCloseTo(1, 5)
  })
})

describe("calcModelMixFromUsage", () => {
  it("calculates percentage allocation from AIC totals", () => {
    const usage = [
      { modelId: "claude-opus-4.6", csvModelName: "Claude Opus 4.6", totalAics: 700, totalGrossAmount: 7, userCount: 10, rowCount: 50, isSystemSelected: false, pricingData: opus46 },
      { modelId: "claude-sonnet-4.6", csvModelName: "Claude Sonnet 4.6", totalAics: 300, totalGrossAmount: 3, userCount: 20, rowCount: 30, isSystemSelected: false, pricingData: sonnet46 },
    ]
    const mix = calcModelMixFromUsage(usage)
    expect(mix).toHaveLength(2)
    expect(mix[0].modelId).toBe("claude-opus-4.6")
    expect(mix[0].percentage).toBeCloseTo(70, 1)
    expect(mix[1].percentage).toBeCloseTo(30, 1)
  })

  it("excludes models with null modelId", () => {
    const usage = [
      { modelId: "claude-opus-4.6", csvModelName: "Claude Opus 4.6", totalAics: 100, totalGrossAmount: 1, userCount: 5, rowCount: 10, isSystemSelected: false, pricingData: opus46 },
      { modelId: null, csvModelName: "Unknown Model", totalAics: 50, totalGrossAmount: 0.5, userCount: 2, rowCount: 5, isSystemSelected: false, pricingData: null },
    ]
    const mix = calcModelMixFromUsage(usage)
    expect(mix).toHaveLength(1)
  })
})

describe("calcSubstitutionSavings", () => {
  it("shows savings when shifting from expensive to cheaper model", () => {
    const mix = [
      { modelId: "claude-opus-4.6", percentage: 70, totalAics: 1_000_000 },
      { modelId: "claude-sonnet-4.6", percentage: 30, totalAics: 300_000 },
    ]
    const result = calcSubstitutionSavings(
      mix,
      [{ sourceModelId: "claude-opus-4.6", targetModelId: "claude-sonnet-4.6", fraction: 1.0 }],
      MODEL_PRICING,
      AGENT_RATIO,
    )
    expect(result.aicDelta).toBeLessThan(0) // Savings
    expect(result.projectedTotalAics).toBeLessThan(result.originalTotalAics)
  })

  it("shows increase when shifting from cheaper to expensive model", () => {
    const mix = [
      { modelId: "claude-sonnet-4.6", percentage: 100, totalAics: 1_000_000 },
    ]
    const result = calcSubstitutionSavings(
      mix,
      [{ sourceModelId: "claude-sonnet-4.6", targetModelId: "claude-opus-4.6", fraction: 1.0 }],
      MODEL_PRICING,
      AGENT_RATIO,
    )
    expect(result.aicDelta).toBeGreaterThan(0) // More expensive
  })

  it("partial shift (50%) moves only half the AICs", () => {
    const mix = [
      { modelId: "claude-opus-4.6", percentage: 100, totalAics: 1_000_000 },
    ]
    const full = calcSubstitutionSavings(
      mix,
      [{ sourceModelId: "claude-opus-4.6", targetModelId: "claude-sonnet-4.6", fraction: 1.0 }],
      MODEL_PRICING,
      AGENT_RATIO,
    )
    const half = calcSubstitutionSavings(
      mix,
      [{ sourceModelId: "claude-opus-4.6", targetModelId: "claude-sonnet-4.6", fraction: 0.5 }],
      MODEL_PRICING,
      AGENT_RATIO,
    )
    // Half shift should save roughly half as much
    expect(Math.abs(half.aicDelta)).toBeCloseTo(Math.abs(full.aicDelta) / 2, -3)
  })
})
