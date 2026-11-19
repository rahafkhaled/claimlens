"use client";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { type Claim, needsScopeReview, requiresInspection, money, total } from "@/lib/claims";
import type { ReviewRun } from "@/lib/review-progress";
import { WorkflowMap } from "./WorkflowMap";

export type AnalysisAction = "analyze" | "request" | "receive" | "flagged" | "estimate" | "inspection" | "pricing" | "authorization" | "requestRecord";
type Outcome = { title: string; detail: string; label: string; action: AnalysisAction };
function outcome(claim: Claim, run: ReviewRun | undefined, canAct: boolean): Outcome {
  const awaiting = claim.evidenceRequests?.some(request => request.status === "awaiting");
  if (awaiting) return { title: "Awaiting policyholder evidence", detail: "Record the response before analyzing this claim again.", label: canAct ? "Record received evidence" : "View request", action: canAct ? "receive" : "requestRecord" };
  if (run?.phase === "error") return { title: "Analysis interrupted", detail: (run.error ?? "The analysis could not finish.") + " Your saved assessment is unchanged.", label: "Try analysis again", action: "analyze" };
  if (needsScopeReview(claim)) return { title: "Evidence needs analysis", detail: "Check the evidence against the current accident description before using this estimate.", label: "Reanalyze evidence", action: "analyze" };
  if (claim.stage === "missing") return { title: "More evidence required", detail: claim.gaps.join(" ") || claim.request || "Request the missing views from the policyholder.", label: canAct ? "Request evidence" : "View evidence requests", action: canAct ? "request" : "requestRecord" };
  if (claim.stage === "uncertain") return { title: "Agent decision required", detail: "Check the flagged evidence before continuing the damage assessment.", label: "Check flagged evidence", action: "flagged" };
  if (claim.stage === "authorized") return { title: "Repairs authorized", detail: `${money(total(claim.lines))} · ${claim.authorization?.shop ?? "Approved repair shop"}`, label: "View authorization", action: "authorization" };
  if (claim.findings.some((finding, index) => requiresInspection(finding) && !claim.lines[index]?.inspectionNote?.trim())) return { title: "Inspection required", detail: "Review the inspection requirements and record agent approval before submitting the estimate.", label: "Review inspection requirements", action: "inspection" };
  if (claim.lines.some(line => line.needsQuote)) return { title: "Pricing needs confirmation", detail: "Some repair items need a pricing source before the estimate can be approved.", label: "Review pricing gaps", action: "pricing" };
  if (claim.stage === "corrections") return { title: "Estimate changes requested", detail: claim.request || "Update the flagged items before submitting for approval.", label: "Review requested changes", action: "estimate" };
  if (claim.stage === "senior") return { title: "Awaiting senior approval", detail: "The estimate has been submitted to the senior adjuster.", label: "View submitted estimate", action: "estimate" };
  if (!claim.lines.length) return { title: "Analysis required", detail: "Analyze the evidence to prepare a repair estimate.", label: "Analyze evidence", action: "analyze" };
  return { title: "Estimate prepared", detail: `${claim.lines.length} repair ${claim.lines.length === 1 ? "item" : "items"} · ${money(total(claim.lines))}. Check the repairs and costs before submitting for approval.`, label: "Review estimate", action: "estimate" };
}

export function AnalysisPanel({ claim, run, canAct, detailsOpen, setDetailsOpen, onAction }: {
  claim: Claim; run?: ReviewRun; canAct: boolean; detailsOpen: boolean; setDetailsOpen: (open: boolean) => void; onAction: (action: AnalysisAction) => void;
}) {
  const running = !!run && run.phase !== "complete" && run.phase !== "error";
  const result = outcome(claim, run, canAct);
  const steps = ["Photo quality", "Evidence decision", "Accident damage", "Repair pricing"];
  const step = run?.phase === "pricing" ? 3 : run?.phase === "damage" ? 2 : run?.phase === "decision" ? 1 : 0;
  const stageDetail = run?.phase === "loading" ? "Preparing the submitted evidence" : [
    "LLM · Checking photo quality",
    "Decision Model · Checking evidence completeness",
    "LLM · Assessing accident-related damage",
    "Matching repairs to the pricing catalogue",
  ][step];
  const blockedAction = result.action === "analyze" && !canAct;
  return <section id="claim-review-progress" className="analysis-panel" data-running={running} aria-label="Claim review progress">
    <div className="analysis-summary">
      <div className="analysis-summary-copy" role="status" aria-atomic="true">
        {!running && <span className="analysis-eyebrow">Analysis outcome</span>}
        <h2 tabIndex={-1}>{running ? "Analyzing evidence" : result.title}</h2>
        {running && <p>{stageDetail}</p>}
        {!running && <p role={run?.phase === "error" ? "alert" : undefined}>{result.detail}</p>}
      </div>
      {!running && !blockedAction && <button className="primary" onClick={() => onAction(result.action)}>{result.label}<ArrowRight size={15} /></button>}
    </div>
    {running && <ol className="analysis-steps" aria-label="Analysis stages">
      {steps.map((label, index) => <li key={label} data-state={index < step ? "done" : index === step ? "active" : "waiting"} aria-current={index === step ? "step" : undefined}>
        <span className="analysis-step-marker" aria-hidden="true">{index < step ? <Check size={13} /> : index + 1}</span><span>{label}</span>
      </li>)}
    </ol>}
    {canAct && claim.evidenceRequests?.some(request => request.status === "awaiting") && <button className="text-button analysis-request-link" onClick={() => onAction("requestRecord")}>View request</button>}
    <button className="analysis-disclosure" aria-expanded={detailsOpen} aria-controls="analysis-details" onClick={() => setDetailsOpen(!detailsOpen)}>
      {detailsOpen ? "Hide analysis details" : "View analysis details"}<ChevronDown size={15} />
    </button>
    {detailsOpen && <div id="analysis-details" className="analysis-details"><WorkflowMap claim={claim} run={run} /></div>}
  </section>;
}
