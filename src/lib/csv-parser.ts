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

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length <= Math.max(modelIdx, dateIdx, usernameIdx, aicQtyIdx, aicGrossIdx)) continue

    rows.push({
      date: unquote(cols[dateIdx]),
      username: unquote(cols[usernameIdx]),
      model: unquote(cols[modelIdx]),
      aicQuantity: parseFloat(unquote(cols[aicQtyIdx])) || 0,
      aicGrossAmount: parseFloat(unquote(cols[aicGrossIdx])) || 0,
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
