import type { Photo } from "./claims";

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}
function thumbnail(
  media: CanvasImageSource,
  width: number,
  height: number,
  limit: number,
) {
  const scale = Math.min(1, limit / Math.max(width, height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Media decoding is unavailable.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(media, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}
async function readClip(file: File, url: string): Promise<Photo> {
  const player = document.createElement("video");
  player.muted = true;
  player.playsInline = true;
  player.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () =>
          reject(
            new Error("The clip could not be decoded. Try an MP4 recording."),
          ),
        12000,
      );
      player.onloadeddata = () => {
        clearTimeout(timer);
        resolve();
      };
      player.onerror = () => {
        clearTimeout(timer);
        reject(
          new Error("This browser cannot play the clip. Try an MP4 recording."),
        );
      };
      player.src = url;
    });
    const duration = Number.isFinite(player.duration)
      ? player.duration
      : undefined;
    return {
      kind: "video",
      name: file.name,
      src: await dataUrl(file),
      poster: thumbnail(player, player.videoWidth, player.videoHeight, 500),
      duration,
    };
  } finally {
    player.removeAttribute("src");
    player.load();
  }
}
export async function readPhotos(
  files: FileList | File[],
  previousCount = 0,
): Promise<Photo[]> {
  const list = Array.from(files);
  if (list.length + previousCount > 8)
    throw new Error("Choose up to eight evidence files per claim.");
  return Promise.all(
    list.map(async (file) => {
      const video = ["video/mp4", "video/webm", "video/quicktime"].includes(
        file.type,
      );
      if (
        !video &&
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        throw new Error("Choose JPEG, PNG, WebP, MP4, MOV or WebM files.");
      if (file.size > 12_000_000)
        throw new Error("Use a shorter clip or a file under 12 MB.");
      const url = URL.createObjectURL(file);
      try {
        if (video) return await readClip(file, url);
        const image = new Image();
        image.src = url;
        await image.decode();
        return {
          name: file.name,
          kind: "photo" as const,
          src: thumbnail(image, image.width, image.height, 1400),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }),
  );
}
export async function asDataUrl(photo: Photo): Promise<string> {
  if (photo.src.startsWith("data:")) return photo.src;
  const response = await fetch(photo.src);
  if (!response.ok) throw new Error("An evidence file could not be loaded.");
  return dataUrl(await response.blob());
}
