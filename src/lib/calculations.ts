import type { ModelPricing } from "@/data/models"
import type { ModelUsage } from "@/lib/csv-parser"

export interface TokenRatio {
  /** % of tokens that are fresh input (0-100) */
  input: number
  /** % of tokens that are cached input reads (0-100) */
  cached: number
  /** % of tokens that are output (0-100) */
  output: number
}

/**
 * Calculate the weighted cost per 1M tokens for a model given a token ratio.
 * For Anthropic models, assumes a portion of "cached" is actually cache-write.
 * @param cacheWriteFraction — fraction of cached tokens that are cache writes (0-1), default 0.2
 */
export function calcWeightedCostPer1M(
  model: ModelPricing,
  ratio: TokenRatio,
  cacheWriteFraction = 0.2,
): number {
  const inputFrac = ratio.input / 100
  const cachedFrac = ratio.cached / 100
  const outputFrac = ratio.output / 100

  let cachedCost: number
  if (model.cacheWritePer1M !== null) {
    // Anthropic: split cached into read + write
    const readFrac = cachedFrac * (1 - cacheWriteFraction)
    const writeFrac = cachedFrac * cacheWriteFraction
    cachedCost = readFrac * model.cachedPer1M + writeFrac * model.cacheWritePer1M
  } else {
    cachedCost = cachedFrac * model.cachedPer1M
  }

  return inputFrac * model.inputPer1M + cachedCost + outputFrac * model.outputPer1M
}

/**
 * Calculate the cost multiplier of a model relative to the cheapest model.
 */
export function calcCostMultiplier(
  model: ModelPricing,
  cheapestCostPer1M: number,
  ratio: TokenRatio,
  cacheWriteFraction?: number,
): number {
  const cost = calcWeightedCostPer1M(model, ratio, cacheWriteFraction)
  return cheapestCostPer1M > 0 ? cost / cheapestCostPer1M : 1
}

/**
 * Find the cheapest weighted cost per 1M tokens across all models.
 */
export function findCheapestCostPer1M(
  models: ModelPricing[],
  ratio: TokenRatio,
  cacheWriteFraction?: number,
): number {
  return Math.min(...models.map(m => calcWeightedCostPer1M(m, ratio, cacheWriteFraction)))
}

export interface ModelMixEntry {
  modelId: string
  /** Percentage allocation (0-100) */
  percentage: number
  totalAics: number
}

/**
 * Derive the model mix (% allocation by AICs) from parsed usage data.
 * Only includes user-chosen models.
 */
export function calcModelMixFromUsage(userChosenModels: ModelUsage[]): ModelMixEntry[] {
  const totalAics = userChosenModels.reduce((s, m) => s + m.totalAics, 0)
  if (totalAics === 0) return []

  return userChosenModels
    .filter(m => m.modelId !== null)
    .map(m => ({
      modelId: m.modelId!,
      percentage: (m.totalAics / totalAics) * 100,
      totalAics: m.totalAics,
    }))
    .sort((a, b) => b.percentage - a.percentage)
}

/**
 * Calculate the AIC cost ratio between two models.
 * "If work costs X AICs on modelA, it costs X * ratio AICs on modelB."
 * Based on weighted cost per 1M tokens (assumes equivalent token volume).
 */
export function calcAicCostRatio(
  modelA: ModelPricing,
  modelB: ModelPricing,
  ratio: TokenRatio,
  cacheWriteFraction?: number,
): number {
  const costA = calcWeightedCostPer1M(modelA, ratio, cacheWriteFraction)
  const costB = calcWeightedCostPer1M(modelB, ratio, cacheWriteFraction)
  return costA > 0 ? costB / costA : 1
}

export interface SubstitutionRule {
  /** Source model ID — AICs to move away from */
  sourceModelId: string
  /** Target model ID — AICs to move to */
  targetModelId: string
  /** Fraction of source AICs to shift (0-1) */
  fraction: number
}

export interface SubstitutionResult {
  /** Original total AICs across all user-chosen models */
  originalTotalAics: number
  /** Projected total AICs after substitution */
  projectedTotalAics: number
  /** Difference (negative = savings) */
  aicDelta: number
  /** Per-model breakdown after substitution */
  projectedMix: Array<{
    modelId: string
    originalAics: number
    projectedAics: number
    delta: number
  }>
}

/**
 * Calculate the projected AIC impact of substituting one model for another.
 * Uses the cost ratio between models to estimate projected AICs.
 */
export function calcSubstitutionSavings(
  currentMix: ModelMixEntry[],
  rules: SubstitutionRule[],
  models: ModelPricing[],
  ratio: TokenRatio,
  cacheWriteFraction?: number,
): SubstitutionResult {
  const modelLookup = new Map(models.map(m => [m.id, m]))

  // Start with current AICs per model
  const aicMap = new Map<string, number>()
  for (const entry of currentMix) {
    aicMap.set(entry.modelId, entry.totalAics)
  }

  // Apply each substitution rule
  for (const rule of rules) {
    const sourceAics = aicMap.get(rule.sourceModelId) ?? 0
    const aicsToShift = sourceAics * rule.fraction

    if (aicsToShift <= 0) continue

    const sourceModel = modelLookup.get(rule.sourceModelId)
    const targetModel = modelLookup.get(rule.targetModelId)
    if (!sourceModel || !targetModel) continue

    const costRatio = calcAicCostRatio(sourceModel, targetModel, ratio, cacheWriteFraction)
    const projectedTargetAics = aicsToShift * costRatio

    // Reduce source, add to target
    aicMap.set(rule.sourceModelId, sourceAics - aicsToShift)
    aicMap.set(rule.targetModelId, (aicMap.get(rule.targetModelId) ?? 0) + projectedTargetAics)
  }

  const originalTotalAics = currentMix.reduce((s, e) => s + e.totalAics, 0)
  const projectedTotalAics = [...aicMap.values()].reduce((s, v) => s + v, 0)

  // Build per-model breakdown
  const allModelIds = new Set([...currentMix.map(e => e.modelId), ...aicMap.keys()])
  const projectedMix = [...allModelIds].map(modelId => {
    const original = currentMix.find(e => e.modelId === modelId)?.totalAics ?? 0
    const projected = aicMap.get(modelId) ?? 0
    return {
      modelId,
      originalAics: original,
      projectedAics: projected,
      delta: projected - original,
    }
  }).sort((a, b) => b.projectedAics - a.projectedAics)

  return {
    originalTotalAics,
    projectedTotalAics,
    aicDelta: projectedTotalAics - originalTotalAics,
    projectedMix,
  }
}
