import { z } from "zod";
import { evidenceDecision, qualitySchema, type Decision, type Stage } from "./claims";

export const reviewStep = z.enum(["loading", "quality", "decision", "damage", "pricing"]);
export type ReviewStep = z.infer<typeof reviewStep>;
export const reviewEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage"), stage: reviewStep }),
  z.object({ type: z.literal("quality"), quality: qualitySchema }),
  z.object({ type: z.literal("decision"), decision: evidenceDecision }),
  z.object({ type: z.literal("findings"), count: z.number().int().nonnegative() }),
  z.object({ type: z.literal("priced"), count: z.number().int().nonnegative(), unpriced: z.number().int().nonnegative() }),
  z.object({ type: z.literal("result"), data: z.unknown() }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);
export type ReviewEvent = z.infer<typeof reviewEventSchema>;
export type ReviewRun = {
  claimId: string;
  phase: ReviewStep | "complete" | "error";
  completed: ReviewStep[];
  decision: Decision | null;
  summary: string;
  findingCount?: number;
  pricedCount?: number;
  unpricedCount?: number;
  outcome?: Stage;
  error?: string;
};
export function advanceReview(run: ReviewRun, event: ReviewEvent): ReviewRun {
  const done = (step: ReviewStep) => Array.from(new Set([...run.completed, step]));
  switch (event.type) {
    case "stage": return { ...run, phase: event.stage, completed: event.stage === "quality" ? done("loading") : run.completed };
    case "quality": return { ...run, completed: done("quality"), summary: event.quality.summary };
    case "decision": return { ...run, completed: done("decision"), decision: event.decision };
    case "findings": return { ...run, completed: done("damage"), findingCount: event.count };
    case "priced": return { ...run, completed: done("pricing"), pricedCount: event.count, unpricedCount: event.unpriced };
    case "error": return { ...run, phase: "error", error: event.error };
    default: return run;
  }
}
// Stream transport also accepts legacy JSON responses for cached clients and test fixtures.
export async function readReviewResponse(response: Response, emit: (event: ReviewEvent) => void): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Photo review failed. Try again.");
    return data as unknown;
  }
  if (!response.ok || !response.body) throw new Error("Photo review could not start.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", result: unknown, receivedResult = false;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = reviewEventSchema.parse(JSON.parse(line));
    emit(event);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "result") { result = event.data; receivedResult = true; }
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1);
      }
      if (done) { consume(buffer); break; }
    }
    if (!receivedResult) throw new Error("Photo review was interrupted. Try again.");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
