"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MapPin, Trash2 } from "lucide-react";
import { type Claim, type EvidencePin, type EvidenceRequest, addEvent } from "@/lib/claims";
import { Modal } from "./ui";

// getRandomValues also works on the demo's HTTP LAN address.
const newId = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, "0")).join("");

export function EvidenceRequestEditor({ claim, initialIndex = 0, record, close, save }: {
  claim: Claim;
  initialIndex?: number;
  record?: EvidenceRequest;
  close: () => void;
  save?: (claim: Claim) => void;
}) {
  const [photos] = useState(() => claim.photos.map(photo => ({ ...photo, id: photo.id ?? newId() })));
  const [index, setIndex] = useState(() => {
    const first = record?.pins[0];
    const match = first ? photos.findIndex(photo => photo.id === first.photoId) : -1;
    return match >= 0 ? match : Math.min(initialIndex, photos.length - 1);
  });
  const [pins, setPins] = useState<EvidencePin[]>(record?.pins ?? []);
  const [selected, setSelected] = useState<string | null>(record?.pins[0]?.id ?? null);
  const [message, setMessage] = useState(record?.message ?? claim.gaps.join("\n").slice(0, 800));
  const recipient = record?.recipient ?? "Policyholder";
  const [discard, setDiscard] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const sent = useRef(false);
  const file = photos[index];
  const activePin = pins.find(pin => pin.id === selected);
  const readOnly = !!record;
  const valid = (message.trim().length > 0 || pins.length > 0) && pins.every(pin => pin.comment.trim());
  const dirty = !readOnly && (pins.length > 0 || message !== claim.gaps.join("\n").slice(0, 800));
  useEffect(() => { if (selected && !readOnly) commentRef.current?.focus(); }, [selected, readOnly]);
  function addPin(x: number, y: number) {
    if (readOnly || file.kind === "video" || pins.length >= 20) return;
    const pin: EvidencePin = { id: newId(), photoId: file.id, photoName: file.name, x, y, comment: "" };
    setPins(old => [...old, pin]);
    setSelected(pin.id);
  }
  function choosePin(pin: EvidencePin) {
    const source = photos.findIndex(photo => photo.id === pin.photoId);
    if (source >= 0) setIndex(source);
    setSelected(pin.id);
  }
  return <Modal title={readOnly ? "Evidence request" : "Request evidence"} wide close={() => dirty ? setDiscard(true) : close()}>
    <form className="request-composer" onSubmit={event => {
      event.preventDefault();
      if (!valid || !save || readOnly || sent.current) return;
      sent.current = true;
      const request: EvidenceRequest = {
        id: newId(), created: new Date().toISOString(), recipient,
        status: "awaiting", message: message.trim(), pins: pins.map(pin => ({ ...pin, comment: pin.comment.trim() })),
      };
      const detail = [request.message, ...request.pins.map((pin, i) => `${i + 1}. ${pin.photoName}: ${pin.comment}`)].filter(Boolean).join("\n");
      save(addEvent(claim, "Evidence requested", `${recipient} · Request recorded.\n${detail}`, {
        photos, stage: "missing", request: detail, authorization: undefined,
        evidenceRequests: [...(claim.evidenceRequests ?? []), request],
      }));
    }}>
      <div className="request-meta">
        <span>{claim.id}</span>
        <span>{record ? (record.status === "awaiting" ? "Awaiting evidence" : "Response received") : "New request"}</span>
      </div>
      <div className="request-layout">
        <div className="request-visual">
          <div className="request-photo">
            {file.kind === "video" ? <video src={file.src} poster={file.poster} controls playsInline aria-label={file.name} /> : <>
              <img src={file.src} alt={file.name} draggable={false} />
              {!readOnly && <button type="button" className="pin-surface" aria-label="Place a pin on this photo" disabled={pins.length >= 20}
                onClick={event => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  addPin(event.detail === 0 ? 50 : Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), event.detail === 0 ? 50 : Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)));
                }} />}
              {pins.map((pin, n) => pin.photoId === file.id && <button type="button" key={pin.id} className="evidence-pin" aria-label={`Pin ${n + 1}: ${pin.comment || "Add comment"}`} aria-pressed={selected === pin.id}
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }} onClick={() => setSelected(pin.id)}
                onKeyDown={event => {
                  if (readOnly || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const delta = event.shiftKey ? 5 : 1;
                  setPins(old => old.map(item => item.id !== pin.id ? item : { ...item,
                    x: Math.max(0, Math.min(100, item.x + (event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0))),
                    y: Math.max(0, Math.min(100, item.y + (event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0))),
                  }));
                }}><span>{n + 1}</span></button>)}
            </>}
          </div>
          <div className="request-photo-label"><span>{file.name}</span><span>{index + 1} / {photos.length}</span></div>
          <div className="filmstrip request-filmstrip">
            {photos.map((photo, n) => <button type="button" key={photo.id} className="thumb" aria-label={`Show ${photo.name}`} aria-pressed={index === n} onClick={() => { setIndex(n); setSelected(null); }}>
              <img src={photo.poster ?? photo.src} alt="" />
            </button>)}
          </div>
          {!readOnly && <div className="pin-instructions">
            {file.kind === "video" ? <span>Describe the clip and timestamp in the request notes.</span> : <>
              <span>Click the photo to pin a comment.</span>
              <button className="text-button" type="button" disabled={pins.length >= 20} onClick={() => addPin(50, 50)}><MapPin size={14} />Add pin</button>
            </>}
          </div>}
        </div>
        <div className="request-notes">
          <div className="request-recipient">To <strong>{recipient}</strong></div>
          {readOnly ? (message && <div className="request-message"><strong>Request notes</strong><p>{message}</p></div>) : <label>Request notes
            <textarea rows={3} maxLength={800} value={message} onChange={event => setMessage(event.target.value)} placeholder="What evidence do you need for this accident?" />
          </label>}
          <div className="pin-list" aria-label="Photo comments">
            {pins.map((pin, n) => <button key={pin.id} type="button" className="pin-comment" aria-pressed={selected === pin.id} onClick={() => choosePin(pin)}>
              <span className="pin-number">{n + 1}</span><span><strong>{pin.photoName}</strong><span>{pin.comment || "Add a comment…"}</span>{!photos.some(photo => photo.id === pin.photoId) && <small>Original photo was removed from this claim.</small>}</span>
            </button>)}
          </div>
          {!readOnly && activePin && <div className="pin-editor">
            <label>Comment for pin {pins.findIndex(pin => pin.id === selected) + 1}
              <textarea ref={commentRef} required rows={3} maxLength={600} value={activePin.comment} onChange={event => {
                const value = event.target.value;
                setPins(old => old.map(pin => pin.id === selected ? { ...pin, comment: value } : pin));
              }} placeholder="e.g. Retake this bumper corner in daylight, close enough to see the crack." />
            </label>
            <div className="pin-instructions"><span>Use arrow keys on a pin to move it.</span><button type="button" className="text-button" onClick={() => { setPins(old => old.filter(pin => pin.id !== selected)); setSelected(null); }}><Trash2 size={14} />Remove pin</button></div>
          </div>}
          {!readOnly && pins.some(pin => !pin.comment.trim()) && <p className="request-hint">Add a comment to each pin before requesting evidence.</p>}
        </div>
      </div>
      <div className="request-footer">
        <small>Saved to this claim only; no message is sent.</small>
        {!readOnly && <button className="primary" disabled={!valid}>Save evidence request <ArrowRight size={15} /></button>}
      </div>
      {discard && <div className="request-discard" role="alert"><span>Discard this draft request?</span><button type="button" className="secondary" onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="secondary" onClick={close}>Discard draft</button></div>}
    </form>
  </Modal>;
}

export function EvidenceRequests({ claim }: { claim: Claim }) {
  const [selected, setSelected] = useState<EvidenceRequest>();
  if (!claim.evidenceRequests?.length) return null;
  return <section className="evidence-requests" aria-label="Evidence requests">
    <div className="section-head"><h2>Evidence requests</h2><span>{claim.evidenceRequests.length}</span></div>
    {[...claim.evidenceRequests].reverse().map((request, n) => <button type="button" className="request-record" key={request.id} onClick={() => setSelected(request)}>
      <MapPin size={17} /><span><strong>Request {claim.evidenceRequests!.length - n} · {request.recipient}</strong><small>{request.pins.length} photo comments · {new Date(request.created).toLocaleDateString()}</small><span>{request.message || request.pins[0]?.comment}</span></span><span className="request-status">{request.status === "awaiting" ? "Awaiting evidence" : "Response received"}<ArrowRight size={14} /></span>
    </button>)}
    {selected && <EvidenceRequestEditor claim={claim} record={selected} close={() => setSelected(undefined)} />}
  </section>;
}
