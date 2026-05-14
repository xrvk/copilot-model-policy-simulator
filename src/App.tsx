import { useState, useCallback } from "react"
import { useTheme } from "next-themes"
import { Sun, Moon, Compass } from "@phosphor-icons/react"
import { TOKEN_RATIO_PRESETS } from "@/data/models"
import type { TokenRatio } from "@/lib/calculations"
import type { ParsedUsageData } from "@/lib/csv-parser"
import { DisclaimerBanner } from "@/components/DisclaimerBanner"
import { CsvImport } from "@/components/CsvImport"
import { CurrentState } from "@/components/CurrentState"
import { WhatIfSimulator } from "@/components/WhatIfSimulator"

// Hardcoded balanced token ratio (Agent coding preset).
// Analysis shows cost ratios between models are stable regardless of token mix,
// so exposing this as a user control adds confusion without meaningful accuracy gain.
const DEFAULT_RATIO: TokenRatio = {
  input: TOKEN_RATIO_PRESETS[1].input,
  cached: TOKEN_RATIO_PRESETS[1].cached,
  output: TOKEN_RATIO_PRESETS[1].output,
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const [usageData, setUsageData] = useState<ParsedUsageData | null>(null)

  const handleImport = useCallback((data: ParsedUsageData | null) => {
    setUsageData(data)
  }, [])

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark")
    else if (theme === "dark") setTheme("system")
    else setTheme("light")
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Compass weight="duotone" className="text-primary" size={22} />
            <h1 className="text-base font-semibold text-foreground">Model Policy Simulator</h1>
          </div>
          <button
            onClick={cycleTheme}
            className="p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? (
              <Moon weight="duotone" size={18} />
            ) : (
              <Sun weight="duotone" size={18} />
            )}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Step 1: Import */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">Step 1: Import Usage Data</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your enterprise's Premium Request Usage Report CSV to analyze model spending patterns.
            </p>
          </div>
          <CsvImport onImport={handleImport} usageData={usageData} />
          {!usageData && (
            <div className="mt-6">
              <DisclaimerBanner />
            </div>
          )}
        </section>

        {usageData && (
          <>
            {/* Step 2: Usage Summary */}
            <div className="h-px bg-border" />
            <section>
              <CurrentState data={usageData} />
            </section>

            {/* Step 3: Model Policy Simulator */}
            <div className="h-px bg-border" />
            <section>
              <WhatIfSimulator data={usageData} tokenRatio={DEFAULT_RATIO} />
            </section>
          </>
        )}

        {usageData && (
          <>
            <div className="h-px bg-border" />
            <DisclaimerBanner />
          </>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Dev by{" "}
          <a href="https://github.com/xrvk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@xrvk</a>
          {" · "}
          <a href="https://github.com/xrvk/copilot-model-policy-simulator" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Source</a>
        </p>
      </footer>
    </div>
  )
}
