import { type Claim, needsScopeReview, inspectionPending, stageLabels } from "./claims";
export function estimateBlocker(claim: Claim) {
  if (claim.findings.some((finding, index) => inspectionPending(finding, claim.lines[index]))) return "inspection";
  if (claim.lines.some(line => line.needsQuote)) return "pricing";
}

export function claimStatus(c: Claim) {
  if (c.evidenceRequests?.some(r => r.status === "awaiting")) return { label: "Awaiting policyholder response", action: "Add policyholder response", group: "awaiting", tone: "amber" };
  if (needsScopeReview(c) && (c.evidenceUpdated || c.lines.length || c.decision || c.evidenceRequests?.some(r => r.status === "received"))) return { label: "Updated evidence ready for assessment", action: "Assess updated evidence", group: "ready", tone: "blue" };
  if (c.stage === "missing") return { label: c.evidenceRequests?.some(r => r.status === "received") ? "Additional evidence still needed" : "More evidence needed", action: "Request additional evidence", group: "attention", tone: "amber" };
  if (c.stage === "uncertain") return { label: "Evidence needs manual review", action: "Review flagged evidence", group: "attention", tone: "amber" };
  if (c.stage === "intake") return { label: "New claim", action: "Assess evidence", group: "new", tone: "neutral" };
  if (c.stage === "senior") return { label: "Awaiting approval", action: "View submitted estimate", group: "approval", tone: "violet" };
  if (c.stage === "authorized") return { label: "Repairs authorized", action: "View authorization", group: "complete", tone: "green" };
  if (c.stage === "corrections") return { label: "Estimate changes requested", action: "Review requested changes", group: "attention", tone: "amber" };
  if (c.stage === "review") {
    const blocker = estimateBlocker(c);
    if (blocker === "inspection") return { label: "Inspection required", action: "Review inspection requirements", group: "attention", tone: "amber" };
    if (blocker === "pricing") return { label: "Pricing needs confirmation", action: "Review pricing gaps", group: "attention", tone: "amber" };
    if (!c.lines.length && c.excludedFindings?.length) return { label: "No accident-related repairs confirmed", action: "Review findings", group: "attention", tone: "amber" };
  }
  return { label: c.stage === "review" ? "Draft estimate ready" : stageLabels[c.stage], action: "Review estimate", group: "ready", tone: "blue" };
}

export const decisionLabel = { sufficient: "Evidence sufficient", uncertain: "Evidence needs manual review", missing: "More evidence needed" } as const;
export function activityTitle(c: Claim, event: Claim["log"][number]) {
  if (event.title !== "Evidence decision recorded" || !c.decision) return event.title;
  // Earlier records stored the explanation but not a structured route.
  const explanation = [c.quality, c.decision.reason].filter(Boolean).join(" ");
  return explanation && event.detail === explanation ? decisionLabel[c.decision.choice] : event.title;
}
