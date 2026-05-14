import { Users, CalendarBlank, CurrencyDollar, Lightning, Info } from "@phosphor-icons/react"
import type { ParsedUsageData } from "@/lib/csv-parser"
import { CATEGORY_COLORS, type ModelCategory } from "@/data/models"
import { cn, formatNumber, formatDollars, formatPercent } from "@/lib/utils"

interface CurrentStateProps {
  data: ParsedUsageData
}

function formatDateRangeDisplay(start: string, end: string): string {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    return { year, month, day }
  }

  const startParts = parse(start)
  const endParts = parse(end)
  if (!startParts || !endParts) return `${start} - ${end}`

  const monthLabel = (month: number) =>
    new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, month - 1, 1)),
    )

  const startLabel = `${monthLabel(startParts.month)} ${startParts.day}`
  const endLabel = `${monthLabel(endParts.month)} ${endParts.day}`

  if (startParts.year === endParts.year) {
    return `${startLabel} - ${endLabel}, ${startParts.year}`
  }

  return `${startLabel}, ${startParts.year} - ${endLabel}, ${endParts.year}`
}

export function CurrentState({ data }: CurrentStateProps) {
  const totalUserChosenAics = data.userChosenModels.reduce((s, m) => s + m.totalAics, 0)

  // Category breakdown of user-chosen model AICs
  const categoryBreakdown = data.userChosenModels.reduce<Record<string, number>>(
    (acc, m) => {
      const cat = m.pricingData?.category ?? "Unknown"
      acc[cat] = (acc[cat] ?? 0) + m.totalAics
      return acc
    },
    {},
  )

  const maxAics = Math.max(...data.modelUsage.map(m => m.totalAics), 1)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Your Usage Summary</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your enterprise's Copilot model usage for the imported period.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Lightning weight="duotone" size={20} />}
          label="Total AICs Consumed"
          value={formatNumber(data.totalAics)}
          tooltip="Total AI Credits consumed across all models and users"
        />
        <SummaryCard
          icon={<CurrencyDollar weight="duotone" size={20} />}
          label="Total Spend"
          value={formatDollars(data.totalGrossAmount)}
          tooltip="Gross spend (1 AIC = $0.01)"
        />
        <SummaryCard
          icon={<Users weight="duotone" size={20} />}
          label="Active Users"
          value={formatNumber(data.uniqueUsers)}
          tooltip="Unique users who consumed AICs"
        />
        <SummaryCard
          icon={<CalendarBlank weight="duotone" size={20} />}
          label="Date Range"
          value={formatDateRangeDisplay(data.dateRange.start, data.dateRange.end)}
          small
        />
      </div>

      {/* Spend by Model Tier */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Spend by Model Tier</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            GitHub classifies each Copilot model into a tier based on capability.
            Lightweight models are fast and cheap. Versatile models balance cost and quality.
            Powerful models offer the highest quality at higher cost.
          </p>
        </div>
        <div className="flex gap-6">
          {(["Lightweight", "Versatile", "Powerful"] as ModelCategory[]).map(cat => {
            const aics = categoryBreakdown[cat] ?? 0
            const pct = totalUserChosenAics > 0 ? (aics / totalUserChosenAics) * 100 : 0
            return (
              <div key={cat} className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border", CATEGORY_COLORS[cat])}>
                    {cat}
                  </span>
                  <span className="text-sm mono font-bold text-foreground">{formatPercent(pct, 0)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      cat === "Lightweight" && "bg-category-lightweight",
                      cat === "Versatile" && "bg-category-versatile",
                      cat === "Powerful" && "bg-category-powerful",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs mono text-muted-foreground">{formatDollars(aics * 0.01)}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Model Breakdown */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">AIC Consumption by Model</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Models your users explicitly selected, ranked by total spend.
            These are the models you can influence through governance policies.
          </p>
        </div>
        <div className="space-y-2">
          {data.userChosenModels.map(m => {
            const pct = totalUserChosenAics > 0 ? (m.totalAics / totalUserChosenAics) * 100 : 0
            const barWidth = (m.totalAics / maxAics) * 100
            return (
              <div key={m.csvModelName} className="group">
                <div className="flex items-center gap-3">
                  <div className="w-44 shrink-0 flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {m.pricingData?.name ?? m.csvModelName}
                    </span>
                  </div>
                  <div className="w-16 shrink-0">
                    {m.pricingData && (
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                          CATEGORY_COLORS[m.pricingData.category],
                        )}
                      >
                        {m.pricingData.category.slice(0, 3).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 h-5 rounded bg-muted/50 overflow-hidden relative">
                    <div
                      className={cn(
                        "h-full rounded transition-all",
                        m.pricingData?.category === "Lightweight" && "bg-category-lightweight/60",
                        m.pricingData?.category === "Versatile" && "bg-category-versatile/60",
                        m.pricingData?.category === "Powerful" && "bg-category-powerful/60",
                        !m.pricingData && "bg-muted-foreground/30",
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="w-24 shrink-0 text-right">
                    <span className="text-sm mono font-semibold text-foreground">{formatDollars(m.totalAics * 0.01)}</span>
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <span className="text-sm mono font-bold text-foreground">{formatPercent(pct, 1)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* System-selected inline callout */}
        {data.systemSelectedModels.length > 0 && (() => {
          const systemAics = data.systemSelectedModels.reduce((s, m) => s + m.totalAics, 0)
          const systemPct = data.totalAics > 0 ? (systemAics / data.totalAics) * 100 : 0
          return (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 mt-3">
              <Info weight="duotone" size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{formatPercent(systemPct, 0)} of total spend</span> comes from
                system-selected models (Auto mode, Code Review, Coding Agent). These respond to internal Copilot routing
                and cannot be restricted by model policy.
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  small?: boolean
  tooltip?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn("font-bold mono text-foreground", small ? "text-lg" : "text-2xl")}>
        {value}
      </p>
    </div>
  )
}
