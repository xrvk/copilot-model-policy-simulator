import { isSystemSelected, mapCsvModelToId, type ModelPricing, MODEL_PRICING } from "@/data/models"

export interface CsvRow {
  date: string
  username: string
  model: string
  aicQuantity: number
  aicGrossAmount: number
}

export interface ModelUsage {
  modelId: string | null
  csvModelName: string
  totalAics: number
  totalGrossAmount: number
  userCount: number
  rowCount: number
  isSystemSelected: boolean
  pricingData: ModelPricing | null
}

export interface ParsedUsageData {
  rows: CsvRow[]
  dateRange: { start: string; end: string }
  totalAics: number
  totalGrossAmount: number
  uniqueUsers: number
  modelUsage: ModelUsage[]
  /** Models the user chose directly — actionable for governance. */
  userChosenModels: ModelUsage[]
  /** System-selected models (Auto:, Code Review, Coding Agent). */
  systemSelectedModels: ModelUsage[]
  /** Rows dropped by April 2026 backfill normalization. */
  normalizedRowsDropped: number
  /** Rows with AIC values halved by April 2026 backfill normalization. */
  normalizedRowsModified: number
}

// April 2026 GitHub billing CSV exports for 2026-04-24 through 2026-04-30
// (inclusive) contain duplicated rows. GitHub decided not to fix the export
// server-side, so every ingestion client must normalize.
// Mirrors github/copilot-billing-preview commit 5d0b6eef75e5976d7b108328b95367c1a268e8c1
// (src/pipeline/parser.ts → normalizeTokenUsageRecord).
const BACKFILL_START = "2026-04-24"
const BACKFILL_END = "2026-04-30"

interface NormalizationDecision {
  action: "keep" | "drop" | "halve"
}

/**
 * Decide how to handle a raw CSV row given the April 2026 backfill rules.
 * - Outside window → keep unchanged
 * - In window AND quantity === 0 AND total_monthly_quota !== 0 → drop (invalid duplicate)
 * - In window AND total_monthly_quota === 0 AND unit_type === "requests" → halve AIC values
 * - Otherwise → keep unchanged
 */
function decideNormalization(
  date: string,
  quantity: number,
  unitType: string,
  totalMonthlyQuota: number,
): NormalizationDecision {
  const dateKey = date.slice(0, 10)
  if (dateKey < BACKFILL_START || dateKey > BACKFILL_END) {
    return { action: "keep" }
  }
  if (quantity === 0 && totalMonthlyQuota !== 0) {
    return { action: "drop" }
  }
  if (totalMonthlyQuota === 0 && unitType === "requests") {
    return { action: "halve" }
  }
  return { action: "keep" }
}

/**
 * Parse a Premium Request Usage Report CSV string into structured data.
 * Handles BOM, quoted fields, and "Auto:" prefixed model names.
 */
export function parseCsv(csvText: string): ParsedUsageData {
  // Strip BOM if present
  const text = csvText.replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)

  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row.")
  }

  const headers = parseCsvLine(lines[0]).map(h => h.replace(/^"/, "").replace(/"$/, "").trim())

  const modelIdx = findColumn(headers, "model")
  const dateIdx = findColumn(headers, "date")
  const usernameIdx = findColumn(headers, "username")
  const aicQtyIdx = findColumn(headers, "aic_quantity")
  const aicGrossIdx = findColumn(headers, "aic_gross_amount")
  const quantityIdx = findColumn(headers, "quantity")
  const unitTypeIdx = findColumn(headers, "unit_type")
  const quotaIdx = findColumn(headers, "total_monthly_quota")

  let normalizedRowsDropped = 0
  let normalizedRowsModified = 0

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length <= Math.max(modelIdx, dateIdx, usernameIdx, aicQtyIdx, aicGrossIdx, quantityIdx, unitTypeIdx, quotaIdx)) continue

    const date = unquote(cols[dateIdx])
    const quantity = parseFloat(unquote(cols[quantityIdx])) || 0
    const unitType = unquote(cols[unitTypeIdx])
    const quota = parseFloat(unquote(cols[quotaIdx])) || 0
    let aicQuantity = parseFloat(unquote(cols[aicQtyIdx])) || 0
    let aicGrossAmount = parseFloat(unquote(cols[aicGrossIdx])) || 0

    const decision = decideNormalization(date, quantity, unitType, quota)
    if (decision.action === "drop") {
      normalizedRowsDropped++
      continue
    }
    if (decision.action === "halve") {
      aicQuantity = aicQuantity / 2
      aicGrossAmount = aicGrossAmount / 2
      normalizedRowsModified++
    }

    rows.push({
      date,
      username: unquote(cols[usernameIdx]),
      model: unquote(cols[modelIdx]),
      aicQuantity,
      aicGrossAmount,
    })
  }

  // Aggregate by model
  const modelMap = new Map<string, { totalAics: number; totalGross: number; users: Set<string>; rows: number }>()
  const allUsers = new Set<string>()
  const dates = new Set<string>()

  for (const row of rows) {
    allUsers.add(row.username)
    dates.add(row.date)

    const existing = modelMap.get(row.model)
    if (existing) {
      existing.totalAics += row.aicQuantity
      existing.totalGross += row.aicGrossAmount
      existing.users.add(row.username)
      existing.rows++
    } else {
      modelMap.set(row.model, {
        totalAics: row.aicQuantity,
        totalGross: row.aicGrossAmount,
        users: new Set([row.username]),
        rows: 1,
      })
    }
  }

  const sortedDates = [...dates].sort()

  const modelUsage: ModelUsage[] = [...modelMap.entries()]
    .map(([csvName, data]) => {
      const modelId = mapCsvModelToId(csvName)
      return {
        modelId,
        csvModelName: csvName,
        totalAics: data.totalAics,
        totalGrossAmount: data.totalGross,
        userCount: data.users.size,
        rowCount: data.rows,
        isSystemSelected: isSystemSelected(csvName),
        pricingData: modelId ? MODEL_PRICING.find(m => m.id === modelId) ?? null : null,
      }
    })
    .sort((a, b) => b.totalAics - a.totalAics)

  return {
    rows,
    dateRange: {
      start: sortedDates[0] ?? "",
      end: sortedDates[sortedDates.length - 1] ?? "",
    },
    totalAics: rows.reduce((s, r) => s + r.aicQuantity, 0),
    totalGrossAmount: rows.reduce((s, r) => s + r.aicGrossAmount, 0),
    uniqueUsers: allUsers.size,
    modelUsage,
    userChosenModels: modelUsage.filter(m => !m.isSystemSelected),
    systemSelectedModels: modelUsage.filter(m => m.isSystemSelected),
    normalizedRowsDropped,
    normalizedRowsModified,
  }
}

function findColumn(headers: string[], name: string): number {
  const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase())
  if (idx === -1) throw new Error(`Required column "${name}" not found in CSV. Found: ${headers.join(", ")}`)
  return idx
}

function unquote(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }
  return trimmed
}

/** Simple CSV line parser that handles quoted fields with commas inside. */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        result.push(current)
        current = ""
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}
