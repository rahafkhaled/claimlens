import { z } from "zod";

export const partCodes = [
  "bumper",
  "fender",
  "headlamp",
  "taillamp",
  "mirror",
  "grille",
  "trunk",
  "roof",
  "quarter_panel",
  "rocker_panel",
  "windshield",
  "rear_glass",
  "side_glass",
  "tire",
  "suspension",
  "structure",
  "sensor",
  "calibration",
  "hood",
  "door",
  "glass",
  "wheel",
  "paint",
  "other",
] as const;
const coord = z.number().min(0).max(1000);
export const evidenceRefSchema = z.object({
  item: z.number().int().min(1).max(8),
  box: z
    .tuple([coord, coord, coord, coord])
    .refine(
      ([top, left, bottom, right]) => bottom > top && right > left,
      "Invalid region",
    ),
  seconds: z.number().nonnegative().optional().nullable(),
});
export const operations = ["Replace", "Repair", "Refinish", "Inspect"] as const;
export const inspectionEvidenceSchema = z.object({
  item: z.number().int().min(1).max(8),
  indicator: z.enum(["wheel_displacement", "load_bearing_deformation", "compartment_intrusion", "component_damage"]),
  observation: z.string().trim().min(10).max(400),
});
export const findingsSchema = z
  .array(
    z.object({
      component: z.string().min(1).max(100),
      code: z.enum(partCodes),
      damage: z.string().min(1).max(240),
      repair: z.string().min(1).max(240),
      operation: z.enum(operations).optional(),
      evidence: z.array(evidenceRefSchema).max(8).optional(),
      severity: z.enum(["High", "Moderate", "Low"]),
      accidentRelation: z.enum(["related", "unrelated", "uncertain"]).optional(),
      accidentReason: z.string().min(1).max(400).optional(),
      visualBasis: z.enum(["visible_damage", "inspection_indicator", "unconfirmed"]).optional(),
      inspectionEvidence: inspectionEvidenceSchema.nullable().optional(),
    }),
  )
  .max(12);
export const evidenceDecision = z.object({
  choice: z.enum(["sufficient", "missing", "uncertain"]),
  confidence: z.number().min(0).max(1),
  modelChoice: z.enum(["sufficient", "missing", "uncertain"]).optional(),
  reason: z.string().max(1200).optional(),
});
export const qualitySchema = z.object({
  summary: z.string().min(1).max(1200),
  references: z.array(z.object({issue:z.string(),photos:z.array(z.number().int().min(1).max(8))})).optional(),
  gaps: z.array(z.string().max(300)).max(8),
  ambiguities: z.array(z.string().max(300)).max(8).optional(),
});
export const lineSchema = z.object({
  component: z.string(),
  repair: z.string(),
  parts: z.number().nonnegative(),
  labor: z.number().nonnegative(),
  source: z.string(),
  needsQuote: z.boolean(),
  quoteConfirmedAt: z.iso.datetime().optional(),
  zeroCostReason: z.string().max(600).optional(),
  inspection: z.discriminatedUnion("status", [
    z.object({ status: z.literal("booked") }),
    z.object({ status: z.literal("completed"), findings: z.string().trim().min(1).max(600), repairDecision: z.string().trim().min(1).max(600) }),
  ]).optional(),
  inspectionNote: z.string().max(600).optional(),
  editedByAgentAt: z.iso.datetime().optional(),
  catalogueId: z.string().optional(),
});
export type Line = z.infer<typeof lineSchema>;
export type Finding = z.infer<typeof findingsSchema>[number];
export type Decision = z.infer<typeof evidenceDecision>;
const photoSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  src: z.string(),
  kind: z.enum(["photo", "video"]).optional(),
  duration: z.number().nonnegative().optional(),
  poster: z.string().optional(),
  synthetic: z.boolean().optional(),
});
export const evidenceRequestSchema = z.object({
  id: z.string(),
  created: z.iso.datetime(),
  // Retain the former shop value when reading existing request history.
  // New evidence requests are always addressed to the policyholder.
  recipient: z.enum(["Policyholder", "Repair shop"]),
  status: z.enum(["awaiting", "received"]),
  receivedAt: z.iso.datetime().optional(),
  repairItems: z.array(z.string()).optional(),
  message: z.string().max(800),
  pins: z.array(z.object({
    id: z.string(),
    source: z.enum(["ai", "agent", "reference"]).optional(),
    photoId: z.string(),
    photoName: z.string(),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    comment: z.string().trim().min(1).max(600),
  })).max(20),
});
export type EvidenceRequest = z.infer<typeof evidenceRequestSchema>;
export type EvidencePin = EvidenceRequest["pins"][number];
const stageSchema = z.enum([
  "intake",
  "missing",
  "uncertain",
  "assessment",
  "review",
  "corrections",
  "senior",
  "authorized",
]);
export const claimSchema = z.object({
  id: z.string(),
  title: z.string(),
  vehicle: z.string(),
  details: z.string(),
  accidentDescription: z.string().max(1800).optional(),
  flags: z.array(z.object({ text:z.string(), photos:z.array(z.number().int().min(1).max(8)) })).optional(),
  scopeNeedsReview: z.boolean().optional(),
  evidenceUpdated: z.boolean().optional(),
  scopeReviewed: z.boolean().optional(),
  created: z.iso.datetime(),
  sample: z.boolean(),
  currency: z.literal("QAR").optional(),
  demoScenario: z.string().optional(),
  demoVersion: z.number().optional(),
  photos: z.array(photoSchema).min(1).max(8),
  evidenceRequests: z.array(evidenceRequestSchema).optional(),
  stage: stageSchema,
  quality: z.string(),
  gaps: z.array(z.string()),
  decision: evidenceDecision.nullable(),
  decisionSource: z.enum(["jev", "demo"]).optional(),
  findings: findingsSchema,
  excludedFindings: findingsSchema.optional(),
  lines: z.array(lineSchema),
  log: z.array(
    z.object({ title: z.string(), detail: z.string(), at: z.iso.datetime(), delivery: z.enum(["unread","viewed","recalled"]).optional() }),
  ),
  request: z.string(),
  override: z.boolean(),
  authorization: z
    .object({ shop: z.string(), adjuster: z.string(), at: z.iso.datetime() })
    .optional(),
});
export type Photo = z.infer<typeof photoSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Claim = z.infer<typeof claimSchema>;
export const stageLabels: Record<Stage, string> = {
  intake: "Awaiting analysis",
  missing: "Evidence needed",
  uncertain: "Agent review",
  assessment: "Damage assessment",
  review: "In review",
  corrections: "Changes requested",
  senior: "Senior review",
  authorized: "Authorized",
};
export const stageIndex: Record<Stage, number> = {
  intake: 0,
  missing: 1,
  uncertain: 1,
  assessment: 2,
  review: 3,
  corrections: 3,
  senior: 4,
  authorized: 5,
};
export const stages = [
  "Intake",
  "Evidence check",
  "Damage analysis",
  "Estimate review",
  "Authorization",
];
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "QAR",
    currencyDisplay: "code",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
export const total = (lines: Line[]) =>
  lines.reduce(
    (cents, line) =>
      line.needsQuote ? cents : cents + Math.round(line.parts * 100) + Math.round(line.labor * 100),
    0,
  ) / 100;
export const displayDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
export const addEvent = (
  claim: Claim,
  title: string,
  detail: string,
  change: Partial<Claim> = {},
  delivery?: "unread",
): Claim => ({
  ...claim,
  ...change,
  log: [{ title, detail, delivery, at: new Date().toISOString() }, ...claim.log],
});

export const inspectionPending = (finding: Finding, line?: Line) =>
  requiresInspection(finding) && line?.inspection?.status !== "completed";

export const inspectionSummary = (line: Line) => {
  const record = line.inspection;
  if (record?.status === "completed") return "Inspection completed · " + record.findings + " · Repair decision: " + record.repairDecision;
  if (record?.status === "booked") return "Inspection booked · Awaiting findings";
  return "";
};

export const requiresInspection = (finding: Finding) =>
  finding.operation === "Inspect" || finding.code === "structure" ||
  (finding.operation === "Replace" && ["roof", "quarter_panel", "rocker_panel", "suspension"].includes(finding.code));

export type ViewRole = "agent" | "senior";
export const needsScopeReview = (claim: Claim) => !!claim.scopeNeedsReview || (claim.decisionSource === "jev" && !claim.scopeReviewed);
export function partitionAccidentFindings(findings: Finding[]) {
  return { findings: findings.filter(f => f.accidentRelation === "related"), excludedFindings: findings.filter(f => f.accidentRelation !== "related") };
}
