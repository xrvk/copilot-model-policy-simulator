import { describe, it, expect } from "vitest"
import { parseCsv } from "@/lib/csv-parser"

const HEADER =
  '"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"'

function row(opts: {
  date: string
  username?: string
  model?: string
  quantity: number
  unitType: string
  quota: number
  aicQuantity: number
  aicGross: number
}): string {
  const {
    date,
    username = "alice",
    model = "gpt-4.1",
    quantity,
    unitType,
    quota,
    aicQuantity,
    aicGross,
  } = opts
  return [
    `"${date}"`,
    `"${username}"`,
    '"copilot"',
    '"sku"',
    `"${model}"`,
    `"${quantity}"`,
    `"${unitType}"`,
    '"0"',
    '"0"',
    '"0"',
    '"0"',
    `"${quota}"`,
    '"org"',
    '"cc"',
    `"${aicQuantity}"`,
    `"${aicGross}"`,
  ].join(",")
}

function csv(...dataRows: string[]): string {
  return [HEADER, ...dataRows].join("\n")
}

describe("parseCsv April 2026 backfill normalization", () => {
  it("leaves a clean March CSV unchanged", () => {
    const text = csv(
      row({ date: "2026-03-15", quantity: 5, unitType: "requests", quota: 0, aicQuantity: 50, aicGross: 0.5 }),
      row({ date: "2026-03-20", quantity: 1, unitType: "ai-credits", quota: 100, aicQuantity: 10, aicGross: 0.1 }),
    )
    const result = parseCsv(text)
    expect(result.normalizedRowsDropped).toBe(0)
    expect(result.normalizedRowsModified).toBe(0)
    expect(result.rows).toHaveLength(2)
    expect(result.totalAics).toBe(60)
  })

  it("drops invalid duplicate rows (qty=0, quota!=0) in window", () => {
    const text = csv(
      row({ date: "2026-04-25", quantity: 0, unitType: "requests", quota: 300, aicQuantity: 100, aicGross: 1.0 }),
      row({ date: "2026-04-25", quantity: 5, unitType: "ai-credits", quota: 200, aicQuantity: 50, aicGross: 0.5 }),
    )
    const result = parseCsv(text)
    expect(result.normalizedRowsDropped).toBe(1)
    expect(result.normalizedRowsModified).toBe(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].aicQuantity).toBe(50)
  })

  it("halves doubled request rows (quota=0, unit_type=requests) in window", () => {
    const text = csv(
      row({ date: "2026-04-30", quantity: 12, unitType: "requests", quota: 0, aicQuantity: 120, aicGross: 1.2 }),
    )
    const result = parseCsv(text)
    expect(result.normalizedRowsDropped).toBe(0)
    expect(result.normalizedRowsModified).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].aicQuantity).toBe(60)
    expect(result.rows[0].aicGrossAmount).toBeCloseTo(0.6)
  })

  it("leaves ai-credits rows in window unchanged", () => {
    const text = csv(
      row({ date: "2026-04-26", quantity: 10, unitType: "ai-credits", quota: 0, aicQuantity: 100, aicGross: 1.0 }),
    )
    const result = parseCsv(text)
    expect(result.normalizedRowsDropped).toBe(0)
    expect(result.normalizedRowsModified).toBe(0)
    expect(result.rows[0].aicQuantity).toBe(100)
  })

  it("leaves post-window rows unchanged", () => {
    const text = csv(
      row({ date: "2026-05-01", quantity: 12, unitType: "requests", quota: 0, aicQuantity: 120, aicGross: 1.2 }),
      row({ date: "2026-05-01", quantity: 0, unitType: "requests", quota: 300, aicQuantity: 80, aicGross: 0.8 }),
    )
    const result = parseCsv(text)
    expect(result.normalizedRowsDropped).toBe(0)
    expect(result.normalizedRowsModified).toBe(0)
    expect(result.rows).toHaveLength(2)
  })

  it("includes both window boundaries (2026-04-24 and 2026-04-30)", () => {
    const text = csv(
      row({ date: "2026-04-24", quantity: 12, unitType: "requests", quota: 0, aicQuantity: 120, aicGross: 1.2 }),
      row({ date: "2026-04-30", quantity: 0, unitType: "requests", quota: 300, aicQuantity: 50, aicGross: 0.5 }),
      row({ date: "2026-04-23", quantity: 12, unitType: "requests", quota: 0, aicQuantity: 120, aicGross: 1.2 }),
      row({ date: "2026-05-01", quantity: 12, unitType: "requests", quota: 0, aicQuantity: 120, aicGross: 1.2 }),
    )
    const result = parseCsv(text)
    expect(result.normalizedRowsDropped).toBe(1)
    expect(result.normalizedRowsModified).toBe(1)
    // 3 rows remain: halved 04-24, unchanged 04-23, unchanged 05-01
    expect(result.rows).toHaveLength(3)
  })

  it("matches window using slice(0,10) for ISO timestamps", () => {
    const text = csv(
      row({ date: "2026-04-25T12:00:00Z", quantity: 12, unitType: "requests", quota: 0, aicQuantity: 120, aicGross: 1.2 }),
    )
    const result = parseCsv(text)
    expect(result.normalizedRowsModified).toBe(1)
    expect(result.rows[0].aicQuantity).toBe(60)
  })
})
