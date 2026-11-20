"use client";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { type Claim, needsScopeReview, money, total } from "@/lib/claims";
import type { ReviewRun } from "@/lib/review-progress";
import { estimateBlocker } from "@/lib/claim-status";
import { WorkflowMap } from "./WorkflowMap";

export type AnalysisAction = "analyze" | "request" | "receive" | "flagged" | "estimate" | "inspection" | "pricing" | "authorization" | "requestRecord";
type Outcome = { title: string; detail: string; label: string; action: AnalysisAction };
function outcome(claim: Claim, run: ReviewRun | undefined, canAct: boolean): Outcome {
  const awaiting = claim.evidenceRequests?.filter(request => request.status === "awaiting").length ?? 0;
  if (awaiting) return { title: "Awaiting policyholder response", detail: awaiting === 1 ? "One evidence request is open. Record the reply when it arrives." : `${awaiting} evidence requests are open. Select the requests covered by the reply.`, label: canAct ? "Add policyholder response" : "View request", action: canAct ? "receive" : "requestRecord" };
  if (run?.phase === "error") return { title: "Analysis interrupted", detail: (run.error ?? "The analysis could not finish.") + " Your saved assessment is unchanged.", label: "Try analysis again", action: "analyze" };
  if (claim.evidenceUpdated) return { title: "Updated evidence ready for assessment", detail: "The response is saved. The previous assessment is outdated and remains available until reassessment succeeds.", label: "Assess updated evidence", action: "analyze" };
  if (needsScopeReview(claim)) return { title: "Evidence needs analysis", detail: "Check the evidence against the current accident description before using this estimate.", label: "Assess updated evidence", action: "analyze" };
  if (claim.stage === "missing") return { title: claim.evidenceRequests?.some(r => r.status === "received") ? "Additional evidence still needed" : "More evidence needed", detail: claim.gaps.join(" ") || claim.request || "Request the missing views from the policyholder.", label: canAct ? (claim.evidenceRequests?.some(r => r.status === "received") ? "Review remaining gaps" : "Request additional evidence") : "View evidence requests", action: canAct ? "request" : "requestRecord" };
  if (claim.stage === "uncertain") return { title: "Evidence needs manual review", detail: "Check the flagged evidence before continuing the damage assessment.", label: "Check flagged evidence", action: "flagged" };
  if (claim.stage === "authorized") return { title: "Repairs authorized", detail: `${money(total(claim.lines))} · ${claim.authorization?.shop ?? "Approved repair shop"}`, label: "View authorization", action: "authorization" };
  if (claim.stage === "corrections") return { title: "Estimate changes requested", detail: claim.request || "Update the flagged items before submitting for approval.", label: "Review requested changes", action: "estimate" };
  if (claim.stage === "senior") return { title: "Awaiting senior approval", detail: "The estimate has been submitted to the senior adjuster.", label: "View submitted estimate", action: "estimate" };
  const blocker = estimateBlocker(claim);
  if (blocker === "inspection") return { title: "Inspection required", detail: "Record the completed inspection findings and repair decision before submitting the estimate.", label: "Review inspection requirements", action: "inspection" };
  if (blocker === "pricing") return { title: "Pricing needs confirmation", detail: "Some repair items need a pricing source before the estimate can be approved.", label: "Review pricing gaps", action: "pricing" };
  if (!claim.lines.length && claim.excludedFindings?.length) return { title: "No accident-related repairs confirmed", detail: "Review the excluded findings and their supporting observations.", label: "Review findings", action: "estimate" };
  if (!claim.lines.length) return { title: "Analysis required", detail: "Analyze the evidence to prepare a repair estimate.", label: "Assess evidence", action: "analyze" };
  return { title: "Draft estimate ready", detail: `${claim.lines.length} repair ${claim.lines.length === 1 ? "item" : "items"} · ${money(total(claim.lines))}. Check the repairs and costs before submitting for approval.`, label: "Review estimate", action: "estimate" };
}

export function AnalysisPanel({ claim, run, canAct, detailsOpen, setDetailsOpen, onAction }: {
  claim: Claim; run?: ReviewRun; canAct: boolean; detailsOpen: boolean; setDetailsOpen: (open: boolean) => void; onAction: (action: AnalysisAction) => void;
}) {
  const running = !!run && run.phase !== "complete" && run.phase !== "error";
  const result = outcome(claim, run, canAct);
  const initial = !run && claim.stage === "intake" && !claim.decision && !claim.evidenceUpdated;
  const step = run?.phase === "pricing" ? 3 : run?.phase === "damage" ? 2 : run?.phase === "decision" ? 1 : 0;
  const stageDetail = run?.phase === "loading" ? "Preparing the submitted evidence" : [
    "LLM · Checking photo quality",
    "Decision Model · Checking evidence completeness",
    "LLM · Assessing accident-related damage",
    "Matching repairs to the pricing catalogue",
  ][step];
  const levels = ["Prepare", "Photo quality", "Evidence decision", "Damage", "Pricing"];
  const verdict = run ? run.decision : needsScopeReview(claim) ? null : claim.decision;
  const verdictText = verdict?.choice === "sufficient" ? "Evidence sufficient" : verdict?.choice === "missing" ? "More evidence needed" : verdict ? "Manual review required" : "";
  const phaseIndex = ["loading","quality","decision","damage","pricing"].indexOf(run?.phase ?? "");
  const reached = running ? phaseIndex + 1 : run ? run.completed.length : verdict ? (claim.lines.length ? 5 : 3) : 0;
  const blockedAction = result.action === "analyze" && !canAct;
  return <section id="claim-review-progress" className="analysis-panel" data-running={running} aria-label="Claim review progress">
    <div className="analysis-summary">
      <div className="analysis-summary-copy" role="status" aria-atomic="true">
        <span className="analysis-eyebrow">Evidence assessment</span>
        <h2 tabIndex={-1}>{running ? stageDetail : initial ? "Ready to assess evidence" : result.title}</h2>

        {!running && <p role={run?.phase === "error" ? "alert" : undefined}>{result.detail}</p>}
      </div>
      {!running && !blockedAction && <button className="primary" onClick={() => onAction(result.action)}>{initial ? "Assess evidence" : result.label}<ArrowRight size={15} /></button>}
    </div>
    {(running || run || verdict) && <div className="assessment-track">
      <progress className="sr-only" aria-label="Evidence analysis progress" aria-valuetext={running ? stageDetail : result.title} value={reached} max={levels.length} />
      <ol aria-label="Assessment stages">{levels.map((label, i) => {
        const current = running && i === phaseIndex;
        const done = !current && i < reached;
        return <li key={label} data-state={current ? "current" : done ? "done" : "pending"} data-connected={i + 1 < reached} aria-current={current ? "step" : undefined}>
          <span className="stage-circle" aria-hidden="true">{done && <Check size={12} />}</span>
          {label}<span className="sr-only">{done ? ", complete" : current ? ", in progress" : ", not reached"}</span>
        </li>;
      })}</ol>
      {!running && verdictText && verdictText !== result.title && <p>{verdictText}</p>}
    </div>}
    {!running && claim.stage === "missing" && !claim.evidenceUpdated && <button className="text-button analysis-request-link" onClick={() => onAction("flagged")}>Review flagged evidence</button>}
    {canAct && claim.evidenceRequests?.some(request => request.status === "awaiting") && <button className="text-button analysis-request-link" onClick={() => onAction("requestRecord")}>View request</button>}
    {!initial && !running && <button className="analysis-disclosure" aria-expanded={detailsOpen} aria-controls="analysis-details" onClick={() => setDetailsOpen(!detailsOpen)}>
      {detailsOpen ? "Hide analysis details" : "View analysis details"}<ChevronDown size={15} />
    </button>}
    {detailsOpen && <div id="analysis-details" className="analysis-details"><WorkflowMap claim={claim} run={run} /></div>}
  </section>;
}
