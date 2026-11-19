"use client";
import { useState } from "react";
import { PencilLine, Check, X } from "lucide-react";
import { addEvent, type Claim } from "@/lib/claims";
export function AccidentDescription({ claim, save, readOnly = false }: { claim: Claim; save: (claim: Claim) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(claim.accidentDescription ?? claim.details);
  const description = claim.accidentDescription ?? claim.details;
  return <section className="accident-description" aria-label="Accident description">
    <div className="accident-heading"><h2>Accident description</h2>{!readOnly && !editing && <button className="text-button" onClick={() => { setText(description); setEditing(true); }} aria-label="Edit accident description"><PencilLine size={13} />Edit</button>}</div>
    {editing ? <form onSubmit={event => { event.preventDefault(); const next = text.trim(); if (next.length < 10) return; if (next !== description) save(addEvent(claim, "Accident description updated", next, { accidentDescription: next, scopeNeedsReview: true, scopeReviewed: false, stage: claim.evidenceRequests?.some(request => request.status === "awaiting") ? "missing" : "intake", authorization: undefined, override: false })); setEditing(false); }}>
      <textarea autoFocus required minLength={10} maxLength={1800} rows={3} aria-label="Accident description" value={text} onChange={event => setText(event.target.value)} placeholder="What happened, where the impact occurred, and which damage is being claimed." />
      <div className="button-row"><button className="primary" type="submit"><Check size={14} />Save description</button><button className="secondary" type="button" onClick={() => setEditing(false)}><X size={14} />Cancel</button></div>
      <small>Changes require a new evidence review.</small>
    </form> : <p>{description || "Add what happened and the area affected before reviewing evidence."}</p>}
  </section>;
}
