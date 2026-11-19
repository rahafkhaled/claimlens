"use client";
import { useRef, useState } from "react";
import { Maximize2, Plus, Play, ScanLine, LoaderCircle } from "lucide-react";
import { type Claim, type Photo, money } from "@/lib/claims";
import { Modal } from "./ui";
import { EvidenceRequests } from "./EvidenceRequest";

const clock = (seconds: number) =>
  Math.floor(seconds / 60) +
  ":" +
  String(Math.floor(seconds % 60)).padStart(2, "0");
function Media({ file, start }: { file: Photo; start?: number }) {
  const video = useRef<HTMLVideoElement>(null);
  return (
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
      </div>
    </div>
  );
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
          <Media
            key={file.src + "-" + active}
            file={file}
            start={ref.seconds ?? undefined}
          />
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
                {money(line.parts)} / {money(line.labor)}
              </dd>
            </div>
            <div>
              <dt>Pricing source</dt>
              <dd>{line.source}</dd>
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
  onReview,
  onRequest,
  locked = false,
  reviewing = false,
  readOnly = false,
  primaryAnalysis = true,
  outcomeVisible = false,
}: {
  claim: Claim;
  onAdd: () => void;
  onReview: () => void;
  onRequest: (index: number) => void;
  locked?: boolean;
  reviewing?: boolean;
  readOnly?: boolean;
  primaryAnalysis?: boolean;
  outcomeVisible?: boolean;
}) {
  const [index, setIndex] = useState(0),
    [expanded, setExpanded] = useState(false);
  const i = Math.min(index, claim.photos.length - 1),
    file = claim.photos[i];
  return (
    <section className="evidence-panel">
      <div className="section-head">
        <h2>{claim.photos.some((p) => p.kind === "video") ? "Evidence" : "Photos"}</h2>
        <span>{claim.photos.length} files</span>
      </div>
      <div className="evidence-frame">
        <Media
          key={file.src}
          file={file}
        />
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
      <div className="filmstrip">
        {claim.photos.map((p, n) => (
          <button
            key={n}
            aria-label={"Show " + p.name}
            aria-pressed={i === n}
            className="thumb"
            onClick={() => setIndex(n)}
          >
            <img alt="" src={p.poster ?? p.src} />
            {p.kind === "video" && <Play size={14} />}
          </button>
        ))}
        {!readOnly && claim.stage !== "authorized" && (
          <button
            disabled={locked}
            onClick={onAdd}
            className="add-photo"
            aria-label="Record received evidence"
            title="Record received evidence"
          >
            <Plus size={18} />
          </button>
        )}
      </div>
      <div className="evidence-actions">
        {!readOnly && claim.stage !== "authorized" && (
          <div className="button-row">
          <button className="secondary" disabled={locked} onClick={() => onRequest(i)}>Request evidence</button>
          <button className={primaryAnalysis && !outcomeVisible ? "primary" : "secondary"} disabled={locked || claim.evidenceRequests?.some(request => request.status === "awaiting")} title={claim.evidenceRequests?.some(request => request.status === "awaiting") ? "Awaiting requested evidence" : undefined} onClick={onReview}>
            {reviewing ? <LoaderCircle size={15} className="spin" /> : <ScanLine size={15} />}
            {reviewing ? "Analyzing…" : claim.decision || claim.lines.length ? "Reanalyze evidence" : "Analyze evidence"}
          </button>
          </div>
        )}
      </div>
      <EvidenceRequests claim={claim} />
      {expanded && (
        <Modal title={file.name} wide close={() => setExpanded(false)}>
          <Media file={file} />
        </Modal>
      )}
    </section>
  );
}
