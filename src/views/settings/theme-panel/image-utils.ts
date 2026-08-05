const MAX_IMAGE_BYTES = 8_000_000;
const MAX_IMAGE_DIMENSION = 3840;

async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Read failed"));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

async function downscaleImage(dataURL: string): Promise<string | null> {
  const img = new Image();
  img.src = dataURL;
  await img.decode().catch(() => null);
  if (!img.width || !img.height) return null;
  const ratio = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  for (const q of [0.85, 0.7, 0.55, 0.4, 0.25]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length < MAX_IMAGE_BYTES) return out;
  }
  return null;
}

export async function processBackgroundImage(file: File): Promise<string | null> {
  const raw = await readFileAsDataURL(file).catch(() => null);
  if (!raw) return null;
  if (raw.length < MAX_IMAGE_BYTES) return raw;
  return downscaleImage(raw);
}
