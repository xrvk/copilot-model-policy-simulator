import { useState, useCallback, useRef } from "react"
import { UploadSimple, CheckCircle, XCircle } from "@phosphor-icons/react"
import { parseCsv } from "@/lib/csv-parser"
import type { ParsedUsageData } from "@/lib/csv-parser"
import { cn, formatNumber, formatDollars } from "@/lib/utils"

interface CsvImportProps {
  onImport: (data: ParsedUsageData | null) => void
  usageData: ParsedUsageData | null
}

export function CsvImport({ onImport, usageData }: CsvImportProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setFileName(file.name)
      try {
        const text = await file.text()
        const data = parseCsv(text)
        onImport(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse CSV")
      }
    },
    [onImport],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  if (usageData) {
    return (
      <div className="rounded-xl border-2 border-success/30 bg-success/5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle weight="fill" className="text-success" size={24} />
            <div>
              <p className="font-semibold text-foreground">
                {fileName ?? "CSV"} imported successfully
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatNumber(usageData.totalAics)} AICs · {formatDollars(usageData.totalGrossAmount)} spend · {usageData.uniqueUsers} users · {usageData.modelUsage.length} models
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onImport(null)
              setFileName(null)
              setError(null)
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
            className="text-sm text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click() } }}
        role="button"
        tabIndex={0}
        className={cn(
          "rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/50",
        )}
      >
        <UploadSimple weight="duotone" className="mx-auto text-muted-foreground mb-3" size={40} />
        <p className="font-semibold text-foreground">Drop your Premium Request Usage Report CSV here</p>
        <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
        <p className="text-xs text-muted-foreground mt-3">
          Download this report from your GitHub enterprise billing page under Copilot &gt; Usage Report.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-2">
          <XCircle weight="fill" className="text-destructive shrink-0" size={18} />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
