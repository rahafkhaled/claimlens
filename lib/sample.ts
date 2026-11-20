import { type Claim, type Photo, addEvent, claimSchema } from "./claims";
import { sample as legacySample, restoreSampleReferences } from "./legacy-sample";



const views = ["Front-left", "Front-right", "Rear-left", "Rear-right"];
function photos(folder: string, details: [string, string]): Photo[] {
  return [...views, ...details].map((name, i) => ({
    name,
    src: `/evidence/${folder}/${i + 1}.jpg`,
    kind: "photo",
    synthetic: true,
  }));
}
function seed(data: Pick<Claim, "id" | "title" | "vehicle" | "details" | "photos" | "demoScenario">): Claim {
  return {
    ...data,
    created: "2026-11-18T09:40:00Z",
    sample: true,
    currency: "QAR",
    demoVersion: 3,
    stage: "intake",
    quality: "",
    gaps: [],
    decision: null,
    findings: [],
    lines: [],
    scopeReviewed: false,
    accidentDescription: ({
      "CLM-2084": "The driver reports a low-speed collision with another vehicle at the front-left corner. The claimed damage is to the front bumper, left headlamp and left fender; assess only damage consistent with that contact.",
      "CLM-2085": "The policyholder reports the rear-right corner being struck while parked. The claim concerns the right tail lamp, rear bumper and mounting area; front and side marks are outside this reported accident.",
      "CLM-2086": "The policyholder reports another vehicle scraping the right front door while parking. Only damage consistent with this door contact is claimed; the visible mark may be a reflection and needs confirmation.",
      "CLM-2087": "The driver reports a heavy impact at the front-left corner. The claim concerns the front bumper, hood and left wheel/suspension area. Assess accident-related deformation and flag any uncertain structural involvement for agent approval.",
    } as Record<string, string>)[data.id] ?? data.details,
    request: "",
    override: false,
    log: [{ title: "Claim received", detail: "6 evidence files received.", at: "2026-11-18T09:40:00Z" }],
  };
}
const intakeSamples: Claim[] = [
  seed({
    id: "CLM-2084", title: "Front-end collision", vehicle: "2021 BMW 330i",
    demoScenario: "Standard repair",
    details: "Low-speed impact to the front-left corner.",
    photos: photos("bmw", ["Bumper & headlamp", "Fender close-up"]),
  }),
  seed({
    id: "CLM-2085", title: "Rear parking impact", vehicle: "2022 Toyota Camry",
    demoScenario: "Missing evidence",
    details: "Rear-right corner struck while parked. Detail photos are blurred.",
    photos: photos("camry", ["Tail lamp", "Bumper mounting"]),
  }),
  seed({
    id: "CLM-2086", title: "Passenger-door mark", vehicle: "2020 Lexus ES 350",
    demoScenario: "Agent review",
    details: "A mark was reported on the right front door. Reflections obscure its extent.",
    photos: photos("lexus-reflections-v2", ["Door mark", "Door · alternate angle"]),
  }),
  seed({
    id: "CLM-2087", title: "Front-left heavy impact", vehicle: "2021 Nissan Patrol",
    demoScenario: "Inspection hold",
    details: "Heavy front-left impact with a displaced wheel. Structural damage is unconfirmed.",
    photos: photos("patrol", ["Front impact", "Wheel & arch"]),
  }),
];
// Only the BMW starts before assessment. The other examples resume at a decision.
export const demoClaims = intakeSamples.map((claim): Claim => {
  if (claim.id === "CLM-2084") return claim;
  const at = "2026-11-18T10:00:00Z";
  const base = { ...claim, demoVersion: 4, decisionSource: "demo" as const, scopeReviewed: true };
  if (claim.id === "CLM-2085") {
    const message = "Please send a close-up of the right tail lamp and rear bumper mounting gap.";
    return { ...base, stage: "missing", quality: "The rear detail photos are blurred.", gaps: [message],
      decision: { choice: "missing", confidence: 0.94 }, request: message,
      evidenceRequests: [{ id: "camry-rear-detail", created: at, recipient: "Policyholder", status: "awaiting", message, pins: [] }],
      log: [{ title: "Evidence requested", detail: message, at }, { title: "More evidence needed", detail: "Rear detail photos are blurred.", at }, ...claim.log] };
  }
  if (claim.id === "CLM-2086") {
    const text = "Glare obscures the reported mark on the right front door.";
    return { ...base, stage: "uncertain", quality: text, decision: { choice: "uncertain", confidence: 0.58, reason: text },
      flags: [{ text, photos: [5, 6] }], log: [{ title: "Evidence needs manual review", detail: text, at }, ...claim.log] };
  }
  const finding: Claim["findings"][number] = { component: "Front-left alignment", code: "other", operation: "Inspect", severity: "High",
    damage: "Front-left wheel displaced within the arch", repair: "Inspect wheel and suspension alignment",
    visualBasis: "inspection_indicator", accidentRelation: "related", inspectionEvidence: {item: 6, indicator: "wheel_displacement", observation: "The wheel sits off-center in the damaged arch."},
    evidence: [{item: 6, box: [80, 50, 960, 950]}] };
  return { ...base, stage: "review", quality: "The wheel position is visible. Physical inspection is required to determine the extent of damage.",
    decision: {choice: "sufficient", confidence: 0.91}, findings: [finding],
    lines: [{ component: finding.component, repair: finding.repair, parts: 0, labor: 0, source: "Supplier quote required", needsQuote: true }],
    log: [{title: "Inspection required", detail: finding.damage, at}, ...claim.log] };
});
export const sample = demoClaims[0];

function clearPresetReview(claim: Claim): Claim {
  // Only discard generated seed results. Human edits, live reviews and
  // authorizations remain saved, even when they started from a demo claim.
  const presetOnly = claim.sample && claim.demoVersion === 2 &&
    claim.decisionSource === "demo" && !claim.authorization && !claim.override &&
    demoClaims.some(demo => demo.id === claim.id) &&
    claim.log.some(event => event.title === "Demo assessment loaded") &&
    claim.log.every(event => ["Demo assessment loaded", "Mock catalogue updated", "Currency changed to QAR", "Accident description updated"].includes(event.title));
  if (!presetOnly) return claim;
  return {
    ...claim,
    demoVersion: 3,
    stage: "intake",
    quality: "",
    gaps: [],
    decision: null,
    decisionSource: undefined,
    findings: [],
    excludedFindings: [],
    lines: [],
    request: "",
    scopeReviewed: false,
    scopeNeedsReview: false,
    log: [
      ...claim.log.filter(event => event.title === "Accident description updated"),
      { title: "Claim received", detail: `${claim.photos.length} evidence files received.`, at: claim.created },
    ],
  };
}

export function migrateClaim(claim: Claim): Claim {
  let restored = restoreSampleReferences(clearPresetReview(claim));
  // Replace only the unused synthetic Lexus evidence. Existing assessments and
  // uploaded photos keep their original files so evidence links remain valid.
  if (restored.sample && restored.id === "CLM-2086" && restored.stage === "intake" &&
      !restored.decision && !restored.authorization && !restored.override && !restored.evidenceRequests?.length &&
      !restored.findings.length && !restored.lines.length &&
      restored.photos.length === 6 && restored.photos.every((photo, index) => photo.synthetic && photo.src === `/evidence/lexus/${index + 1}.jpg`)) {
    restored = { ...restored, photos: demoClaims.find(demo => demo.id === restored.id)!.photos };
  }
  if (!restored.accidentDescription) {
    const demo = demoClaims.find(item => item.id === restored.id && item.details === restored.details);
    restored = { ...restored, accidentDescription: restored.sample && demo ? demo.accidentDescription : restored.details };
  }
  if (restored.stage !== "authorized") {
    const obsolete = restored.lines.filter(line => line.catalogueId?.startsWith("other:") &&
      !line.needsQuote && !line.quoteConfirmedAt && line.source.startsWith("Added demo allowance"));
    if (obsolete.length) restored = addEvent(restored, "Supplier quote required",
      obsolete.map(line => line.component).join(", "), {
        lines: restored.lines.map(line => obsolete.includes(line)
          ? { ...line, parts: 0, labor: 0, catalogueId: undefined, source: "Supplier quote required", needsQuote: true }
          : line),
      });
  }
  if (restored.currency === "QAR") return restored;
  return addEvent(restored, "Currency changed to QAR", "Existing USD amounts converted at 3.64 QAR per USD; demo rates only.", {
    currency: "QAR",
    lines: restored.lines.map((l) => ({ ...l, parts: Math.round(l.parts * 364) / 100, labor: Math.round(l.labor * 364) / 100, source: l.source + " · converted to QAR" })),
  });
}
export function mergeDemoClaims(saved: Claim[]): Claim[] {
  const original = claimSchema.parse(legacySample);
  const merged = saved.map((c) => {
    // Upgrade only the untouched original seed. Preserve submitted evidence and edits.
    const untouched = c.id === legacySample.id && c.sample && !c.demoVersion &&
      c.stage === "review" && !c.authorization && !c.request && !c.override &&
      JSON.stringify(c.photos) === JSON.stringify(original.photos) &&
      JSON.stringify(c.lines) === JSON.stringify(original.lines) &&
      JSON.stringify(c.findings) === JSON.stringify(original.findings) &&
      JSON.stringify(c.log) === JSON.stringify(original.log);
    if (untouched) return sample;
    const migrated = migrateClaim(c);
    const prior = intakeSamples.find(item => item.id === c.id);
    if (prior && JSON.stringify(claimSchema.parse(prior)) === JSON.stringify(claimSchema.parse(migrated)))
      return demoClaims.find(item => item.id === c.id)!;
    return migrated;
  });
  return [...merged, ...demoClaims.filter((d) => !merged.some((c) => c.id === d.id))];
}
