import { type Claim } from "./claims";
export const sample: Claim = {
  id: "CLM-2084",
  title: "Front-end collision",
  vehicle: "2021 BMW 330i",
  details:
    "Front-left impact. The policyholder submitted an exterior overview and detail views of the impact area.",
  created: "2026-11-18T09:40:00Z",
  sample: true,
  stage: "review",
  request: "",
  override: false,
  photos: [
    { name: "Front-left overview", src: "/evidence/front-quarter.jpg" },
    { name: "Front bumper detail", src: "/evidence/bumper.jpg" },
    { name: "Left fender detail", src: "/evidence/fender.jpg" },
    { name: "Headlamp detail", src: "/evidence/headlamp.jpg" },
  ],
  quality:
    "The overview and detail crops show the bumper, fender and headlamp area. Internal damage requires an inspection.",
  gaps: [],
  decision: { choice: "sufficient", confidence: 0.972 },
  findings: [
    {
      component: "Front bumper",
      code: "bumper",
      operation: "Replace",
      evidence: [
        { item: 1, box: [575, 37, 796, 270] },
        { item: 2, box: [120, 90, 850, 910] },
      ],
      damage: "Cover displaced at the left corner",
      repair: "Replace bumper assembly",
      severity: "High",
    },
    {
      component: "Left fender",
      code: "fender",
      operation: "Replace",
      evidence: [
        { item: 1, box: [422, 294, 550, 450] },
        { item: 3, box: [120, 90, 850, 910] },
      ],
      damage: "Metal folded above the wheel arch",
      repair: "Replace and refinish fender",
      severity: "Moderate",
    },
    {
      component: "Left headlamp",
      code: "headlamp",
      operation: "Replace",
      evidence: [
        { item: 1, box: [498, 145, 610, 321] },
        { item: 4, box: [120, 90, 850, 910] },
      ],
      damage: "Assembly displaced at the impact site",
      repair: "Replace headlamp assembly",
      severity: "High",
    },
  ],
  lines: [
    {
      component: "Front bumper",
      repair: "Replace bumper assembly",
      parts: 720,
      labor: 480,
      source: "Prototype price book",
      needsQuote: false,
    },
    {
      component: "Left fender",
      repair: "Replace and refinish fender",
      parts: 445,
      labor: 360,
      source: "Prototype price book",
      needsQuote: false,
    },
    {
      component: "Left headlamp",
      repair: "Replace headlamp assembly",
      parts: 1220,
      labor: 240,
      source: "Prototype price book",
      needsQuote: false,
    },
  ],
  log: [
    {
      title: "Estimate ready for review",
      detail: "Three repair items priced from the prototype price book.",
      at: "2026-11-18T09:48:00Z",
    },
    {
      title: "Damage analysis completed",
      detail: "Three visible components identified in the sample assessment.",
      at: "2026-11-18T09:46:00Z",
    },
    {
      title: "Evidence marked sufficient",
      detail: "Sample Jev decision recorded for this walkthrough.",
      at: "2026-11-18T09:44:00Z",
    },
    {
      title: "Claim received",
      detail: "Vehicle details and inspection imagery added.",
      at: "2026-11-18T09:40:00Z",
    },
  ],
};

// Earlier demo records used fixed pins. Restore their known references only for the original sample media.
export function restoreSampleReferences(claim: Claim): Claim {
  if (
    !claim.sample ||
    claim.photos.length !== sample.photos.length ||
    !claim.photos.every((photo, i) => photo.src === sample.photos[i].src)
  )
    return claim;
  return {
    ...claim,
    findings: claim.findings.map((f) => {
      const original = sample.findings.find(
        (o) => o.component === f.component && o.code === f.code,
      );
      return original && !f.evidence
        ? { ...f, evidence: original.evidence, operation: original.operation }
        : f;
    }),
  };
}
