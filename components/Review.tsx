"use client";
import { useEffect, useRef, useState } from "react";
import {
  Calculator,
  Flag,
  Download,
  ArrowUpRight,
  FileCheck2,
  RotateCcw,
  FileText,
  PencilLine,
  Clock3,
  CheckCheck,
} from "lucide-react";
import {
  type Claim,
  type ViewRole,
  needsScopeReview,
  type Line,
  type Finding,
  addEvent,
  money,
  inspectionPending,
  inspectionSummary,
  total,
} from "@/lib/claims";
import { Modal } from "./ui";
import { activityTitle, claimStatus } from "@/lib/claim-status";
import { PricingSource } from "./PricingSource";
export function Review({
  c,
  role,
  save,
  request,
  onEvidence,
  onFinding,
  focusRequirements,
}: {
  c: Claim;
  role: ViewRole;
  focusRequirements?: "inspection" | "pricing";
  onEvidence: () => void;
  onFinding: (i: number) => void;
  save: (c: Claim) => void;
  request: (type: "more" | "changes", items?: string[]) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const selectedItems = selected.map(i => c.lines[i]?.component).filter(Boolean);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [edit, setEdit] = useState(false),
    [draft, setDraft] = useState<Line[]>([]),
    [confirm, setConfirm] = useState(false),
    [shop, setShop] = useState(""),
    [adjuster, setAdjuster] = useState(""),
    [observations, setObservations] = useState<Finding[]>([]);
  const shops = [
    "Atlas Collision Centre",
    "Harbor Auto Body",
    "Northside Coachworks",
  ];
  const stage = c.stage;
  const canEdit = role === "agent" && !needsScopeReview(c) && (stage === "review" || stage === "corrections");
  const hasQuote = c.lines.some((l) => l.needsQuote);
  const pendingInspection = c.findings.some(
    (f, i) => inspectionPending(f, c.lines[i]),
  );
  const awaitingEvidence = c.evidenceRequests?.some(request => request.status === "awaiting");
  const pending = hasQuote || pendingInspection || needsScopeReview(c) || awaitingEvidence;
  const requirementsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusRequirements) {
      requirementsRef.current?.focus({ preventScroll: true });
      requirementsRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [focusRequirements]);
  const [inspectionIndex, setInspectionIndex] = useState<number | null>(null);
  const [inspectionStatus, setInspectionStatus] = useState<"booked" | "completed">("booked");
  const [findingsText, setFindingsText] = useState("");
  const [repairDecision, setRepairDecision] = useState("");
  const [quoteOnly, setQuoteOnly] = useState(false);
  function startEdit(quoteIndex?: number) {
    setQuoteOnly(quoteIndex !== undefined);
    if (quoteIndex !== undefined) setSelected([quoteIndex]);
    setDraft(c.lines.map(l => ({ ...l, source: l.needsQuote && /required(?: · converted to QAR)?$/i.test(l.source) ? "" : l.source })));
    setObservations(c.findings.map((f) => ({ ...f })));
    setEdit(true);
  }
  const change = (i: number, changes: Partial<Line>) =>
    setDraft((p) => p.map((l, n) => (n === i ? { ...l, ...changes } : l)));
  return (
    <section className="panel estimate-panel">
      <div className="panel-head">
        <h2>
          <Calculator />
          Repair estimate
        </h2>
        <a className="text-button" href="/pricing" target="_blank" rel="noopener noreferrer">Pricing catalogue ↗</a>
      </div>
      {c.lines.length ? (
        <>
          <div className="estimate-total">
            <span>
              {stage === "authorized"
                ? "Authorized amount"
                : hasQuote
                  ? "Priced items subtotal"
                  : "Draft total"}
            </span>
            <b>{money(total(c.lines))}</b>
            {(hasQuote || pendingInspection) && <small>{pendingInspection ? "Inspection required" : "Quote required"}</small>}
          </div>
          {(pendingInspection || hasQuote) && <div className="estimate-requirements" ref={requirementsRef} tabIndex={-1} role="region" aria-label="Estimate requirements">
            <h3>{pendingInspection ? "Inspection requirements" : "Pricing gaps"}</h3>
            <p>{pendingInspection ? "Record the physical inspection findings and repair decision for each flagged item. A booked inspection keeps submission on hold." : "Get a quote from the supplier, then record the amount and reference here."}</p>
            <ul>{c.lines.map((line, index) => {
              const inspection = c.findings[index] && inspectionPending(c.findings[index], line);
              return inspection || line.needsQuote ? <li key={index}><strong>{line.component}</strong><span>{[inspection && "Inspection results needed", line.needsQuote && "Price and source needed"].filter(Boolean).join(" · ")}</span>{inspection && canEdit && <button className="text-button" onClick={() => {
                setInspectionIndex(index);
                setInspectionStatus(line.inspection?.status === "booked" ? "completed" : "booked");
                setFindingsText("");
                setRepairDecision("");
              }}>Update inspection</button>}{line.needsQuote && canEdit && <button className="text-button" onClick={() => startEdit(index)}>Enter supplier quote</button>}</li> : null;
            })}</ul>
          </div>}
          {canEdit && <div className="repair-toolbar">
            <div className="repair-toolbar-heading">
              <h3>Repair items</h3>
              {selecting && <span aria-live="polite">{selected.length} of {c.lines.length} selected</span>}
              <button className="text-button ml-auto" aria-expanded={selecting} onClick={() => {
                setSelected([]);
                setSelecting(!selecting);
              }}>{selecting ? "Done selecting" : "Select items"}</button>
            </div>
            {selecting && <div className="repair-controls"><div className="bulk-select">
              <button disabled={selected.length === c.lines.length} onClick={() => setSelected(c.lines.map((_, i) => i))}>Select all</button>
              <button disabled={!selected.length} onClick={() => setSelected([])}>Deselect all</button>
            </div><div className="item-tools">
              <button disabled={!selected.length} onClick={() => startEdit()}><PencilLine size={14} />Edit items</button>
              <button disabled={!selected.length} onClick={() => request("more", selectedItems)}><FileText size={14} />Request evidence</button>
              <button disabled={!selected.length} onClick={() => request("changes", selectedItems)}><Flag size={14} />Flag for review</button>
            </div></div>}
          </div>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Repair item</th>
                  <th>Parts</th>
                  <th>Labor</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map((l, i) => (
                  <tr key={i} data-selected={canEdit && selected.includes(i)}>
                    <td>
                      {canEdit && selecting && <input type="checkbox" className="repair-select" aria-label={"Select " + l.component} checked={selected.includes(i)} onChange={e => setSelected(old => e.target.checked ? [...old, i] : old.filter(index => index !== i))} />}
                      {c.findings[i] ? (
                        <button
                          className="line-link"
                          onClick={() => onFinding(i)}
                        >
                          {l.component}
                          <ArrowUpRight size={12} />
                        </button>
                      ) : (
                        <strong>{l.component}</strong>
                      )}
                      <small>{l.repair}</small>
                      {l.editedByAgentAt && <small className="agent-edit">Edited by claims agent · {new Date(l.editedByAgentAt).toLocaleDateString()}</small>}
                      <small>{l.needsQuote && canEdit ? <button className="text-button" onClick={() => startEdit(i)}>Enter supplier quote</button> : <PricingSource line={l} compact />}</small>
                      {c.findings[i]?.accidentReason && <small className="accident-reason">{c.findings[i].accidentReason}</small>}
                      {l.quoteConfirmedAt && <small>Quote confirmed by claims agent{l.zeroCostReason && " · " + l.zeroCostReason}</small>}
                      {l.inspection && <small>{inspectionSummary(l)}</small>}
                      {l.inspectionNote && (
                        <small>Agent approval · {l.inspectionNote}</small>
                      )}
                    </td>
                    <td>{l.needsQuote ? "—" : money(l.parts)}</td>
                    <td>{l.needsQuote ? "—" : money(l.labor)}</td>
                    <td>
                      {l.needsQuote ? "Quote needed" : money(l.parts + l.labor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.authorization && (
            <div className="auth-record">
              <FileCheck2 size={20} />
              <div>
                <strong>Authorized for {c.authorization.shop}</strong>
                <p>
                  {c.authorization.adjuster}, senior adjuster ·{" "}
                  {new Date(c.authorization.at).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
          {c.request && (
            <div className="inside notice">
              <strong>Review note</strong>
              <p>{c.request}</p>
            </div>
          )}
          {exportError && <p role="alert">{exportError}</p>}
          <div className="review-actions">
            {role === "agent" && stage === "review" && (
              <>
                <button
                  className={pending ? "secondary" : "primary"}
                  disabled={pending}
                  onClick={() =>
                    save(
                      addEvent(
                        c,
                        "Submitted to senior adjuster",
                        "Agent reviewed the findings and pricing sources.",
                        { stage: "senior", request: "" },
                        "unread",
                      ),
                    )
                  }
                >
                  Submit estimate for approval
                  <ArrowUpRight />
                </button>
              </>
            )}
            {role === "agent" && stage === "corrections" && (
              <button
                className={pending ? "secondary" : "primary"}
                disabled={pending}
                onClick={() =>
                  save(
                    addEvent(
                      c,
                      "Flagged items resolved",
                      "Updated estimate returned to agent review.",
                      { stage: "review", request: "" },
                    ),
                  )
                }
              >
                <CheckCheck />
                Mark corrections complete
              </button>
            )}
            {role === "senior" && stage === "senior" && (
              <>
                <button
                  className="secondary"
                  onClick={() => request("changes")}
                >
                  <RotateCcw />
                  Return for changes
                </button>
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() => setConfirm(true)}
                >
                  <FileCheck2 />
                  Authorize repairs
                </button>
              </>
            )}
            <button className={stage === "authorized" ? "primary" : "text-button"} disabled={exporting} onClick={async () => {
              setExporting(true); setExportError("");
              try { const { downloadReportPdf } = await import("@/lib/draft-pdf"); downloadReportPdf(c); }
              catch { setExportError("PDF export failed. Please try again."); }
              finally { setExporting(false); }
            }}>
              <Download />
              {exporting ? "Preparing PDF…" : stage === "authorized" ? "Download authorized report" : "Download draft PDF"}
            </button>
          </div>
        </>
      ) : (
        <div className="empty">
          <FileText />
          <h3>{c.evidenceUpdated && !awaitingEvidence ? "Updated evidence ready for assessment" : awaitingEvidence ? "Awaiting policyholder response" : stage === "missing" ? "More evidence needed" : stage === "uncertain" ? "Evidence needs manual review" : c.excludedFindings?.length ? "No accident-related repairs confirmed" : "Estimate pending"}</h3>
          <p>
            {c.evidenceUpdated && !awaitingEvidence ? "Assess the updated evidence in the Evidence tab." : awaitingEvidence ? "Add the policyholder response in Evidence, then assess the updated evidence." : stage === "missing" ? "Request the missing views from the Evidence tab." : stage === "uncertain" ? "Resolve the flagged evidence before creating an estimate." : c.excludedFindings?.length ? "Check the accident description and observations below." : "Assess evidence to create an estimate."}
          </p>
          <button className="secondary" onClick={onEvidence}>Open evidence</button>
        </div>
      )}
      {!!c.excludedFindings?.length && <section className="excluded-findings"><h3>Outside the estimate <span>{c.excludedFindings.length}</span></h3>{c.excludedFindings.map((finding, i) => <div key={i}><strong>{finding.component}</strong><span>{finding.accidentRelation === "unrelated" ? "Unrelated to this accident" : finding.visualBasis === "unconfirmed" ? "Visible damage unconfirmed" : "Accident connection unconfirmed"}</span><p>{finding.accidentReason}</p></div>)}</section>}

      {inspectionIndex !== null && <Modal title="Update inspection" close={() => setInspectionIndex(null)}>
        <form onSubmit={e => {
          e.preventDefault();
          const line = c.lines[inspectionIndex];
          const inspection: NonNullable<Line["inspection"]> = inspectionStatus === "booked" ? { status: "booked" } :
            { status: "completed", findings: findingsText.trim(), repairDecision: repairDecision.trim() };
          if (inspection.status === "completed" && (!inspection.findings || !inspection.repairDecision)) return;
          const revised = { ...line, inspection, editedByAgentAt: new Date().toISOString() };
          save(addEvent(c, inspection.status === "completed" ? "Inspection completed" : "Inspection booked",
            line.component + " · " + inspectionSummary(revised), { lines: c.lines.map((item, index) => index === inspectionIndex ? revised : item) }));
          setInspectionIndex(null);
        }}>
          <fieldset><legend>{c.lines[inspectionIndex].component}</legend>
            {c.findings[inspectionIndex]?.inspectionEvidence && <p>{c.findings[inspectionIndex].inspectionEvidence.observation}</p>}
            <label>Inspection status<select value={inspectionStatus} onChange={e => setInspectionStatus(e.target.value === "completed" ? "completed" : "booked")}>
              <option value="booked">Booked · awaiting findings</option><option value="completed">Completed</option>
            </select></label>
            {inspectionStatus === "completed" && <>
              <label>Technician findings<textarea required maxLength={600} value={findingsText} onChange={e => setFindingsText(e.target.value)} /></label>
              <label>Repair decision<textarea required maxLength={600} value={repairDecision} onChange={e => setRepairDecision(e.target.value)} /></label>
            </>}
          </fieldset>
          <button className="primary" disabled={inspectionStatus === "completed" && (!findingsText.trim() || !repairDecision.trim())}>Save inspection</button>
        </form>
      </Modal>}
      {edit && (
        <Modal title={quoteOnly ? "Enter supplier quote" : "Edit selected repairs"} close={() => setEdit(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(
                addEvent(
                  c,
                  "Estimate revised",
                  "Agent reviewed the revised pricing sources.",
                  {
                    lines: draft.map((line, i) => {
                      if (!selected.includes(i)) return c.lines[i];
                      const quoted = c.lines[i].needsQuote || c.lines[i].quoteConfirmedAt;
                      const revised = quoted ? { ...line, needsQuote: false, catalogueId: undefined,
                        source: line.source.trim(), zeroCostReason: line.parts + line.labor === 0 ? line.zeroCostReason?.trim() : undefined } : line;
                      return JSON.stringify(revised) !== JSON.stringify(c.lines[i]) || observations[i]?.damage !== c.findings[i]?.damage
                        ? { ...revised, editedByAgentAt: new Date().toISOString() } : revised;
                    }),
                    findings: observations.map((f, i) => !selected.includes(i) ? c.findings[i] : ({
                      ...f,
                      originalDamage: f.originalDamage ?? (f.damage !== c.findings[i].damage ? c.findings[i].damage : undefined),
                      repair: draft[i]?.repair ?? f.repair,
                    })),
                  },
                ),
              );
              setEdit(false);
            }}
          >
            {draft.map((l, i) => selected.includes(i) && (
              <fieldset key={i}>
                <legend>{l.component}</legend>
                {!quoteOnly && observations[i] && (
                  <label>
                    Observed damage
                    <input
                      required
                      maxLength={240}
                      value={observations[i].damage}
                      onChange={(e) =>
                        setObservations((old) =>
                          old.map((f, n) =>
                            n === i ? { ...f, damage: e.target.value } : f,
                          ),
                        )
                      }
                    />
                  </label>
                )}
                {!quoteOnly && <label>
                  Repair operation
                  <input
                    required
                    maxLength={240}
                    value={l.repair}
                    onChange={(e) => change(i, { repair: e.target.value })}
                  />
                </label>}
                <div className="field-pair">
                  <label>
                    Parts (QAR)
                    <input
                      type="number"
                      required
                      min="0"
                      max="1000000"
                      step=".01"
                      value={l.parts}
                      onChange={(e) =>
                        change(i, {
                          parts: Number(e.target.value),
                          quoteConfirmedAt: undefined,
                        })
                      }
                    />
                  </label>
                  <label>
                    Labor (QAR)
                    <input
                      type="number"
                      required
                      min="0"
                      max="1000000"
                      step=".01"
                      value={l.labor}
                      onChange={(e) =>
                        change(i, {
                          labor: Number(e.target.value),
                          quoteConfirmedAt: undefined,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Pricing source
                  <input
                    required
                    pattern=".*\S.*"
                    maxLength={180}
                    placeholder="Supplier or quote reference"
                    value={l.source}
                    onChange={(e) =>
                      change(i, { source: e.target.value, quoteConfirmedAt: undefined })
                    }
                  />
                </label>
                {(c.lines[i].needsQuote || c.lines[i].quoteConfirmedAt) && <>
                  {l.parts + l.labor === 0 && <label>Reason for zero cost
                    <input required pattern=".*\S.*" maxLength={600} value={l.zeroCostReason ?? ""}
                      placeholder="For example, covered by the supplier warranty"
                      onChange={e => change(i, { zeroCostReason: e.target.value, quoteConfirmedAt: undefined })} />
                  </label>}
                  <label><span><input type="checkbox" required checked={!!l.quoteConfirmedAt}
                    onChange={e => change(i, { quoteConfirmedAt: e.target.checked ? new Date().toISOString() : undefined })} />
                    {" "}I confirm the quoted amount of {money(l.parts + l.labor)} and its pricing source.</span></label>
                </>}
              </fieldset>
            ))}
            <button className="primary">{quoteOnly ? "Save supplier quote" : "Save estimate"}</button>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title="Authorize repairs?" close={() => setConfirm(false)}>
          <p>
            Approve the {money(total(c.lines))} estimate for {c.vehicle} and
            issue the authorized report.
          </p>
          <label>
            Approved repair shop
            <select value={shop} onChange={(e) => setShop(e.target.value)}>
              <option value="">Select a shop</option>
              {shops.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Senior adjuster name
            <input
              value={adjuster}
              maxLength={80}
              onChange={(e) => setAdjuster(e.target.value)}
              placeholder="Name for the authorization record"
            />
          </label>
          <dl className="authorization-summary" aria-label="Authorization summary">
            <div><dt>Amount to authorize</dt><dd>{money(total(c.lines))}</dd></div>
            <div><dt>Repair shop</dt><dd>{shop || "Select a repair shop above"}</dd></div>
          </dl>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={!shop || !adjuster.trim() || pending}
              onClick={() => {
                save(
                  addEvent(
                    c,
                    "Repairs authorized",
                    "Senior adjuster approved the estimate of " +
                      money(total(c.lines)) +
                      " at " +
                      shop +
                      " by " +
                      adjuster.trim() +
                      ".",
                    {
                      stage: "authorized",
                      request: "",
                      authorization: {
                        shop,
                        adjuster: adjuster.trim(),
                        at: new Date().toISOString(),
                      },
                    },
                  ),
                );
                setConfirm(false);
              }}
            >
              Confirm authorization
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function recallRecord(c: Claim, index: number) {
  const record = c.log[index];
  if (record?.delivery !== "unread") return c;
  const submission = record.title === "Submitted to senior adjuster";
  const log = c.log.map((event, i) => i === index ? { ...event, delivery: "recalled" as const } : event);
  return addEvent({ ...c, log }, submission ? "Submission recalled" : "Feedback recalled", "Recalled before senior review.", submission ? { stage: "review" } : {});
}
export function SubmissionStatus({ c, save }: { c: Claim; save: (c: Claim) => void }) {
  const index = c.log.findIndex(event => event.title === "Submitted to senior adjuster");
  const delivery = c.log[index]?.delivery;
  return (
    <section aria-label="Submission status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-4">
      <div>
        <strong>Awaiting senior approval</strong>
        <p className="text-sm text-muted-foreground">
          {delivery === "unread" ? "The senior adjuster hasn’t opened this submission. Recall it to edit the estimate."
            : delivery === "viewed" ? "The senior adjuster has viewed this submission. The recall window has closed."
            : "Read status is unavailable for this submission. Recall is unavailable."}
        </p>
      </div>
      {delivery === "unread" && <button className="secondary" onClick={() => save(recallRecord(c, index))}>Recall submission</button>}
    </section>
  );
}
export function Activity({ c, role, save }: { c: Claim; role: ViewRole; save: (c: Claim) => void }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          <Clock3 />
          Claim activity
        </h2>
        <span className="thin-label">{claimStatus(c).label} · {c.log.length} events</span>
      </div>
      <ol className="timeline">
        {c.log.map((l, i) => (
          <li key={i}>
            <i />
            <div>
              <strong>{activityTitle(c,l)}</strong>
              <p>{l.delivery === "recalled" ? "Recalled by agent" : l.detail}</p>
              {l.delivery === "viewed" && <small>Viewed by senior adjuster</small>}
              {role === "agent" && l.delivery === "unread" && l.title !== "Submitted to senior adjuster" && <button className="text-button" onClick={() => save(recallRecord(c, i))}>Recall feedback</button>}
              <time>
                {new Date(l.at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
