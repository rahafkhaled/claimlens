"use client";
import { useEffect, useRef, useState } from "react";
import { update } from "idb-keyval";
import { z } from "zod";
import {
  ArrowRight,
  Check,
  FolderClosed,
  GitBranch,
  X,
} from "lucide-react";
import {
  type Claim,
  type EvidenceRequest,
  type ViewRole,
  needsScopeReview,
  addEvent,
  claimSchema,
  displayDate,
  evidenceDecision,
  findingsSchema,
  lineSchema,
  qualitySchema,
} from "@/lib/claims";
import { sample, demoClaims, mergeDemoClaims } from "@/lib/sample";
import { advanceReview, readReviewResponse, type ReviewEvent, type ReviewRun } from "@/lib/review-progress";
import { locatePins, type LocatedPin } from "@/lib/photo-pins";
import { asDataUrl } from "@/lib/photos";
import { Dashboard } from "./Dashboard";
import { claimStatus, decisionLabel, estimateBlocker } from "@/lib/claim-status";
import { Modal } from "./ui";
import { AccidentDescription } from "./AccidentDescription";
import { ViewSwitcher } from "./ViewSwitcher";
import { SeniorDesk } from "./SeniorDesk";
import { AnalysisPanel, type AnalysisAction } from "./AnalysisPanel";
import { Evidence, FindingRecord, PhotoViewer, photoPins } from "./Evidence";
import { EvidenceRequestEditor } from "./EvidenceRequest";
import { Intake } from "./Intake";
import { Activity, Review, SubmissionStatus } from "./Review";

type Tab = "evidence" | "estimate" | "activity";
type Overlay = "new" | "add" | "more" | "changes" | "reset" | "reanalyze" | "flags" | null;
const navigation = [
  { id: "evidence", name: "Evidence" },
  { id: "estimate", name: "Repair estimate" },
  { id: "activity", name: "Activity log" },
] as const;
const demoKey = "claimlens.workspace.v1";
const storageShape = z.object({
  claims: z.array(claimSchema).min(1),
  active: z.string(),
  role: z.enum(["agent", "senior"]).optional(),
});
type StoredWorkspace = z.infer<typeof storageShape>;

// IndexedDB serializes these read/write transactions across tabs. Navigation only
// updates its own fields; it must never put a cached claims list back into storage.
async function changeWorkspace(key: string, change: (saved: StoredWorkspace) => StoredWorkspace) {
  let committed!: StoredWorkspace;
  await update<StoredWorkspace>(key, saved => {
    if (!saved) throw new Error("The saved workspace is unavailable.");
    committed = change(saved);
    return committed;
  });
  return committed;
}

function sameClaimHistory(current: Claim | undefined, previous: Claim | undefined) {
  if (!current || !previous) return current === previous;
  return current.stage === previous.stage && current.log.length === previous.log.length &&
    current.log.every((event, index) => {
      const other = previous.log[index];
      return event.title === other.title && event.at === other.at &&
        event.detail === other.detail && event.delivery === other.delivery;
    });
}

function conflictMessage(claim?: Claim) {
  if (claim?.stage === "authorized") return "Repairs have already been authorized. The authorization is available in the repair estimate.";
  if (claim?.stage === "senior" && claim.log.find(e => e.title === "Submitted to senior adjuster")?.delivery === "viewed")
    return "The senior adjuster has opened this submission. The recall window has closed.";
  if (claim?.stage === "review" && claim.log.some(e => e.title === "Submission recalled"))
    return "The agent recalled this submission before senior review. It is back in agent review.";
  return "This claim changed in another tab. Review the latest saved claim before continuing.";
}

export default function Workspace({ example }: { example?: Claim }) {
  const workspaceKey = example ? demoKey + "." + example.id : demoKey;
  const [claims, setClaims] = useState<Claim[]>(example ? [example] : demoClaims),
    [active, setActive] = useState(example?.id ?? sample.id),
    [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>(example ? "estimate" : "evidence"),
    [overlay, setOverlay] = useState<Overlay>(null),
    [selectedFinding, setSelectedFinding] = useState<number | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [dashboard, setDashboard] = useState(!example);
  const [queueFilter, setQueueFilter] = useState("all");
  const [queueQuery, setQueueQuery] = useState("");
  const [flagIndex, setFlagIndex] = useState(0);
  const [responseId, setResponseId] = useState<string>();
  const [requestReason, setRequestReason] = useState("");
  const [repairItems, setRepairItems] = useState<string[]>([]);
  const [requestPins, setRequestPins] = useState<LocatedPin[]>();
  const [requestPhoto, setRequestPhoto] = useState(0);
  const [viewedRequest, setViewedRequest] = useState<EvidenceRequest>();
  const [role, setRole] = useState<ViewRole>("agent");
  const [showProgress, setShowProgress] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [estimateFocus, setEstimateFocus] = useState<"inspection" | "pricing">();
  const [reviewRun, setReviewRun] = useState<ReviewRun>();
  const c = claims.find((x) => x.id === active) ?? claims[0];
  const awaitingEvidence = c.evidenceRequests?.some(request => request.status === "awaiting") ?? false;
  const activeRun = reviewRun?.claimId === c.id ? reviewRun : undefined;
  const hasAnalysis = !!c.evidenceUpdated || !!activeRun || !!c.decision || !!c.lines.length || c.stage !== "intake";
  const progressVisible = (showProgress && tab === "evidence") || !!busy;
  const locked = useRef(false);
  useEffect(() => {
    let alive = true;
    let initial!: StoredWorkspace;
    update<StoredWorkspace>(workspaceKey, data => {
      initial = data === undefined ? { claims: example ? [example] : demoClaims, active: example?.id ?? sample.id, role: "agent" } : storageShape.parse(data);
      if (!example) initial = { ...initial, claims: mergeDemoClaims(initial.claims) };
      return initial;
    }).then(() => {
      if (!alive) return;
      setClaims(initial.claims);
      setActive(initial.active);
      setRole(initial.role ?? "agent");
      if (initial.role === "senior") { setTab("estimate"); setQueueFilter("approval"); }
      setReady(true);
    }).catch(() => {
      if (alive) setError("The saved workspace could not be opened. Refresh to try again.");
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void changeWorkspace(workspaceKey, saved => ({ ...saved, active, role })).catch(() => {
      setError("Your browser could not save this claim. Keep this tab open.");
    });
  }, [ready, active, role]);

  async function commitClaim(previous: Claim | undefined, next: Claim) {
    let conflict = false;
    try {
      const saved = await changeWorkspace(workspaceKey, workspace => {
        const current = workspace.claims.find(item => item.id === next.id);
        // Every workflow transition adds an event or updates its delivery receipt.
        // Compare inside the same transaction that writes the transition.
        if (!sameClaimHistory(current, previous)) {
          conflict = true;
          return workspace;
        }
        const claims = current ? workspace.claims.map(item => item.id === next.id ? next : item) : [next, ...workspace.claims];
        return { ...workspace, claims };
      });
      setClaims(saved.claims);
      if (conflict) setError(conflictMessage(saved.claims.find(item => item.id === next.id)));
      return !conflict;
    } catch {
      setError("Your browser could not save this claim. Keep this tab open.");
      return false;
    }
  }

  useEffect(() => {
    if (!ready || dashboard || role !== "senior") return;
    const isVisible = (event: Claim["log"][number]) => event.delivery === "unread" &&
      (tab === "activity" || (tab === "estimate" && event.title === "Submitted to senior adjuster"));
    if (!c.log.some(isVisible)) return;
    void commitClaim(c, { ...c, log: c.log.map(event => isVisible(event) ? { ...event, delivery: "viewed" } : event) });
  }, [c, dashboard, ready, role, tab]);

  function save(claim: Claim, previous = claims.find(item => item.id === claim.id)) {
    if (claim.id === c.id && c.stage !== "senior" && claim.stage === "senior") go("estimate");
    if (!locked.current) { setReviewRun(undefined); setShowProgress(true); }
    return commitClaim(previous, claim);
  }
  function go(next: Tab) {
    setTab(next);
    setEstimateFocus(undefined);
    setSelectedFinding(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function open(next: Overlay) {
    setResponseId(undefined);
    setOverlay(next);
    setSelectedFinding(null);
    setViewedRequest(undefined);
    setNote("");
  }
  function respondToRequest(id: string) {
    open("add");
    setResponseId(id);
  }
  function request(type: "more" | "changes", photoIndex = 0, items: string[] = [], reason = "", located?: LocatedPin[]) {
    setRequestPins(located);
    setRequestReason(reason);
    setRepairItems(items);
    setRequestPhoto(photoIndex);
    open(type);
    setNote(type === "more" ? c.gaps.join("\n") : "");
  }
  async function analyze(start: Claim, step: "quality" | "damage") {
    if (locked.current || role !== "agent" || start.evidenceRequests?.some(request => request.status === "awaiting")) return;
    if ((start.accidentDescription ?? start.details).trim().length < 10) { setError("Add an accident description before reviewing evidence."); return; }
    locked.current = true;
    setError("");
    setBusy("Loading photos…");
    setSelectedFinding(null);
    setOverlay(null);
    setShowProgress(true);
    setDetailsOpen(false);
    if (tab !== "evidence") go("evidence");
    document.getElementById("claim-review-progress")?.scrollIntoView({ block: "start", behavior: "instant" });
    setReviewRun({ claimId: start.id, phase: "loading", completed: [], decision: step === "damage" ? start.decision : null, summary: step === "damage" ? start.quality : "" });
    const emit = (event: ReviewEvent) => setReviewRun(old => old ? advanceReview(old, event) : old);
    const finish = (outcome: Claim["stage"]) => setReviewRun(old => old ? { ...old, phase: "complete", outcome } : old);
    let current = start;
    try {
      const images = await Promise.all(start.photos.map(asDataUrl));
      setReviewRun(old => old ? { ...old, completed: step === "damage" ? ["loading", "quality", "decision"] : ["loading"] } : old);
      async function run(kind: "quality" | "damage") {
        setBusy(
          kind === "quality"
            ? "Reviewing photos…"
            : "Assessing damage…",
        );
        emit({ type: "stage", stage: kind });
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          signal: AbortSignal.timeout(180_000),
          body: JSON.stringify({
            step: kind,
            vehicle: current.vehicle,
            details: current.details,
            accidentDescription: current.accidentDescription ?? current.details,
            images,
          }),
        });
        return readReviewResponse(res, emit);
      }
      if (step === "quality") {
        const { quality, decision } = z
          .object({ quality: qualitySchema, decision: evidenceDecision })
          .parse(await run("quality"));
        emit({ type: "quality", quality });
        emit({ type: "decision", decision });
        const stage =
          decision.choice === "sufficient"
            ? "assessment"
            : decision.choice === "missing"
              ? "missing"
              : "uncertain";
        current = addEvent(
          current,
          decisionLabel[decision.choice],
          [quality.summary, decision.reason].filter(Boolean).join(" "),
          {
            quality: quality.summary,
            gaps: quality.gaps,
            flags: [...quality.gaps, ...(quality.ambiguities ?? [])].map(text => ({ text, photos: (quality.references ?? []).filter(ref => ref.issue === text).flatMap(ref => ref.photos).filter(n => n <= current.photos.length) })),
            decision,
            decisionSource: "jev",
            stage,
            request:
              stage === "missing"
                ? quality.gaps.join(" ")
                : stage === "uncertain" ? decision.reason || quality.summary : "",
            override: false,
            lines: [],
            findings: [],
            excludedFindings: [],
            scopeReviewed: true,
            scopeNeedsReview: false,
            evidenceUpdated: false,
            authorization: undefined,
          },
        );
        if (stage !== "assessment") {
          await save(current, start);
          finish(stage);
          return;
        }
      }
      const result = z
        .object({ findings: findingsSchema, excludedFindings: findingsSchema.default([]), lines: z.array(lineSchema) })
        .parse(await run("damage"));
      emit({ type: "findings", count: result.findings.length });
      emit({ type: "priced", count: result.lines.filter(line => !line.needsQuote).length, unpriced: result.lines.filter(line => line.needsQuote).length });
      if (!result.findings.length) {
        await save(
          addEvent(
            current,
            "Evidence needs manual review",
            "No visible repair items identified.",
            {
              stage: "uncertain",
              request: "No accident-related repairs confirmed. Check the accident description and evidence before proceeding.",
              scopeReviewed: true, scopeNeedsReview: false,
              ...result,
            },
          ), start,
        );
        finish("uncertain");
        return;
      }
      await save(
        addEvent(
          current,
          "Draft estimate ready",
          "Live photo review identified " + result.findings.length + " repair items. Estimate priced in QAR.",
          { stage: "review", ...result, scopeReviewed: true, scopeNeedsReview: false, evidenceUpdated: false, request: "", authorization: undefined, currency: "QAR" },
        ), start,
      );
      finish("review");
    } catch (e) {
      emit({ type: "error", error: e instanceof Error ? e.message : "Analysis failed. Please retry." });
      setError(
        e instanceof Error ? e.message : "Analysis failed. Please retry.",
      );
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  function openDashboardClaim(claim: Claim, nextAction = false) {
    const status = claimStatus(claim);
    setActive(claim.id);
    setDashboard(false);
    setShowProgress(true);
    setDetailsOpen(false);
    setError("");
    const reviewingEstimate = ["review", "corrections", "senior", "authorized"].includes(claim.stage) && !needsScopeReview(claim) && status.group !== "awaiting";
    go(reviewingEstimate ? "estimate" : "evidence");
    if (nextAction && reviewingEstimate && role === "agent") setEstimateFocus(estimateBlocker(claim));
    if (!nextAction || role !== "agent") return;
    if (status.group === "awaiting") open("add");
    else if (status.group === "attention" && claim.stage === "missing") request("more");
    else if (status.group === "attention" && claim.stage === "uncertain") { setFlagIndex(0); open("flags"); }
    else if (status.group === "new" || status.group === "ready" && needsScopeReview(claim)) {
      if (claim.lines.length && !claim.evidenceUpdated) open("reanalyze");
      else void analyze(claim, "quality");
    }
  }
  function analysisAction(action: AnalysisAction) {
    if (action === "analyze") { c.lines.length && !c.evidenceUpdated ? open("reanalyze") : void analyze(c, "quality"); return; }
    if (action === "request") { request("more"); return; }
    if (action === "receive") { open("add"); return; }
    if (action === "requestRecord") {
      const latest = [...(c.evidenceRequests ?? [])].reverse().find(item => item.status === "awaiting");
      if (latest) setViewedRequest(latest);
      else { go("evidence"); setShowProgress(false); }
      return;
    }
    if (action === "flagged") { setFlagIndex(0); open("flags"); return; }
    go("estimate");
    if (action === "inspection" || action === "pricing") setEstimateFocus(action);
  }
  const evidenceCard = (
    <Evidence
      key={c.id}
      claim={c}
      onAdd={() => open("add")}
      onRespond={respondToRequest}
      onRequest={(index) => request("more", index)}
      onReview={() => c.lines.length && !c.evidenceUpdated ? open("reanalyze") : void analyze(c, "quality")}
      readOnly={role === "senior" || c.stage === "senior"}
      locked={!!busy || !ready}
      reviewing={!!busy}
      primaryAnalysis={!hasAnalysis || needsScopeReview(c)}
      outcomeVisible={progressVisible}
    />
  );
  const issues = c.flags?.length ? c.flags : (c.gaps.length ? c.gaps : [c.request || c.decision?.reason || c.quality || "Review the submitted evidence."]).map(text => ({text, photos: [] as number[]}));
  const issue = issues[flagIndex] ?? issues[0];
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to workspace
      </a>
      <header className="app-header"><div className="app-header-inner"><a className="app-brand" href="/" aria-label="Claims workspace home" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); open(null); setDashboard(true); window.scrollTo(0, 0); }}>Claims workspace</a><span className="app-local"><span />Local demo</span><ViewSwitcher role={role} disabled={!ready || !!busy} change={next => {
        if (next === role) return;
        setRole(next);
        setQueueFilter(next === "senior" ? "approval" : "all");
        setQueueQuery("");
        open(null);
        setError("");
        setDetailsOpen(false);
        setShowProgress(true);
        if (next === "senior") setDashboard(true);
        go(next === "agent" && ["review","corrections","senior","authorized"].includes(c.stage) ? "estimate" : "evidence");
      }} /></div></header>
      <div className="body">
        {dashboard && error && <p className="error banner" role="alert">{error}</p>}
        {dashboard ? <Dashboard filter={queueFilter} setFilter={setQueueFilter} query={queueQuery} setQuery={setQueueQuery} claims={claims} ready={ready} canCreate={role === "agent"} create={() => open("new")} reset={() => open("reset")} select={openDashboardClaim} /> : <>

        <main id="main">
          <div className="claim-toolbar">
          <div className="file-meta">
            <span>{c.id}</span>

          </div>
          <nav aria-label="Claims">
            <button className="plain" onClick={() => setDashboard(true)} disabled={!ready || !!busy}><FolderClosed size={16} />{role === "agent" ? "All claims" : "Review queue"}</button>

          </nav>
          </div>
          <div className="file-head">
            <div>
              <h1>{c.vehicle}</h1>
              <p>
                {c.title}
                <span>·</span> {displayDate(c.created)}
              </p>
            </div>
            <div className="case-state">
              <span className="status-dot" />
              {busy ? "Assessing evidence" : claimStatus(c).label}
            </div>
          </div>
          {role === "agent" && c.stage === "senior" && <SubmissionStatus c={c} save={save} />}
          <AccidentDescription key={c.id + "-accident"} claim={c} save={save} readOnly={role === "senior" || !!busy || c.stage === "authorized" || c.stage === "senior"} />
          <div className="file-navigation">
            <nav aria-label="Claim sections">
              {navigation.map(({ id, name }) => (
                <button
                  key={id}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => { go(id); setShowProgress(true); }}
                >
                  {name}
                  {id === "evidence" && <span>{c.photos.length}</span>}
                </button>
              ))}
            </nav>
            {hasAnalysis && !progressVisible && <button className="workflow-link" onClick={() => { go("evidence"); setShowProgress(true); setDetailsOpen(true); }}>
              <GitBranch size={14} />View analysis details
            </button>}
          </div>
          {error && !(progressVisible && activeRun?.phase === "error") && (
            <div className="error banner" role="alert">
              {error}
              {c.stage === "authorized" && tab !== "estimate" && <button className="text-button" onClick={() => go("estimate")}>View authorization</button>}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {progressVisible && <AnalysisPanel claim={c} run={activeRun} canAct={ready && role === "agent" && c.stage !== "senior" && c.stage !== "authorized"} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} onAction={analysisAction} />}
          <SeniorFrame role={role} claims={claims} active={c.id} select={id => { setActive(id); setShowProgress(true); setDetailsOpen(false); go("estimate"); setError(""); }}>
          {needsScopeReview(c) && c.lines.length > 0 && <p className="scope-notice">Previous assessment · Outdated. Assess the updated evidence and accident description before approving this estimate.</p>}
          {role === "senior" && c.stage !== "senior" && c.stage !== "authorized" && <p className="scope-notice">This claim has not been submitted for senior approval.</p>}
          {tab === "estimate" ? (
            <fieldset className="review-lock" disabled={!!busy}>
              <Review
                key={c.id}
                c={c}
                role={role}
                save={save}
                request={(type, items) => request(type, 0, items)}
                onEvidence={() => { go("evidence"); setShowProgress(true); }}
                onFinding={setSelectedFinding}
                focusRequirements={estimateFocus}
              />
            </fieldset>
          ) : tab === "activity" ? (
            <Activity c={c} role={role} save={save} />
          ) : (
            <>

              {evidenceCard}
            </>
          )}
          </SeniorFrame>
        </main>
        </>}
      </div>
      {selectedFinding !== null && c.findings[selectedFinding] && (
        <FindingRecord
          claim={c}
          index={selectedFinding}
          close={() => setSelectedFinding(null)}
        />
      )}
      {(overlay === "new" || overlay === "add") && (
        <Intake
          existing={overlay === "add" ? c : undefined}
          requestId={responseId}
          close={() => open(null)}
          save={(next) => {
            save(next);
            setActive(next.id);
            setDashboard(false);
            setShowProgress(true); setDetailsOpen(false);
            setError("");
            go("evidence");
            open(null);

          }}
        />
      )}
      {overlay === "flags" && <Modal title="Review flagged evidence" wide close={() => open(null)}>
        {issues.length > 1 && <label className="flag-picker">Flagged observation<select value={flagIndex} onChange={e => setFlagIndex(Number(e.target.value))}>{issues.map((f,i) => <option key={i} value={i}>{i + 1}. {f.text}</option>)}</select></label>}
        <p className="flag-observation">{issue.text}</p>
        <FlagPhotos key={flagIndex} claim={c} issue={issue} canRequest={role === "agent"} onRequest={(index, located) => request("more", index, [], issue.text, located)} />
        {role === "agent" && c.stage === "uncertain" && !awaitingEvidence && <button className="primary" onClick={async () => {
          const next = addEvent(c, "Evidence accepted by agent", "Agent accepted the available evidence for damage assessment.", { stage: "assessment", override: true });
          if (await save(next)) { open(null); void analyze(next, "damage"); }
        }}>Accept evidence &amp; assess damage</button>}
      </Modal>}
      {viewedRequest && <EvidenceRequestEditor claim={c} record={viewedRequest} onRespond={role === "agent" ? respondToRequest : undefined} close={() => setViewedRequest(undefined)} />}
      {overlay === "more" && role === "agent" && (
        <EvidenceRequestEditor key={c.id} claim={c} reason={requestReason} located={requestPins} repairItems={repairItems} initialIndex={requestPhoto} close={() => open(null)} save={next => {
          save(next); open(null); go("evidence");
        }} />
      )}
      {overlay === "changes" && (
        <Modal title={role === "senior" ? "Return estimate for changes" : "Flag repairs for review"} close={() => open(null)}>
          <form onSubmit={event => {
            event.preventDefault();
            if (!note.trim()) return;
            if (role === "senior") save(addEvent(c, "Estimate returned for changes", note.trim(), { stage: "corrections", request: note.trim() }));
            else save(addEvent(c, "Repairs flagged for review", [...repairItems, note.trim()].join("\n"), {}, "unread"));
            open(null); go("estimate");
          }}>
            {repairItems.length > 0 && <p>{repairItems.join(" · ")}</p>}
            <label>{role === "senior" ? "Changes needed" : "What needs a closer look?"}
              <textarea autoFocus required rows={4} value={note} maxLength={800} onChange={event => setNote(event.target.value)} />
            </label>
            <button className="primary" disabled={!note.trim()}>{role === "senior" ? "Return estimate" : "Save report to activity log"} <ArrowRight /></button>
          </form>
        </Modal>
      )}
      {overlay === "reanalyze" && (
        <Modal title="Reassess evidence?" close={() => open(null)}>
          <p>A successful assessment will replace this draft and its edits. If assessment fails, the previous draft stays available.</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => open(null)}>Cancel</button>
            <button className="primary" onClick={() => { open(null); void analyze(c, "quality"); }}>Assess evidence again</button>
          </div>
        </Modal>
      )}
      {overlay === "reset" && (
        <Modal title="Reset the four sample claims?" close={() => open(null)}>
          <p>Edits to these four claims will be cleared. Your uploaded claims stay saved.</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => open(null)}>Cancel</button>
            <button className="primary" onClick={async () => {
              try {
                const saved = await changeWorkspace(workspaceKey, workspace => ({ ...workspace, claims: [...demoClaims.map(d => workspace.claims.find(x => x.id === d.id && !x.sample) ?? d), ...workspace.claims.filter(x => !demoClaims.some(d => d.id === x.id))] }));
                setClaims(saved.claims);
              } catch { setError("Your browser could not reset the sample claims."); open(null); return; }
              setActive(sample.id); setReviewRun(undefined); setError(""); go("evidence"); open(null);
            }}>Reset sample claims</button>
          </div>
        </Modal>
      )}

    </div>
  );
}

function SeniorFrame({ role, claims, active, select, children }: { role: ViewRole; claims: Claim[]; active: string; select: (id: string) => void; children: React.ReactNode }) {
  return role === "senior" ? <SeniorDesk claims={claims} active={active} select={select}>{children}</SeniorDesk> : children;
}

function FlagPhotos({claim, issue, canRequest, onRequest}: {claim: Claim; issue: {text: string; photos: number[]}; canRequest: boolean; onRequest: (index: number, pins?: LocatedPin[]) => void}) {
  const cited = issue.photos.filter(n => claim.photos[n - 1]).map(n => n - 1);
  const [located, setLocated] = useState<LocatedPin[]>();
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<number>();
  useEffect(() => {
    const abort = new AbortController();
    locatePins(claim, [issue.text], abort.signal).then(pins => {
      if (!abort.signal.aborted) setLocated(pins);
    }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [claim, issue.text]);
  const indices = cited.length ? [...new Set([...cited, ...(located ?? []).map(pin => pin.index)])] : claim.photos.map((_, i) => i);
  const index = chosen ?? located?.[0]?.index ?? indices[0];
  const photo = claim.photos[index];
  const pins = (located ?? []).filter(pin => pin.index === index).map((pin, i) => ({
    ...pin, source: pin.reference ? "reference" as const : "ai" as const, id: "flag-" + i, title: "Flagged evidence", detail: pin.comment,
  }));
  return <div className="flag-photos">
    <PhotoViewer file={photo} count={indices.length} index={indices.indexOf(index)} select={n => setChosen(indices[n])} pins={[...pins, ...photoPins(claim, photo, index)]} />
    <div className="flag-caption"><p>{photo.name} · {indices.indexOf(index) + 1} of {indices.length}</p>
    <div className="pin-legend" aria-label="Pin colors"><span>AI pin</span><span>Agent pin</span>{located?.some(pin => pin.reference) && <span>Sample reference</span>}</div>
    </div>
    <p role="status">{failed ? "AI pin lookup unavailable. Review the photos or mark a location in the request." : !located ? "Locating the flagged area in the photos…" : located.length ? "" : "The AI could not pinpoint this observation in the submitted photos."}</p>
    {canRequest && <button className="secondary" disabled={!located && !failed} onClick={() => onRequest(located?.[0]?.index ?? index, located)}>Request a clearer view</button>}
  </div>;
}
