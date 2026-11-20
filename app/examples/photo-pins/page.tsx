"use client";

import Link from "next/link";
import { Evidence } from "@/components/Evidence";
import { type Claim } from "@/lib/claims";
import { sample } from "@/lib/sample";

const photoId = "bmw-bumper-headlamp";
const image = { ...sample.photos[4], id: photoId };
const claim: Claim = {
  ...sample,
  id: "DEMO-2084",
  photos: [image, sample.photos[0]],
  stage: "missing",
  evidenceRequests: [{
    id: "front-left-close-ups",
    created: sample.created,
    status: "awaiting",
    recipient: "Policyholder",
    message: "Please provide two close-ups of the front-left corner.",
    pins: [
      { id: "headlamp", source: "agent", photoId, photoName: image.name, x: 68, y: 33,
        comment: "Photograph the cracked left headlamp straight on in daylight. Include the full lens so we can see how far the crack extends." },
      { id: "bumper", source: "agent", photoId, photoName: image.name, x: 40, y: 58,
        comment: "Take a side-on close-up of the split in the bumper below the headlamp. Include both edges so we can see how far they have separated." },
    ],
  }],
};

export default function PhotoPinExample() {
  return <main className="mx-auto max-w-3xl px-5 py-6">
    <Link href="/" className="text-button">All claims</Link>
    <header className="my-4">
      <p className="text-sm text-muted-foreground">Example claim · {claim.id}</p>
      <h1 className="text-2xl font-semibold">{claim.vehicle}</h1>
      <p>Select a numbered pin to read the photo request.</p>
    </header>
    <Evidence claim={claim} readOnly />
  </main>;
}
