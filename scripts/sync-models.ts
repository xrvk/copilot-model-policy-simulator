/**
 * Sync MODEL_PRICING in src/data/models.ts from the GitHub Docs upstream YAML.
 *
 * Source: https://github.com/github/docs/blob/main/data/tables/copilot/models-and-pricing.yml
 *
 * Behaviour:
 *  - Fetches the raw YAML.
 *  - Filters to providers we care about: openai, anthropic, google, xai.
 *    (Skips `github` fine-tuned models per product decision.)
 *  - Rewrites only the block between `// BEGIN GENERATED MODEL_PRICING` and
 *    `// END GENERATED MODEL_PRICING` in src/data/models.ts.
 *  - Full replacement: models removed upstream are removed locally.
 *
 * Run with: `npm run sync:models`
 * The drift-check CI workflow runs this and fails if the diff is non-empty.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODELS_TS_PATH = resolve(__dirname, "..", "src", "data", "models.ts")
const UPSTREAM_URL =
  "https://raw.githubusercontent.com/github/docs/main/data/tables/copilot/models-and-pricing.yml"

const BEGIN_MARKER = "// BEGIN GENERATED MODEL_PRICING"
const END_MARKER = "// END GENERATED MODEL_PRICING"

const SUPPORTED_PROVIDERS = ["openai", "anthropic", "google", "xai"] as const
type UpstreamProvider = (typeof SUPPORTED_PROVIDERS)[number] | "github"

const PROVIDER_LABEL: Record<(typeof SUPPORTED_PROVIDERS)[number], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
}

const ALLOWED_CATEGORIES = new Set(["Lightweight", "Versatile", "Powerful"])

interface UpstreamEntry {
  model: string
  provider: UpstreamProvider
  release_status?: string
  category: string
  input: string
  cached_input: string
  output: string
  cache_write?: string
  notes?: string
}

function stripFootnotes(name: string): string {
  return name.replace(/\[\^[^\]]+\]/g, "").trim()
}

function slugify(name: string): string {
  return stripFootnotes(name)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function parsePrice(raw: string, field: string, model: string): { value: number; literal: string } {
  if (typeof raw !== "string") {
    throw new Error(`Expected string price for ${field} on "${model}", got ${typeof raw}: ${raw}`)
  }
  const cleaned = raw.replace(/[$,\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) {
    throw new Error(`Could not parse ${field}="${raw}" as a number for "${model}"`)
  }
  // Preserve the upstream's exact decimal formatting (e.g. "2.50", "0.025")
  // so re-running the script produces a stable diff.
  return { value: n, literal: cleaned }
}

function renderEntry(entry: UpstreamEntry): string {
  if (!ALLOWED_CATEGORIES.has(entry.category)) {
    throw new Error(
      `Unknown category "${entry.category}" for model "${entry.model}". ` +
        `Expected one of: ${[...ALLOWED_CATEGORIES].join(", ")}. ` +
        `Update src/data/models.ts ModelCategory type if this is intentional.`,
    )
  }
  const provider = PROVIDER_LABEL[entry.provider as (typeof SUPPORTED_PROVIDERS)[number]]
  const cleanName = stripFootnotes(entry.model)
  const id = slugify(entry.model)
  const input = parsePrice(entry.input, "input", entry.model)
  const cached = parsePrice(entry.cached_input, "cached_input", entry.model)
  const output = parsePrice(entry.output, "output", entry.model)
  const cacheWrite =
    entry.cache_write != null ? parsePrice(entry.cache_write, "cache_write", entry.model) : null

  const cwLiteral = cacheWrite === null ? "null" : cacheWrite.literal

  return (
    `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(cleanName)}, ` +
    `provider: ${JSON.stringify(provider)}, category: ${JSON.stringify(entry.category)}, ` +
    `inputPer1M: ${input.literal}, cachedPer1M: ${cached.literal}, ` +
    `cacheWritePer1M: ${cwLiteral}, outputPer1M: ${output.literal} },`
  )
}

async function fetchUpstream(): Promise<string> {
  const res = await fetch(UPSTREAM_URL)
  if (!res.ok) {
    throw new Error(`Failed to fetch upstream YAML: ${res.status} ${res.statusText}`)
  }
  return await res.text()
}

function rewriteModelsFile(rendered: string): void {
  const original = readFileSync(MODELS_TS_PATH, "utf8")
  const beginIdx = original.indexOf(BEGIN_MARKER)
  const endIdx = original.indexOf(END_MARKER)
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    throw new Error(
      `Could not find sync markers in ${MODELS_TS_PATH}. ` +
        `Expected lines containing "${BEGIN_MARKER}" and "${END_MARKER}".`,
    )
  }
  const beforeMarker = original.slice(0, beginIdx + BEGIN_MARKER.length)
  const afterMarker = original.slice(endIdx)
  const next = `${beforeMarker}\n${rendered}\n  ${afterMarker}`
  writeFileSync(MODELS_TS_PATH, next, "utf8")
}

async function main() {
  const yamlText = await fetchUpstream()
  const entries = parseYaml(yamlText) as UpstreamEntry[]
  if (!Array.isArray(entries)) {
    throw new Error("Upstream YAML did not parse as an array.")
  }

  const kept = entries.filter((e) =>
    (SUPPORTED_PROVIDERS as readonly string[]).includes(e.provider),
  )
  const skipped = entries.filter(
    (e) => !(SUPPORTED_PROVIDERS as readonly string[]).includes(e.provider),
  )

  if (kept.length === 0) {
    throw new Error(
      "Upstream YAML had zero entries matching supported providers. Refusing to wipe MODEL_PRICING.",
    )
  }

  const rendered = kept.map(renderEntry).join("\n")
  rewriteModelsFile(rendered)

  console.log(`Wrote ${kept.length} models to ${MODELS_TS_PATH}`)
  const grouped: Record<string, number> = {}
  for (const e of kept) grouped[e.provider] = (grouped[e.provider] ?? 0) + 1
  for (const p of SUPPORTED_PROVIDERS) {
    if (grouped[p]) console.log(`  ${PROVIDER_LABEL[p]}: ${grouped[p]}`)
  }
  if (skipped.length) {
    console.log(
      `Skipped ${skipped.length} upstream entries from unsupported providers: ` +
        [...new Set(skipped.map((e) => e.provider))].join(", "),
    )
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
