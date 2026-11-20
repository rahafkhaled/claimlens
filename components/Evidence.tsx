"use client";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Maximize2, Plus, Play, ScanLine } from "lucide-react";
import { type Claim, type Photo, type EvidencePin, needsScopeReview, money } from "@/lib/claims";
import { pinLabel } from "@/lib/photo-pins";
import { Modal } from "./ui";
import { EvidenceRequests } from "./EvidenceRequest";
import { PricingSource } from "./PricingSource";



const clock = (seconds: number) =>
  Math.floor(seconds / 60) +
  ":" +
  String(Math.floor(seconds % 60)).padStart(2, "0");
type PhotoPin = { label?: string; source?: EvidencePin["source"]; id: string; x: number; y: number; title: string; detail: string };

function overview(photo: Photo) {
  return /overview|wide shot|^(front|rear)[ -](left|right)( view)?$/i.test(photo.name);
}

function bestEvidence(claim: Claim, index: number) {
  const refs = claim.findings[index].evidence?.filter(ref => claim.photos[ref.item - 1]) ?? [];
  function score(ref: typeof refs[number]) {
    const photo = claim.photos[ref.item - 1];
    const [top, left, bottom, right] = ref.box;
    return (overview(photo) ? -2 : /close.?up|detail/i.test(photo.name) ? 2 : 0)
      + (bottom - top) * (right - left) / 1e6;
  }
  return refs.reduce<typeof refs[number] | undefined>((best, ref) =>
    !best || score(ref) > score(best) ? ref : best, undefined);
}

export function photoPins(claim: Claim, photo: Photo, index: number): PhotoPin[] {
  if (photo.kind === "video") return [];
  const requests: PhotoPin[] = (claim.evidenceRequests ?? []).flatMap(request =>
    request.pins.filter(pin => pin.photoId === photo.id).map(pin => ({
      ...pin, title: "Evidence request", detail: pin.comment,
    }))
  );
  if (needsScopeReview(claim) || overview(photo)) return requests;
  return requests.concat(claim.findings.flatMap((finding, n) => {
    const ref = bestEvidence(claim, n);
    if (!ref || ref.item !== index + 1) return [];
    const [top, left, bottom, right] = ref.box;
    return [{ id: "finding-" + n, label: String(n + 1), source: "ai" as const,
      x: (left + right) / 20, y: (top + bottom) / 20, title: finding.component, detail: finding.damage }];
  }));
}
function Media({ file, start, pins, initialPin }: { initialPin?: string; file: Photo; start?: number; pins?: PhotoPin[] }) {
  const [selected, setSelected] = useState<string | undefined>(initialPin);
  const active = pins?.find(pin => pin.id === selected) ?? pins?.[0];
  const video = useRef<HTMLVideoElement>(null);
  return (
    <>
    <div className="media-stage">
      <div className="media-sheet">
        {file.kind === "video" ? (
          <video
            className="asset"
            ref={video}
            src={file.src}
            poster={file.poster}
            controls
            playsInline
            preload="metadata"
            aria-label={file.name}
            onLoadedMetadata={() => {
              if (video.current && start != null)
                video.current.currentTime = Math.min(
                  start,
                  video.current.duration || start,
                );
            }}
          />
        ) : (
          <img className="asset" src={file.src} alt={file.name} />
        )}
        {pins?.map((pin, n) => <button key={pin.id} type="button" className="evidence-pin gallery-pin" data-source={pin.source} title={pinLabel(pin.source)}
          style={{ left: pin.x + "%", top: pin.y + "%" }} aria-label={`Photo pin ${pin.label ?? n + 1}: ${pin.title}`}
          aria-pressed={active?.id === pin.id} onClick={() => setSelected(pin.id)}><span>{pin.label ?? n + 1}</span></button>)}
      </div>
    </div>
    {active && <div className="gallery-pin-note" aria-live="polite"><MapPin size={16} /><div><strong>{pinLabel(active.source)} · {active.title}</strong><p>{active.detail}</p></div></div>}
    </>
  );
}
export function PhotoViewer({ file, index, count, select, start, pins, initialPin }: {
  initialPin?: string; file: Photo; index: number; count: number; select: (index: number) => void; start?: number; pins?: PhotoPin[];
}) {
  function move(delta: number) { select((index + delta + count) % count); }
  return <div className="photo-viewer" role="group" aria-label={`Evidence ${index + 1} of ${count}`} tabIndex={count > 1 ? 0 : undefined}
    onKeyDown={event => {
      if (count < 2 || (event.target as HTMLElement).closest("video")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}>
    <Media key={file.src + "-" + index + "-" + (initialPin ?? "")} initialPin={initialPin} file={file} start={start} pins={pins} />
    {count > 1 && <>
      <button type="button" className="photo-prev" aria-label="Previous photo" onClick={() => move(-1)}><ChevronLeft /></button>
      <button type="button" className="photo-next" aria-label="Next photo" onClick={() => move(1)}><ChevronRight /></button>
    </>}
  </div>;
}
export function FindingRecord({
  claim,
  index,
  close,
}: {
  claim: Claim;
  index: number;
  close: () => void;
}) {
  const finding = claim.findings[index],
    refs = finding.evidence?.filter((r) => claim.photos[r.item - 1]) ?? [],
    line = claim.lines[index];
  const [active, setActive] = useState(0),
    ref = refs[active],
    file = ref ? claim.photos[ref.item - 1] : null;
  return (
    <Modal title={finding.component} close={close} wide>
      {file && (
        <>
          <PhotoViewer file={file} index={active} count={refs.length} select={setActive} start={ref.seconds ?? undefined} pins={photoPins(claim, file, ref.item - 1)} initialPin={"finding-" + index} />
          <div className="source-links" aria-label="Supporting evidence">
            {refs.map((r, n) => (
              <button
                key={n}
                aria-pressed={n === active}
                onClick={() => setActive(n)}
              >
                {claim.photos[r.item - 1].name}
                {r.seconds != null ? " · " + clock(r.seconds) : ""}
              </button>
            ))}
          </div>
        </>
      )}
      <dl className="record-list">
        <div>
          <dt>Observation</dt>
          <dd>{finding.damage}</dd>
        </div>
        {finding.accidentReason && <div><dt>Accident relevance</dt><dd>{finding.accidentReason}</dd></div>}
        {finding.inspectionEvidence && <div><dt>Inspection trigger</dt><dd>{finding.inspectionEvidence.observation}</dd></div>}
        <div>
          <dt>Extent</dt>
          <dd>{finding.severity}</dd>
        </div>
        <div>
          <dt>Recommended work</dt>
          <dd>{finding.repair}</dd>
        </div>
        {!file && (
          <div>
            <dt>Evidence</dt>
            <dd>No source photo was recorded for this earlier assessment.</dd>
          </div>
        )}
        {line && (
          <>
            <div>
              <dt>Parts / labor</dt>
              <dd>
                {line.needsQuote ? "Awaiting supplier quote" : money(line.parts) + " / " + money(line.labor)}
              </dd>
            </div>
            <div>
              <dt>Pricing source</dt>
              <dd><PricingSource line={line} /></dd>
            </div>
          </>
        )}
      </dl>
    </Modal>
  );
}
export function Evidence({
  claim,
  onAdd,
  onRespond,
  onReview,
  onRequest,
  locked = false,
  reviewing = false,
  readOnly = false,
  primaryAnalysis = true,
  outcomeVisible = false,
}: { claim: Claim; onRespond?: (id: string) => void; locked?: boolean; reviewing?: boolean; primaryAnalysis?: boolean; outcomeVisible?: boolean } & ({
  readOnly: true; onAdd?: never; onReview?: never; onRequest?: never;
} | {
  readOnly?: boolean;
  onAdd: () => void;
  onReview: () => void;
  onRequest: (index: number) => void;
})) {
  const [index, setIndex] = useState<number | null>(null),
    [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<{ finding: number; click: number }>();
  const findings = !needsScopeReview(claim) ? claim.findings : [];
  const annotations = claim.photos.map((photo, n) => photoPins(claim, photo, n));
  const firstPinned = annotations.findIndex(pins => pins.length > 0);
  const i = Math.min(index ?? (findings.length ? 0 : Math.max(firstPinned, 0)), claim.photos.length - 1),
    file = claim.photos[i];
  return (
    <section className="evidence-panel">
      <div className="section-head">
        <h2>{claim.photos.some((p) => p.kind === "video") ? "Evidence" : "Photos"}</h2>
        {firstPinned >= 0 && !annotations[i].length ? <button className="text-button" onClick={() => setIndex(firstPinned)}><MapPin size={15} />View photo pins</button> : <span>{claim.photos.length} files</span>}
      </div>
      <div className={findings.length ? "finding-gallery" : undefined}>
      <div className="evidence-frame">
        <PhotoViewer key={target?.click} file={file} index={i} count={claim.photos.length} select={setIndex} pins={annotations[i]} initialPin={target && "finding-" + target.finding} />
        <div className="photo-caption">
          <span>
            <b>{String(i + 1).padStart(2, "0")}</b> {file.name}
          </span>
          <button
            aria-label="Expand evidence"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
      {findings.length > 0 && <aside className="finding-index" aria-label="Damage findings">
        <h3>Damage findings</h3>
        {findings.map((finding, n) => {
          const ref = bestEvidence(claim, n);
          const photo = ref && claim.photos[ref.item - 1];
          return <button key={n} disabled={!ref} aria-pressed={target?.finding === n && ref?.item === i + 1}
            onClick={() => { if (ref) { setIndex(ref.item - 1); setTarget(old => ({ finding: n, click: (old?.click ?? 0) + 1 })); } }}>
            <b>{n + 1}</b><span><strong>{finding.component}</strong><small>{photo?.name ?? "No linked photo"}</small></span>
          </button>;
        })}
      </aside>}
      </div>
      <div className="filmstrip">
        {claim.photos.map((p, n) => (
          <button
            key={n}
            aria-label={`Show ${p.name}${annotations[n].length ? ", " + annotations[n].length + " photo pins" : ""}`}
            aria-pressed={i === n}
            className="thumb"
            onClick={() => setIndex(n)}
          >
            <img alt="" src={p.poster ?? p.src} />
            {p.kind === "video" && <Play size={14} />}
            {annotations[n].length > 0 && <span className="thumb-pin-count" title={`${annotations[n].length} photo pins`}>{annotations[n].length}</span>}
          </button>
        ))}
        {!readOnly && claim.stage !== "authorized" && (
          <button
            disabled={locked}
            onClick={onAdd}
            className="add-photo"
            aria-label="Add policyholder response"
            title="Add policyholder response"
          >
            <Plus size={18} />
          </button>
        )}
      </div>
      {!reviewing && !readOnly && claim.stage !== "authorized" && <div className="evidence-actions button-row">
        <button className="text-button" disabled={locked} onClick={() => onRequest?.(i)}>Request additional evidence</button>
        {(!outcomeVisible || (!primaryAnalysis && !claim.evidenceUpdated)) && <button className="text-button" disabled={locked || claim.evidenceRequests?.some(r => r.status === "awaiting")} onClick={onReview}>
          <ScanLine size={14} />{claim.decision || claim.lines.length ? "Assess evidence again" : "Assess evidence"}
        </button>}
      </div>}
      <EvidenceRequests claim={claim} onRespond={readOnly || locked ? undefined : onRespond} />
      {expanded && (
        <Modal title={file.name} wide close={() => setExpanded(false)}>
          <PhotoViewer key={target?.click} file={file} index={i} count={claim.photos.length} select={setIndex} pins={annotations[i]} initialPin={target && "finding-" + target.finding} />
        </Modal>
      )}
    </section>
  );
}
