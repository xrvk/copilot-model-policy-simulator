import { useState, useMemo, useCallback } from "react"
import { TrendDown, TrendUp, WarningCircle, Eye, EyeSlash, CaretDown, CaretRight } from "@phosphor-icons/react"
import { MODEL_PRICING, CATEGORY_COLORS, sortModelsForDropdown, type ModelCategory } from "@/data/models"
import {
  calcModelMixFromUsage,
  calcAicCostRatio,
  type TokenRatio,
} from "@/lib/calculations"
import type { ParsedUsageData } from "@/lib/csv-parser"
import { cn, formatCompact, formatDollars, formatNumber, formatPercent } from "@/lib/utils"

const CATEGORY_RANK: Record<ModelCategory, number> = { Powerful: 3, Versatile: 2, Lightweight: 1 }

function getQualityImpact(fromCategory: ModelCategory, toCategory: ModelCategory) {
  const diff = CATEGORY_RANK[fromCategory] - CATEGORY_RANK[toCategory]
  if (diff <= 0) return { label: "Low", color: "text-success bg-success/10", description: `${fromCategory} → ${toCategory}` }
  if (diff === 1) return { label: "Medium", color: "text-warning bg-warning/10", description: `${fromCategory} → ${toCategory}` }
  return { label: "High", color: "text-destructive bg-destructive/10", description: `${fromCategory} → ${toCategory}` }
}

interface WhatIfSimulatorProps {
  data: ParsedUsageData
  tokenRatio: TokenRatio
}

interface RedistributionTarget {
  modelId: string
  fraction: number
}

export function WhatIfSimulator({ data, tokenRatio }: WhatIfSimulatorProps) {
  // Track which models are disabled
  const [disabledModels, setDisabledModels] = useState<Set<string>>(new Set())
  // Track where disabled models' AICs go: disabledModelId -> targets
  const [redistributions, setRedistributions] = useState<Map<string, RedistributionTarget[]>>(new Map())
  // Track which disabled models have confirmed their redistribution pick
  const [confirmedPicks, setConfirmedPicks] = useState<Set<string>>(new Set())

  const currentMix = useMemo(
    () => calcModelMixFromUsage(data.userChosenModels),
    [data],
  )

  const modelLookup = useMemo(
    () => new Map(MODEL_PRICING.map(m => [m.id, m])),
    [],
  )

  // Models actually in usage (with AICs > 0)
  const usedModels = useMemo(
    () => currentMix.filter(e => e.totalAics > 0),
    [currentMix],
  )

  // Models that are still enabled (valid redistribution targets), sorted for dropdown
  const enabledModels = useMemo(
    () => sortModelsForDropdown(MODEL_PRICING.filter(m => !disabledModels.has(m.id))),
    [disabledModels],
  )

  // Track which impact groups are expanded (Medium/High default collapsed)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleModel = useCallback((modelId: string) => {
    setDisabledModels(prev => {
      const next = new Set(prev)
      if (next.has(modelId)) {
        next.delete(modelId)
        // Clear redistribution when re-enabling
        setRedistributions(r => {
          const nr = new Map(r)
          nr.delete(modelId)
          return nr
        })
        setConfirmedPicks(prev => {
          const next = new Set(prev)
          next.delete(modelId)
          return next
        })
      } else {
        next.add(modelId)
        // Clear any redistributions that point TO this model (it's no longer a valid target)
        setRedistributions(r => {
          const nr = new Map(r)
          for (const [srcId, targets] of nr) {
            if (targets.some(t => t.modelId === modelId)) {
              nr.delete(srcId)
              setConfirmedPicks(prev => {
                const next = new Set(prev)
                next.delete(srcId)
                return next
              })
            }
          }
          return nr
        })
      }
      return next
    })
  }, [])

  const setRedistTarget = useCallback((disabledId: string, targetId: string) => {
    setRedistributions(prev => {
      const nr = new Map(prev)
      nr.set(disabledId, [{ modelId: targetId, fraction: 1 }])
      return nr
    })
  }, [])

  // Calculate projected impact
  const projectedResult = useMemo(() => {
    const originalTotal = usedModels.reduce((s, m) => s + m.totalAics, 0)
    const projectedAics = new Map<string, number>()

    // Start with current AICs for enabled models
    for (const entry of usedModels) {
      if (!disabledModels.has(entry.modelId)) {
        projectedAics.set(entry.modelId, entry.totalAics)
      }
    }

    // Redistribute disabled models' AICs
    for (const entry of usedModels) {
      if (!disabledModels.has(entry.modelId)) continue
      const targets = redistributions.get(entry.modelId) ?? []
      const sourceModel = modelLookup.get(entry.modelId)
      if (!sourceModel) continue

      for (const target of targets) {
        const targetModel = modelLookup.get(target.modelId)
        if (!targetModel) continue

        const costRatio = calcAicCostRatio(sourceModel, targetModel, tokenRatio)
        const redistributedAics = entry.totalAics * target.fraction * costRatio
        projectedAics.set(
          target.modelId,
          (projectedAics.get(target.modelId) ?? 0) + redistributedAics,
        )
      }
    }

    const projectedTotal = [...projectedAics.values()].reduce((s, v) => s + v, 0)

    return {
      originalTotal,
      projectedTotal,
      delta: projectedTotal - originalTotal,
      projectedAics,
    }
  }, [usedModels, disabledModels, redistributions, modelLookup, tokenRatio])

  const hasChanges = disabledModels.size > 0
  const savings = -projectedResult.delta
  const isSaving = savings > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Model Policy Simulator</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Simulate disabling models from your Copilot policy. Toggle models off to see projected
          cost impact, then choose where you assume users will redistribute.
        </p>
      </div>

      {/* Model toggle list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Your Models · {usedModels.length - disabledModels.size} of {usedModels.length} enabled
            </h3>
            {hasChanges && (
              <button
                onClick={() => { setDisabledModels(new Set()); setRedistributions(new Map()) }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Reset all
              </button>
            )}
          </div>
        </div>

        <div className="divide-y">
          {usedModels.map(entry => {
            const model = modelLookup.get(entry.modelId)
            if (!model) return null
            const isDisabled = disabledModels.has(entry.modelId)
            const pct = projectedResult.originalTotal > 0
              ? (entry.totalAics / projectedResult.originalTotal) * 100
              : 0
            const redistTarget = redistributions.get(entry.modelId)?.[0]
            const targetModel = redistTarget ? modelLookup.get(redistTarget.modelId) : null
            const isConfirmed = confirmedPicks.has(entry.modelId)

            return (
              <div
                key={entry.modelId}
                className={cn(
                  "px-4 py-3 transition-colors",
                  isDisabled && "bg-destructive/[0.03]",
                  // High-impact rows get a left accent
                  isDisabled && isConfirmed && pct >= 10 && "border-l-2 border-l-success",
                )}
              >
                {/* Confirmed compact view */}
                {isDisabled && isConfirmed && targetModel ? (() => {
                  const ratio = calcAicCostRatio(model, targetModel, tokenRatio)
                  const savingsPct = (1 - ratio) * 100
                  const projectedSavings = entry.totalAics * savingsPct / 100
                  const isSmall = pct < 2

                  if (isSmall) {
                    // Single-line compact for small models
                    return (
                      <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <button onClick={() => toggleModel(entry.modelId)} className="shrink-0 p-1 text-destructive hover:bg-destructive/10 rounded cursor-pointer">
                            <EyeSlash weight="duotone" size={16} />
                          </button>
                          <span className="text-sm text-muted-foreground line-through">{model.name}</span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-sm text-primary">{targetModel.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-sm mono text-muted-foreground">
                            {savingsPct > 0 ? "−" : "+"}{formatDollars(Math.abs(projectedSavings * 0.01))}/mo
                          </span>
                          <button onClick={() => setConfirmedPicks(prev => { const n = new Set(prev); n.delete(entry.modelId); return n })} className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline cursor-pointer">Change</button>
                        </div>
                      </div>
                    )
                  }

                  // Two-line layout for significant models
                  return (
                    <div className="grid grid-cols-[1fr_auto] gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleModel(entry.modelId)} className="shrink-0 p-1 text-destructive hover:bg-destructive/10 rounded cursor-pointer">
                            <EyeSlash weight="duotone" size={18} />
                          </button>
                          <span className="text-sm font-semibold text-muted-foreground line-through">{model.name}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{model.category}</span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-sm font-medium text-primary">{targetModel.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 ml-8">
                          <span className="text-xs mono text-muted-foreground">{formatCompact(entry.totalAics)} AICs ({formatPercent(pct, 0)})</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className={cn("text-xs mono", savingsPct > 0 ? "text-success" : "text-destructive")}>
                            ↓{Math.round(Math.abs(savingsPct))}% savings
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end justify-center min-w-[120px]">
                        <span className={cn("text-base font-bold mono", savingsPct > 0 ? "text-success" : "text-destructive")}>
                          {savingsPct > 0 ? "−" : "+"}{formatDollars(Math.abs(projectedSavings * 0.01))}/mo
                        </span>
                        <button onClick={() => setConfirmedPicks(prev => { const n = new Set(prev); n.delete(entry.modelId); return n })} className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline cursor-pointer mt-0.5">Change</button>
                      </div>
                    </div>
                  )
                })() : (
                  <>
                    {/* Default / editing state */}
                    <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => toggleModel(entry.modelId)}
                          className={cn(
                            "shrink-0 p-1.5 rounded-lg transition-colors cursor-pointer",
                            isDisabled ? "text-destructive hover:bg-destructive/10" : "text-success hover:bg-success/10",
                          )}
                          title={isDisabled ? "Re-enable model" : "Disable model"}
                        >
                          {isDisabled ? <EyeSlash weight="duotone" size={18} /> : <Eye weight="duotone" size={18} />}
                        </button>
                        <span className={cn("text-sm font-medium", isDisabled ? "text-muted-foreground line-through" : "text-foreground")}>
                          {model.name}
                        </span>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", CATEGORY_COLORS[model.category])}>
                          {model.category}
                        </span>
                        <span className="text-xs text-muted-foreground">{model.provider}</span>
                      </div>
                      <div className="text-right min-w-[160px]">
                        <span className="text-sm mono font-medium text-foreground">
                          {formatDollars(entry.totalAics * 0.01)}
                        </span>
                        <span className="text-xs mono text-muted-foreground ml-2">
                          {formatCompact(entry.totalAics)} AICs · {formatPercent(pct, 0)}
                        </span>
                      </div>
                    </div>

                    {/* Redistribution picker (when disabled and not confirmed) */}
                    {isDisabled && !isConfirmed && (() => {
                      // Group enabled models by quality impact
                      type ImpactGroup = { level: string; color: string; models: Array<{ model: typeof enabledModels[0]; ratio: number; savingsPct: number }> }
                      const groups: ImpactGroup[] = [
                    { level: "Low quality impact", color: "border-success/30 bg-success/[0.03]", models: [] },
                    { level: "Medium quality impact", color: "border-warning/30 bg-warning/[0.03]", models: [] },
                    { level: "High quality impact", color: "border-destructive/30 bg-destructive/[0.03]", models: [] },
                  ]

                  for (const m of enabledModels) {
                    const ratio = calcAicCostRatio(model, m, tokenRatio)
                    const savingsPct = (1 - ratio) * 100
                    const impact = getQualityImpact(model.category, m.category)
                    const item = { model: m, ratio, savingsPct }
                    if (impact.label === "Low") groups[0].models.push(item)
                    else if (impact.label === "Medium") groups[1].models.push(item)
                    else groups[2].models.push(item)
                  }

                  return (
                    <div className="mt-3 ml-10 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Where do users go? Pick a replacement model:
                      </p>
                      {groups.filter(g => g.models.length > 0).map((group, groupIdx) => {
                        const isCollapsible = groupIdx > 0 // Medium and High are collapsible
                        const groupKey = `${entry.modelId}-${group.level}`
                        const isExpanded = !isCollapsible || expandedGroups.has(groupKey)

                        return (
                          <div key={group.level} className={cn("rounded-lg border p-3 space-y-2", group.color)}>
                            {isCollapsible ? (
                              <button
                                onClick={() => toggleGroup(groupKey)}
                                className="flex items-center gap-1.5 cursor-pointer w-full"
                              >
                                {isExpanded
                                  ? <CaretDown weight="bold" className="text-muted-foreground" size={10} />
                                  : <CaretRight weight="bold" className="text-muted-foreground" size={10} />
                                }
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  {group.level} ({group.models.length} models)
                                </p>
                              </button>
                            ) : (
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                {group.level}
                              </p>
                            )}
                            {isExpanded && (
                              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                {group.models.map(({ model: m, savingsPct }) => {
                                  const isSelected = redistTarget?.modelId === m.id
                                  const projectedSavings = entry.totalAics * savingsPct / 100
                                  return (
                                    <button
                                      key={m.id}
                                      onClick={() => setRedistTarget(entry.modelId, m.id)}
                                      className={cn(
                                        "text-left px-3 py-2 rounded-md border transition-all cursor-pointer",
                                        isSelected
                                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                                          : "border-border bg-card hover:border-primary/50",
                                      )}
                                    >
                                      <div className="text-sm font-medium text-foreground">{m.name}</div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className={cn(
                                          "text-xs mono font-bold",
                                          savingsPct > 1 ? "text-success" : savingsPct < -1 ? "text-destructive" : "text-muted-foreground",
                                        )}>
                                          {savingsPct > 1 ? `↓${Math.round(savingsPct)}%` : savingsPct < -1 ? `↑${Math.round(Math.abs(savingsPct))}%` : "~same"}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {savingsPct > 1
                                            ? `saves ${formatDollars(projectedSavings * 0.01)}/mo`
                                            : savingsPct < -1
                                            ? `adds ${formatDollars(Math.abs(projectedSavings) * 0.01)}/mo`
                                            : "no cost change"}
                                        </span>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Done button */}
                      {redistTarget && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => setConfirmedPicks(prev => new Set(prev).add(entry.modelId))}
                            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Quality tradeoff warning */}
      {[...disabledModels].some(id => {
        const src = modelLookup.get(id)
        const tgt = redistributions.get(id)?.[0]
        const tgtModel = tgt ? modelLookup.get(tgt.modelId) : null
        if (!src || !tgtModel) return false
        return CATEGORY_RANK[src.category] > CATEGORY_RANK[tgtModel.category]
      }) && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex gap-3 items-start">
          <WarningCircle weight="duotone" className="text-warning shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Quality tradeoff.</span>{" "}
            You're redirecting users from a higher-tier model to a lower tier. This will reduce costs
            but may impact code quality, accuracy, and developer experience. Consider piloting with a
            small group before a broad rollout.
          </p>
        </div>
      )}

      {/* Results */}
      {hasChanges && (() => {
        const savingsDollars = Math.abs(savings * 0.01)
        const quarterlySavings = savingsDollars * 3
        const pctChange = projectedResult.originalTotal > 0
          ? Math.abs(projectedResult.delta / projectedResult.originalTotal) * 100
          : 0
        const perSeatSavings = data.uniqueUsers > 0 ? savingsDollars / data.uniqueUsers : 0

        return (
          <div className={cn(
            "rounded-xl border-2 p-6 space-y-5",
            isSaving
              ? "border-success/30 bg-gradient-to-br from-success/5 to-transparent"
              : "border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent",
          )}>
            <h3 className="text-sm font-semibold text-foreground">Projected Impact</h3>

            {/* Hero: current → projected comparison */}
            <div className="flex items-end justify-center gap-6 py-2">
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Current</p>
                <p className="text-2xl font-bold mono text-foreground">{formatDollars(projectedResult.originalTotal * 0.01)}</p>
                <p className="text-xs mono text-muted-foreground">per month</p>
              </div>
              <div className="text-center pb-1">
                <span className="text-lg text-muted-foreground">→</span>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Projected</p>
                <p className="text-2xl font-bold mono text-foreground">{formatDollars(projectedResult.projectedTotal * 0.01)}</p>
                <p className="text-xs mono text-muted-foreground">per month</p>
              </div>
              <div className="text-center pb-1">
                <span className="text-lg text-muted-foreground">=</span>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  {isSaving ? "Savings" : "Increase"}
                </p>
                <div className="flex items-center justify-center gap-1.5">
                  {isSaving ? (
                    <TrendDown weight="duotone" className="text-success" size={20} />
                  ) : (
                    <TrendUp weight="duotone" className="text-destructive" size={20} />
                  )}
                  <p className={cn("text-2xl font-bold mono", isSaving ? "text-success" : "text-destructive")}>
                    {formatDollars(savingsDollars)}
                  </p>
                </div>
                <p className={cn("text-xs mono", isSaving ? "text-success/80" : "text-destructive/80")}>
                  {formatPercent(pctChange, 1)} · {formatDollars(quarterlySavings)}/qtr
                </p>
              </div>
            </div>

            {/* Supporting stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/30 rounded-lg px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Per-seat savings</p>
                <p className={cn("text-lg font-bold mono mt-1", isSaving ? "text-success" : "text-destructive")}>
                  {formatDollars(perSeatSavings)}
                </p>
                <p className="text-xs text-muted-foreground">across {formatNumber(data.uniqueUsers)} users</p>
              </div>
              <div className="bg-muted/30 rounded-lg px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AIC reduction</p>
                <p className="text-lg font-bold mono text-foreground mt-1">
                  {formatCompact(Math.abs(Math.round(savings)))}
                </p>
                <p className="text-xs mono text-muted-foreground">
                  {formatCompact(projectedResult.originalTotal)} → {formatCompact(Math.round(projectedResult.projectedTotal))}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Models disabled</p>
                <p className="text-lg font-bold mono text-foreground mt-1">{disabledModels.size}</p>
                <p className="text-xs text-muted-foreground">of {usedModels.length} in your policy</p>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
