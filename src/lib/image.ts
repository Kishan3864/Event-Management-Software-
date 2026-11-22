/**
 * A logo is shown only when it is an image stored inside the app (a data: URL made by resizeLogo).
 * Anything else, e.g. a web address written directly into the settings, is ignored, so opening a
 * business never makes the browser contact an outside server.
 */
export function safeLogo(v: unknown): string | undefined {
  return typeof v === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : undefined;
}

/**
 * Resizes an uploaded logo and returns a PNG/JPEG data URL small enough to keep inside
 * the Firestore settings document (no Firebase Storage needed).
 */
export async function resizeLogo(file: File, maxSize = 360): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read this image."));
      el.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image resize is not supported on this device.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    let data = canvas.toDataURL("image/png");
    if (data.length > 300_000) {
      // Large PNG: use JPEG on a white background instead
      const c2 = document.createElement("canvas");
      c2.width = w;
      c2.height = h;
      const x2 = c2.getContext("2d")!;
      x2.fillStyle = "#ffffff";
      x2.fillRect(0, 0, w, h);
      x2.drawImage(canvas, 0, 0);
      data = c2.toDataURL("image/jpeg", 0.85);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
