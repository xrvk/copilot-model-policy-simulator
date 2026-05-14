import { WarningCircle } from "@phosphor-icons/react"

export function DisclaimerBanner() {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex gap-3 items-start">
      <WarningCircle weight="duotone" className="text-warning shrink-0 mt-0.5" size={20} />
      <p className="text-sm text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">Directional estimates only.</span>{" "}
        This tool provides rough cost comparisons based on your usage data. Real-world costs
        will differ because each AI model processes the same prompt into a different number of
        tokens, produces different-length responses, and achieves different quality levels. The
        tool also does not account for behavior changes after policy updates, such as users sending
        more follow-up prompts when a different model requires additional back-and-forth.
        Restricting model choices to save costs may reduce developer productivity with GitHub
        Copilot. Use this tool to identify trends and inform governance discussions, not as a
        precise forecast.
      </p>
    </div>
  )
}
