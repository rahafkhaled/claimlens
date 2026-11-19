"use client";
import { Check, Circle, LoaderCircle, ScanLine, GitBranch, Camera, Calculator, ClipboardCheck, ShieldCheck, FileCheck2, ArrowRight, AlertCircle } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { type Claim, requiresInspection, needsScopeReview } from "@/lib/claims";
import type { ReviewRun, ReviewStep } from "@/lib/review-progress";
import { Modal } from "./ui";

type State = "waiting" | "active" | "done";
function Node({ title, detail, state, icon, manual = false }: { title: string; detail: string; state: State; icon: ReactNode; manual?: boolean }) {
  return <div className="review-node" data-state={state}>
    <span className="review-node-icon">{icon}</span>
    <div><strong>{title}</strong><small>{detail}</small></div>
    <span className="review-node-state" aria-label={state === "active" ? manual ? "Current step" : "In progress" : state === "done" ? "Complete" : "Pending"}>
      {state === "done" ? <Check size={15} /> : state === "active" ? manual ? <ArrowRight size={15} /> : <LoaderCircle size={15} className="spin" /> : <Circle size={11} />}
    </span>
  </div>;
}
function Connector({ state }: { state: State }) {
  return <div className="review-connector" data-state={state} aria-hidden="true"><i /><span /></div>;
}
export function WorkflowMap({ claim, run, close, proceed, canRequest = true }: {
  claim: Claim; canRequest?: boolean; run?: ReviewRun; close: () => void; proceed: () => void;
}) {
  const running = !!run && run.phase !== "complete" && run.phase !== "error";
  const failed = run?.phase === "error";
  const stale = !run && needsScopeReview(claim) && (!!claim.decision || !!claim.lines.length);
  const decision = run ? run.decision : stale ? null : claim.decision;
  const phase = run?.phase;
  const stage = run && run.phase !== "complete" ? "intake" : claim.stage;
  const status = (step: ReviewStep): State => {
    if (run) return run.completed.includes(step) ? "done" : phase === step ? "active" : "waiting";
    if (step === "loading") return "done";
    if (stale) return "waiting";
    if (step === "quality" || step === "decision") return claim.decision ? "done" : "waiting";
    return claim.lines.length || claim.findings.length ? "done" : "waiting";
  };
  const inspection = !running && !failed && !stale && claim.findings.some((f, i) => requiresInspection(f) && !claim.lines[i]?.inspectionNote?.trim());
  const quotes = !running && !failed && !stale && claim.lines.some(l => l.needsQuote);
  const final = stage === "authorized";
  const reviewState: State = final || stage === "senior" ? "done" : stage === "review" || stage === "corrections" ? "active" : "waiting";
  const count = run?.findingCount ?? claim.findings.length;
  const unpriced = run?.unpricedCount ?? claim.lines.filter(l => l.needsQuote).length;
  const labels: Record<string, string> = { loading: "Loading evidence", quality: "LLM is reviewing photos", decision: "Decision Model is deciding the route", damage: "LLM is assessing damage", pricing: "Matching catalogue entries", complete: "Review complete", error: "Review interrupted" };
  return <Modal title="Claim workflow" wide close={close}>
    <div className="review-flow" aria-label="Claim review workflow">
      <div className="review-flow-heading">
        <span className="review-flow-kicker">{claim.id} / {run ? "Live review" : stale ? "Review required" : claim.stage === "intake" ? "Not reviewed" : claim.decision ? "Saved review" : "Claim review"}</span>
        <span role="status" className="review-flow-status">{run ? labels[run.phase] : final ? "Authorized" : "Current progress"}</span>
      </div>
      <div className="review-evidence-rail" data-scanning={running && (phase === "loading" || phase === "quality" || phase === "damage")} aria-label="Evidence being reviewed">
        {claim.photos.slice(0, 6).map((photo, index) => <div className="review-evidence-frame" key={index} style={{ "--file-index": index } as CSSProperties}><img src={photo.poster ?? photo.src} alt={photo.name} /></div>)}
        <div className="review-evidence-caption"><strong>{claim.photos.length} evidence files</strong><small>Accident scope review</small></div>
      </div>
      <div className="review-automated">
        <Node title="Evidence" detail={`${claim.photos.length} files`} state={status("loading")} icon={<Camera size={18} />} />
        <Connector state={status("quality")} />
        <Node title="LLM" detail="Quality & coverage" state={status("quality")} icon={<ScanLine size={18} />} />
        <Connector state={status("decision")} />
        <div className="model-decision" data-state={status("decision")}>
          <Node title="Decision Model" detail={claim.override && !running ? "Agent override recorded" : "Evidence routing"} state={status("decision")} icon={<GitBranch size={18} />} />
          <div className="decision-branches">
            {([
              ["missing", "More evidence", "Request photos"],
              ["uncertain", "Uncertain", "Agent review"],
              ["sufficient", "Sufficient", "Continue"],
            ] as const).map(([choice, title, detail]) => <div key={choice} className="decision-branch" data-selected={decision?.choice === choice} data-muted={!!decision && decision.choice !== choice}>
              <span>{decision?.choice === choice ? <Check size={13} /> : <span className="branch-dot" />}{title}</span>
              <small>{detail}</small>
            </div>)}
          </div>
          <div className="decision-receipt" aria-live="polite">
            {decision ? <><strong>{Math.round(decision.confidence * 100)}% confidence</strong><span>{decision.modelChoice ? "Review rules applied" : run || claim.decisionSource === "jev" ? "Returned by Decision Model" : "Recorded decision"}</span></> : <span>{phase === "decision" ? "Awaiting Decision Model response…" : "Decision pending"}</span>}
          </div>
          {(run?.summary || (!run && !stale && claim.quality)) && <details className="decision-summary"><summary>Evidence summary</summary><p>{run?.summary || claim.quality}</p></details>}
          {decision?.reason && <details className="decision-summary"><summary>Why this route?</summary><p>{decision.reason}</p>{decision.modelChoice && <p>Original model route: {decision.modelChoice} · {Math.round(decision.confidence * 100)}% confidence</p>}</details>}
        </div>
        <Connector state={status("damage")} />
        <div className="review-pair">
          <Node title="Damage analysis" detail={status("damage") === "done" ? `${count} repair items` : "Accident-related damage"} state={status("damage")} icon={<ScanLine size={18} />} />
          <Node title="Pricing catalogue" detail={status("pricing") === "done" ? `${run?.pricedCount ?? claim.lines.filter(l => !l.needsQuote).length} priced${unpriced ? ` · ${unpriced} need quotes` : ""}` : "Parts + labor · QAR"} state={status("pricing")} icon={<Calculator size={18} />} />
        </div>
      </div>
      <Connector state={reviewState === "waiting" ? "waiting" : "done"} />
      <div className="review-human">
        <Node manual title="Agent approval" detail={inspection ? "Approval record required" : quotes ? "Quote required" : stage === "corrections" ? "Corrections requested" : "Check repairs & costs"} state={reviewState} icon={<ClipboardCheck size={18} />} />
        <Node manual title="Senior approval" detail="Confirm repair shop" state={final ? "done" : stage === "senior" ? "active" : "waiting"} icon={<ShieldCheck size={18} />} />
        <Node manual title="Authorization" detail="Download report" state={final ? "done" : "waiting"} icon={<FileCheck2 size={18} />} />
      </div>
      {failed && <p className="review-flow-error" role="alert"><AlertCircle size={17} />{run.error} Your saved assessment is unchanged.</p>}
      {!running && !failed && (stage === "missing" || stage === "uncertain" || inspection || quotes) && <p className="review-hold">
        {stage === "missing" || stage === "uncertain" ? claim.request || claim.gaps.join(" ") || "An agent needs to review the evidence." : inspection ? "Record agent approval before submitting." : "Resolve the outstanding quotes before approval."}
      </p>}
      <div className="review-flow-actions">
        <button className="secondary" onClick={close}>{running ? "Keep reviewing in background" : "Close"}</button>
        {!running && !failed && <button className="primary" onClick={proceed}>{stage === "missing" ? (claim.evidenceRequests?.some(request => request.status === "awaiting") ? "View request" : canRequest ? "Request evidence" : "View evidence") : stage === "intake" ? "View evidence" : stage === "uncertain" ? "Review evidence" : final ? "View authorization" : "Review estimate"}<ArrowRight size={15} /></button>}
      </div>
    </div>
  </Modal>;
}
