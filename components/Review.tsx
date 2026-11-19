"use client";
import { useEffect, useRef, useState } from "react";
import {
  Calculator,
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
  requiresInspection,
  total,
} from "@/lib/claims";
import { Modal } from "./ui";
import { PricingCatalogue } from "./PricingCatalogue";
export function downloadReport(c: Claim) {
  const content = [
    c.stage === "authorized"
      ? "AUTHORIZED REPAIR REPORT"
      : "DRAFT REPAIR ESTIMATE",
    c.id + " | " + c.title,
    c.vehicle,
    "",
    "Accident description: " + (c.accidentDescription ?? c.details),
    "",
    c.sample
      ? "Demo claim — synthetic imagery; simulated decisions, prices and authorization"
      : "Vehicle inspection record",
    "Evidence review",
    c.quality,
    c.decision ? "Evidence decision: " + c.decision.choice + " | Confidence: " + Math.round(c.decision.confidence * 100) + "% | " + (c.decisionSource === "jev" ? "Decision Model" : c.sample ? "Preset demo" : "Recorded decision") : "",
    c.decision?.reason ? "Routing check: " + c.decision.reason + " | Original model route: " + c.decision.modelChoice : "",
    c.override ? "Agent override: evidence accepted" : "",
    c.request,
    "",
    "Evidence requests (demo; no external delivery)",
    ...(c.evidenceRequests ?? []).flatMap(request => [
      `${request.created} | ${request.recipient} | ${request.status}`,
      request.message,
      ...request.pins.map((pin, i) => `Pin ${i + 1} | ${pin.photoName} | Position ${pin.x.toFixed(1)}%, ${pin.y.toFixed(1)}% | ${pin.comment}`),
    ]),
    "",
    "Damage assessment",
    ...c.findings.map((f) =>
      [
        f.component + " — " + f.severity,
        f.damage,
        f.repair,
        f.accidentReason ? "Accident relevance: " + f.accidentReason : "",
        f.inspectionEvidence ? "Visible inspection trigger: " + f.inspectionEvidence.observation : "",
        "Sources: " +
          (f.evidence
            ?.map(
              (r) =>
                (c.photos[r.item - 1]?.name ?? "Evidence " + r.item) +
                (r.seconds != null ? " at " + r.seconds + "s" : ""),
            )
            .join(", ") || "Earlier assessment; no region recorded"),
      ].join(" | "),
    ),
    "",
    ...(c.authorization
      ? [
          "Authorized shop: " + c.authorization.shop,
          "Senior adjuster: " + c.authorization.adjuster,
          "Decision date: " + c.authorization.at,
          "",
        ]
      : []),
    "Excluded from estimate",
    ...(c.excludedFindings ?? []).map(f => f.component + " | " + f.accidentRelation + " | " + f.accidentReason),
    "Repair estimate (QAR) — illustrative prices",
    ...c.lines.map((l) =>
      [
        l.component,
        l.repair,
        "Parts " + money(l.parts),
        "Labor " + money(l.labor),
        l.source,
        l.catalogueId ? "Catalogue: " + l.catalogueId : "",
        l.inspectionNote ? "Agent approval: " + l.inspectionNote : "",
      ].join(" | "),
    ),
    "",
    (c.lines.some((l) => l.needsQuote) ? "Priced items subtotal " : "Total ") +
      money(total(c.lines)),
    "",
    "Decision history",
    ...c.log.map((l) => l.at + " | " + l.title + " | " + l.detail),
  ]
    .filter((x) => x !== undefined)
    .join("\n");
  const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download =
    c.id + "-" + (c.stage === "authorized" ? "authorized" : "draft") + ".txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Review({
  c,
  role,
  save,
  request,
  onFinding,
  focusRequirements,
}: {
  c: Claim;
  role: ViewRole;
  focusRequirements?: "inspection" | "pricing";
  onFinding: (i: number) => void;
  save: (c: Claim) => void;
  request: (type: "more" | "changes") => void;
}) {
  const [catalogueOpen, setCatalogueOpen] = useState(false);
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
    (f, i) => requiresInspection(f) && !c.lines[i]?.inspectionNote?.trim(),
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
  function startEdit() {
    setDraft(c.lines.map((l) => ({ ...l })));
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
        <button className="text-button" onClick={() => setCatalogueOpen(true)}>Pricing catalogue</button>
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
            {(hasQuote || pendingInspection) && <small>{pendingInspection ? "Agent approval required" : "Quote required"}</small>}
          </div>
          {(pendingInspection || hasQuote) && <div className="estimate-requirements" ref={requirementsRef} tabIndex={-1} role="region" aria-label="Estimate requirements">
            <h3>{pendingInspection ? "Inspection requirements" : "Pricing gaps"}</h3>
            <p>{pendingInspection ? "Record the inspection findings and agent approval for these items before submitting." : "Add an amount and pricing source for each outstanding item."}</p>
            <ul>{c.lines.map((line, index) => {
              const inspection = c.findings[index] && requiresInspection(c.findings[index]) && !line.inspectionNote?.trim();
              return inspection || line.needsQuote ? <li key={index}><strong>{line.component}</strong><span>{[inspection && "Inspection findings and agent approval needed", line.needsQuote && "Price and source needed"].filter(Boolean).join(" · ")}</span></li> : null;
            })}</ul>
          </div>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Component / operation</th>
                  <th>Parts</th>
                  <th>Labor</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map((l, i) => (
                  <tr key={i}>
                    <td>
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
                      {c.findings[i]?.accidentReason && <small className="accident-reason">{c.findings[i].accidentReason}</small>}
                      {l.inspectionNote && (
                        <small>Agent approval · {l.inspectionNote}</small>
                      )}
                    </td>
                    <td>{money(l.parts)}</td>
                    <td>{money(l.labor)}</td>
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
          {role === "agent" && stage === "senior" && <p className="scope-notice">Submitted · awaiting senior adjuster approval.</p>}
          <div className="review-actions">
            {canEdit && (
              <button className={pendingInspection || hasQuote ? "primary" : "secondary"} onClick={startEdit}>
                <PencilLine />
                Edit estimate
              </button>
            )}
            {role === "agent" && stage === "review" && (
              <>
                <button className="secondary" onClick={() => request("more")}>
                  Request evidence
                </button>
                <button
                  className="secondary"
                  onClick={() => request("changes")}
                >
                  Flag estimate issues
                </button>
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
                      ),
                    )
                  }
                >
                  Submit for approval
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
            {stage === "authorized" && (
              <button className="primary" onClick={() => downloadReport(c)}>
                <Download />
                Download authorized report
              </button>
            )}
            {stage !== "authorized" && (
              <button className="text-button" onClick={() => downloadReport(c)}>
                <Download />
                Download draft report
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="empty">
          <FileText />
          <h3>{awaitingEvidence ? "Awaiting policyholder evidence" : stage === "missing" ? "More evidence needed" : stage === "uncertain" ? "Agent review required" : c.excludedFindings?.length ? "No accident-related repairs confirmed" : "Estimate pending"}</h3>
          <p>
            {awaitingEvidence ? "Record the policyholder response in Evidence before analyzing." : stage === "missing" ? "Request the missing views from the Evidence tab." : stage === "uncertain" ? "Resolve the flagged evidence before creating an estimate." : c.excludedFindings?.length ? "Check the accident description and observations below." : "Analyze evidence to create an estimate."}
          </p>
        </div>
      )}
      {!!c.excludedFindings?.length && <section className="excluded-findings"><h3>Outside the estimate <span>{c.excludedFindings.length}</span></h3>{c.excludedFindings.map((finding, i) => <div key={i}><strong>{finding.component}</strong><span>{finding.accidentRelation === "unrelated" ? "Unrelated to this accident" : finding.visualBasis === "unconfirmed" ? "Visible damage unconfirmed" : "Accident connection unconfirmed"}</span><p>{finding.accidentReason}</p></div>)}</section>}
      {catalogueOpen && <PricingCatalogue close={() => setCatalogueOpen(false)} />}
      {edit && (
        <Modal title="Edit estimate" close={() => setEdit(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(
                addEvent(
                  c,
                  "Estimate revised",
                  "Agent reviewed the revised pricing sources.",
                  {
                    lines: draft,
                    findings: observations.map((f, i) => ({
                      ...f,
                      repair: draft[i]?.repair ?? f.repair,
                    })),
                  },
                ),
              );
              setEdit(false);
            }}
          >
            {draft.map((l, i) => (
              <fieldset key={i}>
                <legend>{l.component}</legend>
                {observations[i] && (
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
                <label>
                  Repair operation
                  <input
                    required
                    maxLength={240}
                    value={l.repair}
                    onChange={(e) => change(i, { repair: e.target.value })}
                  />
                </label>
                {c.findings[i] && requiresInspection(c.findings[i]) && (
                  <label>
                    Agent approval
                    <textarea
                      required
                      rows={2}
                      maxLength={600}
                      placeholder="Agent, decision and supporting reference"
                      value={l.inspectionNote ?? ""}
                      onChange={(e) =>
                        change(i, { inspectionNote: e.target.value })
                      }
                    />
                  </label>
                )}
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
                          needsQuote: false,
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
                          needsQuote: false,
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
                    value={l.source.endsWith("required") ? "" : l.source}
                    onChange={(e) =>
                      change(i, { source: e.target.value, needsQuote: false })
                    }
                  />
                </label>
              </fieldset>
            ))}
            <button className="primary">Save estimate</button>
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
export function Activity({ c }: { c: Claim }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          <Clock3 />
          Claim activity
        </h2>
        <span className="thin-label">{c.log.length} events</span>
      </div>
      <ol className="timeline">
        {c.log.map((l, i) => (
          <li key={i}>
            <i />
            <div>
              <strong>{l.title}</strong>
              <p>{l.detail}</p>
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
