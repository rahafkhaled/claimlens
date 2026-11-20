import type { Claim, EvidencePin } from "./claims";
import { asDataUrl } from "./photos";

export type LocatedPin = { reference?: boolean; index: number; x: number; y: number; comment: string };
export const pinLabel = (source: EvidencePin["source"]) =>
  source === "reference" ? "Sample reference pin" : source === "ai" ? "AI pin" : source === "agent" ? "Agent pin" : "Saved pin";

// Each visible cross has a stable address in the original photo. This avoids
// relying on a vision model to estimate full-frame pixel coordinates.
async function gridPhoto(photo: Claim["photos"][number]) {
  const image = new Image();
  image.src = await asDataUrl(photo);
  await image.decode();
  const scale = 1440 / Math.max(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Photo grid unavailable");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.font = "bold 13px sans-serif";
  ctx.lineWidth = 2;
  for (let row = 1; row < 20; row++) {
    for (let col = 1; col < 20; col++) {
      const x = col * canvas.width / 20, y = row * canvas.height / 20;
      const label = String.fromCharCode(64 + row) + col;
      ctx.strokeStyle = "#20162b";
      ctx.fillStyle = "#fff";
      ctx.strokeText(label, x + 3, y - 3);
      ctx.fillText(label, x + 3, y - 3);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffed54";
      ctx.fill();
      ctx.stroke();
    }
  }
  return canvas.toDataURL("image/jpeg", .88);
}

// Reviewed landmarks belong to this exact, bundled example image. An uploaded
// photo or a different view must always be localized from its own pixels.
function camryReference(claim: Claim, target: string): LocatedPin | undefined {
  const index = claim.photos.findIndex(photo => photo.synthetic && photo.src === "/evidence/camry/4.jpg");
  if (index < 0 || !claim.sample || /\b(left|front)\b/i.test(target)) return;
  const lamp = /\b(tail[ -]?(?:light|lamp)|rear[ -](?:light|lamp))s?\b/i.test(target);
  const bumper = /\bbumper\b/i.test(target);
  if (lamp === bumper) return;
  if (lamp && /\bright\b/i.test(target)) return {
    index, x: 46.5, y: 50.7, reference: true,
    comment: "Take a sharp, straight-on close-up of the right tail lamp. Include the full lens and the edge where it meets the body.",
  };
  if (bumper && /\brear\b/i.test(target)) return {
    index, x: 47.6, y: 61, reference: true,
    comment: "Take a clear close-up of this rear bumper corner from the side. Include the seam below the lamp to show how the bumper fits against the body.",
  };
}

export async function locatePins(claim: Claim, targets: string[], signal: AbortSignal): Promise<LocatedPin[]> {
  const stills = claim.photos.map((photo, index) => ({ photo, index })).filter(({ photo }) => photo.kind !== "video");
  if (!stills.length || !targets.length) return [];
  const references = targets.map(target => camryReference(claim, target));
  const pending = targets.filter((_, n) => !references[n]);
  const known = references.filter((pin): pin is LocatedPin => !!pin);
  if (!pending.length) return known;
  const images = await Promise.all(stills.map(({ photo }) => gridPhoto(photo)));
  const response = await fetch("/api/analyze", { method: "POST", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step: "pins", grid: true, targets: pending, images, photoNames: stills.map(({ photo }) => photo.name), vehicle: claim.vehicle, details: claim.details, accidentDescription: claim.accidentDescription }) });
  if (!response.ok) throw new Error("Photo localization unavailable");
  const data = await response.json() as { pins: { item: number; x: number; y: number; comment: string }[] };
  return known.concat(data.pins.flatMap(pin => {
    const still = stills[pin.item - 1];
    if (!still || !Number.isFinite(pin.x) || !Number.isFinite(pin.y) || pin.x < 0 || pin.y < 0 || pin.x > 1000 || pin.y > 1000 || !pin.comment?.trim()) return [];
    return [{ index: still.index, x: pin.x / 10, y: pin.y / 10, comment: pin.comment }];
  }));
}
