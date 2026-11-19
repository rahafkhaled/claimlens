"use client";
import { useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import { z } from "zod";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FolderClosed,
  GitBranch,
  Plus,
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
  stageLabels,
} from "@/lib/claims";
import { sample, demoClaims, mergeDemoClaims } from "@/lib/sample";
import { advanceReview, readReviewResponse, type ReviewEvent, type ReviewRun } from "@/lib/review-progress";
import { asDataUrl } from "@/lib/photos";
import { Modal } from "./ui";
import { AccidentDescription } from "./AccidentDescription";
import { ViewSwitcher } from "./ViewSwitcher";
import { SeniorDesk } from "./SeniorDesk";
import { AnalysisPanel, type AnalysisAction } from "./AnalysisPanel";
import { Evidence, FindingRecord } from "./Evidence";
import { EvidenceRequestEditor } from "./EvidenceRequest";
import { Intake } from "./Intake";
import { Activity, Review } from "./Review";

type Tab = "evidence" | "estimate" | "activity";
type Overlay = "new" | "add" | "queue" | "more" | "changes" | "reset" | "reanalyze" | null;
const navigation = [
  { id: "evidence", name: "Evidence" },
  { id: "estimate", name: "Estimate" },
  { id: "activity", name: "History" },
] as const;
const demoKey = "claimlens.workspace.v1";
const storageShape = z.object({
  claims: z.array(claimSchema).min(1),
  active: z.string(),
  role: z.enum(["agent", "senior"]).optional(),
});
export default function Workspace() {
  const [claims, setClaims] = useState<Claim[]>(demoClaims),
    [active, setActive] = useState(sample.id),
    [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("evidence"),
    [overlay, setOverlay] = useState<Overlay>(null),
    [selectedFinding, setSelectedFinding] = useState<number | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
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
  const hasAnalysis = !!activeRun || !!c.decision || !!c.lines.length || c.stage !== "intake";
  const progressVisible = hasAnalysis && ((showProgress && tab === "evidence") || !!busy);
  const locked = useRef(false);
  useEffect(() => {
    let alive = true;
    get<unknown>(demoKey)
      .then((data) => {
        const restored = storageShape.safeParse(data);
        if (alive && restored.success) {
          setClaims(mergeDemoClaims(restored.data.claims));
          setActive(restored.data.active);
          setRole(restored.data.role ?? "agent");
          if (restored.data.role === "senior") setTab("estimate");
        }
      })
      .catch(() => {
        if (alive) setError("Local storage could not be read.");
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    void set(demoKey, { claims, active, role })
      .catch(() => {
        if (current)
          setError(
            "Your browser could not save this claim. Keep this tab open.",
          );
      });
    return () => {
      current = false;
    };
  }, [ready, claims, active, role]);
  function save(claim: Claim) {
    if (!locked.current) { setReviewRun(undefined); setShowProgress(true); }
    setClaims((prev) =>
      prev.some((item) => item.id === claim.id)
        ? prev.map((item) => (item.id === claim.id ? claim : item))
        : [claim, ...prev],
    );
  }
  function go(next: Tab) {
    setTab(next);
    setEstimateFocus(undefined);
    setSelectedFinding(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function open(next: Overlay) {
    setOverlay(next);
    setSelectedFinding(null);
    setViewedRequest(undefined);
    setNote("");
    setSearch("");
  }
  function request(type: "more" | "changes", photoIndex = 0) {
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
          "Evidence decision recorded",
          [quality.summary, decision.reason].filter(Boolean).join(" "),
          {
            quality: quality.summary,
            gaps: quality.gaps,
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
          },
        );
        if (stage !== "assessment") {
          save(current);
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
        save(
          addEvent(
            current,
            "Agent review requested",
            "No visible repair items identified.",
            {
              stage: "uncertain",
              request: "No accident-related repairs confirmed. Check the accident description and evidence before proceeding.",
              scopeReviewed: true, scopeNeedsReview: false,
              ...result,
            },
          ),
        );
        finish("uncertain");
        return;
      }
      save(
        addEvent(
          current,
          "Draft estimate generated",
          "Live photo review identified " + result.findings.length + " repair items. Estimate priced in QAR.",
          { stage: "review", ...result, scopeReviewed: true, scopeNeedsReview: false, request: "", authorization: undefined, currency: "QAR" },
        ),
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
  function analysisAction(action: AnalysisAction) {
    if (action === "analyze") { c.lines.length ? open("reanalyze") : void analyze(c, "quality"); return; }
    if (action === "request") { request("more"); return; }
    if (action === "receive") { open("add"); return; }
    if (action === "requestRecord") {
      const latest = [...(c.evidenceRequests ?? [])].reverse().find(item => item.status === "awaiting");
      if (latest) setViewedRequest(latest);
      else { go("evidence"); setShowProgress(false); }
      return;
    }
    if (action === "flagged") { go("evidence"); setShowProgress(false); return; }
    go("estimate");
    if (action === "inspection" || action === "pricing") setEstimateFocus(action);
  }
  const evidenceCard = (
    <Evidence
      key={c.id}
      claim={c}
      onAdd={() => open("add")}
      onRequest={(index) => request("more", index)}
      onReview={() => c.lines.length ? open("reanalyze") : void analyze(c, "quality")}
      readOnly={role === "senior" || c.stage === "senior"}
      locked={!!busy || !ready}
      reviewing={!!busy}
      primaryAnalysis={!hasAnalysis || needsScopeReview(c)}
      outcomeVisible={progressVisible}
      analysisPanel={progressVisible && tab === "evidence" ? <AnalysisPanel claim={c} run={activeRun} canAct={role === "agent" && c.stage !== "senior" && c.stage !== "authorized"} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} onAction={analysisAction} /> : undefined}
    />
  );
  const resolution = !progressVisible && role === "agent" && (c.stage === "uncertain" || c.stage === "missing") && (
    <div className="action-note">
      <div>
        <strong>
          {c.stage === "uncertain"
            ? "Agent review"
            : awaitingEvidence ? "Awaiting evidence" : "Evidence needed"}
        </strong>
        <p>{c.request || c.gaps.join(" ") || c.quality}</p>
      </div>
      <div className="button-row">
        {c.stage === "uncertain" ? (
          <>
            <button className="secondary" disabled={!!busy} onClick={() => request("more")}>
              Request evidence
            </button>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => {
                const next = addEvent(
                  c,
                  "Evidence accepted by agent",
                  "Agent reviewed the flagged photos and accepted them for damage assessment.",
                  { stage: "assessment", override: true },
                );
                save(next);
                void analyze(next, "damage");
              }}
            >
              Accept evidence & assess damage
              <Check />
            </button>
          </>
        ) : (
          <>
            {awaitingEvidence ? <>
              <button className="primary" disabled={!!busy} onClick={() => open("add")}>Record received evidence</button>
              <button className="secondary" disabled={!!busy} onClick={() => request("more")}>Request more evidence</button>
            </> : <button className="primary" disabled={!!busy} onClick={() => request("more")}>Request evidence</button>}
          </>
        )}
      </div>
    </div>
  );
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to workspace
      </a>
      <div className="body">
        <main id="main">
          <div className="claim-toolbar">
          <div className="file-meta">
            <span>{c.id}</span>

          </div>
          <nav aria-label="Claims">
            {role === "agent" && <button className="plain" onClick={() => open("queue")} disabled={!ready || !!busy}><FolderClosed size={16} />All claims</button>}
            {role === "agent" && <button className="secondary" onClick={() => open("new")} disabled={!ready || !!busy}><Plus size={15} />Create claim</button>}
            <ViewSwitcher role={role} disabled={!ready || !!busy} change={next => { setRole(next); setShowProgress(true); setDetailsOpen(false); open(null); setError(""); if (next === "senior") { const first = claims.find(item => item.stage === "senior"); if (first) setActive(first.id); go("estimate"); } else go("evidence"); }} />
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
              {busy ? "Analyzing evidence" : c.stage === "missing" && awaitingEvidence ? "Awaiting evidence" : stageLabels[c.stage]}
            </div>
          </div>
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
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {progressVisible && tab !== "evidence" && <AnalysisPanel claim={c} run={activeRun} canAct={role === "agent" && c.stage !== "senior" && c.stage !== "authorized"} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} onAction={analysisAction} />}
          <SeniorFrame role={role} claims={claims} active={c.id} select={id => { setActive(id); setShowProgress(true); setDetailsOpen(false); go("estimate"); setError(""); }}>
          {needsScopeReview(c) && c.lines.length > 0 && <p className="scope-notice">Analyze evidence against the accident description before approving this estimate.</p>}
          {role === "senior" && c.stage !== "senior" && c.stage !== "authorized" && <p className="scope-notice">This claim has not been submitted for senior approval.</p>}
          {tab === "estimate" ? (
            <fieldset className="review-lock" disabled={!!busy}>
              <Review
                key={c.id}
                c={c}
                role={role}
                save={save}
                request={request}
                onFinding={setSelectedFinding}
                focusRequirements={estimateFocus}
              />
            </fieldset>
          ) : tab === "activity" ? (
            <Activity c={c} />
          ) : (
            <>
              {resolution}
              {evidenceCard}
            </>
          )}
          </SeniorFrame>
        </main>
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
          close={() => open(null)}
          save={(next) => {
            save(next);
            setActive(next.id);
            setShowProgress(true); setDetailsOpen(false);
            setError("");
            go("evidence");
            open(null);

          }}
        />
      )}
      {overlay === "queue" && (
        <Modal title="All claims" close={() => open(null)}>
          <input
            aria-label="Search claims"
            placeholder="Search by claim, vehicle or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="queue">
            {claims
              .filter((x) =>
                (x.id + x.title + x.vehicle)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((x) => (
                <button
                  disabled={!!busy}
                  key={x.id}
                  onClick={() => {
                    setActive(x.id);
                    setShowProgress(true); setDetailsOpen(false);
                    go("evidence");
                    setError("");
                    open(null);
                  }}
                >
                  <img className="queue-photo" src={x.photos[0].poster ?? x.photos[0].src} alt="" />
                  <span>
                    <small>
                      {x.id} · {stageLabels[x.stage]}
                    </small>
                    <strong>{x.title}</strong>
                    <small>{x.vehicle}</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            {!claims.some((x) =>
              (x.id + x.title + x.vehicle)
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p>No matching claims.</p>}
          </div>
          <button className="text-button" disabled={!!busy} onClick={() => open("reset")}>Reset sample claims</button>
        </Modal>
      )}
      {viewedRequest && <EvidenceRequestEditor claim={c} record={viewedRequest} close={() => setViewedRequest(undefined)} />}
      {overlay === "more" && role === "agent" && (
        <EvidenceRequestEditor key={c.id} claim={c} initialIndex={requestPhoto} close={() => open(null)} save={next => {
          save(next); open(null); go("evidence");
        }} />
      )}
      {overlay === "changes" && (
        <Modal title={role === "senior" ? "Return estimate for changes" : "Flag estimate issues"} close={() => open(null)}>
          <form onSubmit={event => {
            event.preventDefault();
            if (!note.trim()) return;
            save(addEvent(c, "Estimate returned for changes", note.trim(), { stage: "corrections", request: note.trim() }));
            open(null); go("estimate");
          }}>
            <label>Flagged items or quote needed
              <textarea autoFocus required rows={4} value={note} maxLength={800} onChange={event => setNote(event.target.value)} />
            </label>
            <button className="primary" disabled={!note.trim()}>{role === "senior" ? "Return estimate" : "Save flagged issues"} <ArrowRight /></button>
          </form>
        </Modal>
      )}
      {overlay === "reanalyze" && (
        <Modal title="Reanalyze evidence?" close={() => open(null)}>
          <p>A new analysis will replace this draft and its edits.</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => open(null)}>Cancel</button>
            <button className="primary" onClick={() => { open(null); void analyze(c, "quality"); }}>Reanalyze evidence</button>
          </div>
        </Modal>
      )}
      {overlay === "reset" && (
        <Modal title="Reset the four sample claims?" close={() => open(null)}>
          <p>Edits to these four claims will be cleared. Your uploaded claims stay saved.</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => open(null)}>Cancel</button>
            <button className="primary" onClick={() => {
              setClaims((old) => [...demoClaims.map((d) => old.find((x) => x.id === d.id && !x.sample) ?? d), ...old.filter((x) => !demoClaims.some((d) => d.id === x.id))]);
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
