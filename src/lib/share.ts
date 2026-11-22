// Download / share / print helpers that work on mobile Chrome, desktop and installed PWAs.

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Blob(["%PDF-1.4"], { type: "application/pdf" })], "test.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Opens the system share sheet with the PDF (WhatsApp, Gmail, Drive…). Falls back to download. */
export async function shareBlob(
  blob: Blob,
  fileName: string,
  meta: { title?: string; text?: string } = {}
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], fileName, { type: blob.type || "application/pdf" });
  if (typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: meta.title || fileName, text: meta.text });
      return "shared";
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name === "AbortError") return "cancelled";
      // NotAllowedError etc: fall back to download
    }
  }
  downloadBlob(blob, fileName);
  return "downloaded";
}

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // Pop-up blocked: navigate the current tab instead
    window.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

/** Prints a PDF. Desktop uses a hidden frame; phones open the PDF viewer (print from there). */
export function printBlob(blob: Blob) {
  if (isMobileDevice()) {
    openBlob(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        openBlob(blob);
      }
    }, 300);
  };
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}
