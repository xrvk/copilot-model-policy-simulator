import { useState, useMemo } from "react"
import { CaretUp, CaretDown, Star } from "@phosphor-icons/react"
import { MODEL_PRICING, CATEGORY_COLORS } from "@/data/models"
import { calcWeightedCostPer1M, findCheapestCostPer1M, type TokenRatio } from "@/lib/calculations"
import type { ParsedUsageData } from "@/lib/csv-parser"
import { cn, formatDollars } from "@/lib/utils"

interface PricingTableProps {
  data: ParsedUsageData
  tokenRatio: TokenRatio
}

type SortKey = "name" | "provider" | "category" | "inputPer1M" | "cachedPer1M" | "cacheWritePer1M" | "outputPer1M" | "weighted" | "multiplier"

interface ModelRow {
  model: (typeof MODEL_PRICING)[number]
  weighted: number
  multiplier: number
  inUsage: boolean
  cheapestInCategory: boolean
}

export function PricingTable({ data, tokenRatio }: PricingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("weighted")
  const [sortAsc, setSortAsc] = useState(true)

  const usedModelIds = useMemo(
    () => new Set(data.modelUsage.filter(m => m.modelId).map(m => m.modelId!)),
    [data],
  )

  const cheapestOverall = useMemo(
    () => findCheapestCostPer1M(MODEL_PRICING, tokenRatio),
    [tokenRatio],
  )

  const rows: ModelRow[] = useMemo(() => {
    const cheapestByCategory: Record<string, number> = {}
    for (const model of MODEL_PRICING) {
      const w = calcWeightedCostPer1M(model, tokenRatio)
      const cat = model.category
      if (cheapestByCategory[cat] === undefined || w < cheapestByCategory[cat]) {
        cheapestByCategory[cat] = w
      }
    }

    return MODEL_PRICING.map(model => {
      const weighted = calcWeightedCostPer1M(model, tokenRatio)
      return {
        model,
        weighted,
        multiplier: cheapestOverall > 0 ? weighted / cheapestOverall : 1,
        inUsage: usedModelIds.has(model.id),
        cheapestInCategory: weighted === cheapestByCategory[model.category],
      }
    })
  }, [tokenRatio, cheapestOverall, usedModelIds])

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "name": cmp = a.model.name.localeCompare(b.model.name); break
        case "provider": cmp = a.model.provider.localeCompare(b.model.provider); break
        case "category": cmp = a.model.category.localeCompare(b.model.category); break
        case "inputPer1M": cmp = a.model.inputPer1M - b.model.inputPer1M; break
        case "cachedPer1M": cmp = a.model.cachedPer1M - b.model.cachedPer1M; break
        case "cacheWritePer1M": cmp = (a.model.cacheWritePer1M ?? 0) - (b.model.cacheWritePer1M ?? 0); break
        case "outputPer1M": cmp = a.model.outputPer1M - b.model.outputPer1M; break
        case "weighted": cmp = a.weighted - b.weighted; break
        case "multiplier": cmp = a.multiplier - b.multiplier; break
      }
      return sortAsc ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortAsc])

  const maxMultiplier = Math.max(...rows.map(r => r.multiplier), 1)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Model Pricing Reference</h2>
        <p className="text-sm text-muted-foreground mt-1">
          All available Copilot models with per-token pricing. The "Weighted Cost" blends input, cached,
          and output rates using a balanced token mix. Models marked with ★ appear in your usage data.
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <SortHeader label="Model" sortKey="name" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortHeader label="Provider" sortKey="provider" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortHeader label="Category" sortKey="category" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortHeader label="Input $/1M" sortKey="inputPer1M" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <SortHeader label="Cached $/1M" sortKey="cachedPer1M" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <SortHeader label="Write $/1M" sortKey="cacheWritePer1M" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <SortHeader label="Output $/1M" sortKey="outputPer1M" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <SortHeader label="Weighted $/1M" sortKey="weighted" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <SortHeader label="Multiplier" sortKey="multiplier" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
                <th className="px-3 py-2.5 text-left w-40">
                  <span className="text-xs font-semibold text-muted-foreground">Relative Cost</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr
                  key={row.model.id}
                  className={cn(
                    "border-b last:border-0 transition-colors",
                    row.inUsage && "bg-primary/[0.03]",
                    row.cheapestInCategory && "bg-success/[0.04]",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {row.inUsage && <Star weight="fill" className="text-primary shrink-0" size={12} />}
                      <span className={cn("font-medium", row.inUsage ? "text-foreground" : "text-muted-foreground")}>
                        {row.model.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.model.provider}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", CATEGORY_COLORS[row.model.category])}>
                      {row.model.category}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-muted-foreground">
                    {formatDollars(row.model.inputPer1M)}
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-muted-foreground">
                    {formatDollars(row.model.cachedPer1M, 3)}
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-muted-foreground">
                    {row.model.cacheWritePer1M !== null ? formatDollars(row.model.cacheWritePer1M) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-muted-foreground">
                    {formatDollars(row.model.outputPer1M)}
                  </td>
                  <td className="px-3 py-2.5 text-right mono font-bold text-foreground">
                    {formatDollars(row.weighted, 3)}
                  </td>
                  <td className="px-3 py-2.5 text-right mono font-bold text-foreground">
                    {row.multiplier.toFixed(1)}×
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="h-4 rounded bg-muted/50 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded transition-all",
                          row.model.category === "Lightweight" && "bg-category-lightweight/50",
                          row.model.category === "Versatile" && "bg-category-versatile/50",
                          row.model.category === "Powerful" && "bg-category-powerful/50",
                        )}
                        style={{ width: `${(row.multiplier / maxMultiplier) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t bg-muted/20 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Star weight="fill" className="text-primary" size={10} /> In your usage data</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-success/30" /> Cheapest in category
          </span>
        </div>
      </div>
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  asc,
  onSort,
  align = "left",
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  asc: boolean
  onSort: (key: SortKey) => void
  align?: "left" | "right"
}) {
  const active = sortKey === currentKey
  return (
    <th
      className={cn(
        "px-3 py-2.5 cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap",
        align === "right" && "text-right",
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        {label}
        {active && (asc ? <CaretUp weight="bold" size={10} /> : <CaretDown weight="bold" size={10} />)}
      </span>
    </th>
  )
}
