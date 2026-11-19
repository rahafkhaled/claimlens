import { z } from "zod";
import { qualitySchema, type Decision, type Finding } from "./claims";

// New provider responses require explicit ambiguity; old saved claims remain readable.
export const mediaReviewSchema = qualitySchema.extend({
  ambiguities: z.array(z.string().trim().min(1).max(300)).max(8),
  gaps: z.array(z.string().trim().min(1).max(300)).max(8),
});

const minimumRoutingConfidence = 0.8;
export function routeEvidence(quality: z.infer<typeof mediaReviewSchema>, model: Decision): Decision {
  const guarded = (choice: Decision["choice"], reason: string): Decision => ({
    choice, confidence: model.confidence, modelChoice: model.choice, reason,
  });
  if (model.confidence < minimumRoutingConfidence) {
    return guarded("uncertain", "Model confidence is below the 80% routing threshold. An agent must review the evidence.");
  }
  if (quality.gaps.length) {
    return model.choice === "missing" ? model : guarded("missing", "The photo review identified unusable or missing damage views: " + quality.gaps.join(" ").slice(0, 1000));
  }
  if (quality.ambiguities.length) {
    return guarded("uncertain", "The images do not establish definite damage: " + quality.ambiguities.join(" ").slice(0, 1000));
  }
  if (model.choice === "missing") {
    return guarded("uncertain", "The model requested more photos, but the photo review identified no missing views. An agent must resolve the conflicting results.");
  }
  return model;
}

export function validateObservations(observations: Finding[]): Finding[] {
  return observations.map(finding => {
    const indicator = finding.inspectionEvidence;
    if (!finding.visualBasis || finding.inspectionEvidence === undefined) throw new Error("Missing visual basis");
    if (indicator && !finding.evidence?.some(ref => ref.item === indicator.item)) throw new Error("Inspection indicator is not linked to evidence");
    const structural = finding.code === "structure" || finding.code === "suspension";
    const inspection = structural || finding.operation === "Inspect" || finding.visualBasis === "inspection_indicator";
    const supportedInspection = !!indicator && (!structural || indicator.indicator !== "component_damage");
    if (finding.visualBasis === "unconfirmed" || (inspection && !supportedInspection)) {
      return { ...finding, accidentRelation: finding.accidentRelation === "unrelated" ? "unrelated" : "uncertain", visualBasis: "unconfirmed",
        accidentReason: "Visible evidence does not establish this finding or an inspection trigger. Agent confirmation is required; excluded from the estimate." };
    }
    return inspection ? { ...finding, operation: "Inspect" } : finding;
  });
}
