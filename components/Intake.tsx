"use client";
import { useState, useRef } from "react";
import { UploadCloud, X, ImagePlus, ArrowRight } from "lucide-react";
import { type Claim, type Photo, addEvent } from "@/lib/claims";
import { readPhotos } from "@/lib/photos";
import { Modal } from "./ui";
export function Intake({
  existing,
  requestId,
  policyholder = false,
  close,
  save,
}: {
  existing?: Claim;
  requestId?: string;
  policyholder?: boolean;
  close: () => void;
  save: (c: Claim) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [retained, setRetained] = useState(existing?.photos ?? []),
    [filesBusy, setFilesBusy] = useState(false),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const [title, setTitle] = useState(""),
    [vehicle, setVehicle] = useState(""),
    [details, setDetails] = useState("");
  const pendingRequests = existing?.evidenceRequests?.filter(request => request.status === "awaiting") ?? [];
  const [responseIds, setResponseIds] = useState<string[]>(requestId ? [requestId] : pendingRequests.length === 1 ? [pendingRequests[0].id] : []);
  const request = pendingRequests.find(r => r.id === requestId);
  const input = useRef<HTMLInputElement>(null);
  async function add(files: FileList) {
    setError("");
    setFilesBusy(true);
    try {
      const next = await readPhotos(files, retained.length + photos.length);
      setPhotos((p) => [...p, ...next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the image.");
    } finally {
      setFilesBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <Modal
      title={policyholder ? "Your evidence request" : existing ? pendingRequests.length ? "Respond to evidence request" : "Add evidence" : "Add demo case"}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (policyholder && (!request || !photos.length)) { setError("Attach a photo or video to respond to this request."); return; }
          if (
            !photos.length &&
            !(existing && retained.length && details.trim())
          ) {
            setError(
              existing
                ? "Add evidence or enter new inspection details."
                : "Add at least one photo or video.",
            );
            return;
          }
          if (
            [...retained, ...photos].reduce((n, p) => n + p.src.length, 0) >
            18_000_000
          ) {
            setError(
              "The combined evidence is too large. Use a shorter clip or fewer files.",
            );
            return;
          }
          if (pendingRequests.length && !responseIds.length) { setError("Select the evidence request this response addresses."); return; }
          const c: Claim = existing
            ? {
                ...existing,
                photos: [...retained, ...photos],
                scopeNeedsReview: true,
                details: [existing.details, details]
                  .filter(Boolean)
                  .join("\n")
                  .slice(-3000),
              }
            : {
                id:
                  "CLM-" +
                  crypto
                    .getRandomValues(new Uint32Array(1))[0]
                    .toString(16)
                    .padStart(8, "0")
                    .toUpperCase(),
                title: title.trim(),
                vehicle: vehicle.trim(),
                details: details.trim(),
                created: new Date().toISOString(),
                sample: false,
                accidentDescription: details.trim(),
                currency: "QAR",
                photos,
                stage: "intake",
                request: "",
                override: false,
                quality: "",
                gaps: [],
                decision: null,
                decisionSource: undefined,
                findings: [],
                lines: [],
                log: [],
              };
          if (!c.title || !c.vehicle) {
            setError("Enter the incident title and vehicle.");
            return;
          }
          const evidenceRequests = c.evidenceRequests?.map(request => request.status === "awaiting" && responseIds.includes(request.id) ? { ...request, status: "received" as const, receivedAt: new Date().toISOString() } : request);
          const outstanding = evidenceRequests?.filter(request => request.status === "awaiting") ?? [];
          save(
            addEvent(
              c,
              existing ? "Additional evidence received" : "Claim received",
              [policyholder && "Submitted through the demo policyholder portal.", photos.length ? photos.length + " evidence file(s) added." : "Inspection details updated.",
               existing && (outstanding.length ? "Awaiting remaining policyholder responses." : "Updated evidence ready for assessment.")].filter(Boolean).join(" "),
              {
                stage: existing ? existing.stage : "intake",
                evidenceRequests,
                scopeNeedsReview: true,
                evidenceUpdated: !!existing,
                authorization: undefined,
                request: outstanding.map(request => [request.message, ...request.pins.map(pin => pin.comment)].filter(Boolean).join("\n")).join("\n"),

              },
            ),
          );
        }}
      >
        {!existing && (
          <>
            <label>
              Incident title
              <input
                autoFocus
                required
                maxLength={100}
                placeholder="e.g. Front-end collision"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Vehicle
              <input
                required
                maxLength={140}
                placeholder="Year, make and model"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              />
            </label>
          </>
        )}
        {policyholder && request && <section aria-label="Message from your claims agent">
          <small>Policyholder view · Demo</small>
          <h3>{existing?.vehicle} · {existing?.id}</h3>
          <p>Message from your claims agent</p>
          <p className="notice" style={{whiteSpace: "pre-line"}}>{request.message}</p>
          {request.repairItems?.length ? <p>Requested items · {request.repairItems.join(", ")}</p> : null}
          {request.pins.map(pin => <p key={pin.id}><strong>{pin.photoName}</strong> · {pin.comment}</p>)}
        </section>}
        {!policyholder && existing?.request && <p className="notice">{existing.request}</p>}
        {!policyholder && pendingRequests.length > 0 && <fieldset className="response-requests"><legend>This response addresses</legend>
          {pendingRequests.map(request => <label key={request.id}><input type="checkbox" checked={responseIds.includes(request.id)} onChange={event => setResponseIds(old => event.target.checked ? [...old, request.id] : old.filter(id => id !== request.id))} /><span>Request {(existing?.evidenceRequests?.findIndex(item => item.id === request.id) ?? 0) + 1} · {request.recipient} · {[request.message, ...request.pins.map(pin => pin.comment)].filter(Boolean).join(" · ")}</span></label>)}
        </fieldset>}
        <label>
          {policyholder ? "Message to your claims agent (optional)" : existing ? "Response / inspection notes" : "Accident description"}
          <textarea
            required={!existing}
            minLength={existing ? undefined : 10}
            maxLength={1800}
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={policyholder ? "Add any details about the files you’re sending." : "Describe what happened, the impact area and the damage being claimed."}
          />
        </label>
        <div className="field-label">{policyholder ? "Requested photos or video" : existing ? "Existing evidence" : "Evidence"}</div>
        {!policyholder && existing && (
          <div className="retained">
            {retained.map((p, i) => (
              <div key={i}>
                <img src={p.poster ?? p.src} alt={p.name} />
                <button
                  type="button"
                  aria-label={"Remove existing " + p.name}
                  onClick={() =>
                    setRetained((old) => old.filter((_, n) => n !== i))
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {!policyholder && existing && <p className="response-help">New response evidence · Add files below. Saving a response does not confirm sufficiency; assess the updated evidence next.</p>}
        <button
          disabled={filesBusy}
          type="button"
          className={"upload " + (drag ? "drag" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!filesBusy) void add(e.dataTransfer.files);
          }}
          onClick={() => input.current?.click()}
        >
          <UploadCloud size={24} />
          <strong>
            {filesBusy ? "Reading files…" : "Choose photos or video"}
          </strong>
          <small>Up to 8 photos or clips · 12 MB per file</small>
        </button>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          onChange={(e) => {
            if (e.target.files) void add(e.target.files);
          }}
        />
        <div className="uploaded">
          {photos.map((p, i) => (
            <div key={i}>
              <ImagePlus size={14} />
              <span>{p.name}</span>
              <button
                type="button"
                aria-label={"Remove " + p.name}
                onClick={() => setPhotos(photos.filter((_, n) => i !== n))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={filesBusy}>
            {policyholder ? "Send evidence to agent" : existing ? pendingRequests.length ? "Save response" : "Save evidence" : "Add demo case"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
