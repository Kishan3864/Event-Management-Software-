"use client";

import { Download, ExternalLink, FileText, Loader2, MessageCircle, Printer, RotateCcw, Share2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { renderPdf, type PdfJob } from "@/lib/pdf/types";
import { canShareFiles, downloadBlob, isMobileDevice, openBlob, printBlob, shareBlob } from "@/lib/share";
import { openWhatsApp } from "@/lib/whatsapp";

export interface PdfRequest {
  title: string;
  fileName: string;
  job: PdfJob | (() => Promise<PdfJob>);
  shareText?: string;
  whatsapp?: { mobile: string; text: string } | null;
}

const PdfContext = createContext<{ openPdf: (r: PdfRequest) => void } | null>(null);

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PdfProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<PdfRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);
  const wide = useMediaQuery("(min-width: 768px)");
  const [mobileDevice, setMobileDevice] = useState(false);
  const [shareable, setShareable] = useState(false);

  useEffect(() => {
    setMobileDevice(isMobileDevice());
    setShareable(canShareFiles());
  }, []);

  const build = useCallback(async (r: PdfRequest, id: number) => {
    try {
      const job = typeof r.job === "function" ? await r.job() : r.job;
      const b = await renderPdf(job);
      if (gen.current !== id) return;
      setBlob(b);
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(b);
      });
    } catch (e) {
      console.error("PDF failed", e);
      if (gen.current === id) setError((e as Error)?.message || "Could not create the PDF.");
    }
  }, []);

  const openPdf = useCallback(
    (r: PdfRequest) => {
      const id = ++gen.current;
      setReq(r);
      setBlob(null);
      setError(null);
      setOpen(true);
      void build(r, id);
    },
    [build]
  );

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      const g = ++gen.current;
      setTimeout(() => {
        // Another PDF was opened meanwhile: keep it.
        if (gen.current !== g) return;
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        setBlob(null);
        setReq(null); // the closed document's data (customers, amounts) is not kept around
      }, 300);
    }
  };

  const onShare = async () => {
    if (!blob || !req) return;
    const res = await shareBlob(blob, req.fileName, { title: req.title, text: req.shareText });
    if (res === "downloaded") toast.success("PDF downloaded", { description: req.fileName });
  };
  const onDownload = () => {
    if (!blob || !req) return;
    downloadBlob(blob, req.fileName);
    toast.success("PDF downloaded", { description: req.fileName });
  };
  const onPrint = () => blob && printBlob(blob);
  const onOpen = () => blob && openBlob(blob);

  const showPreview = wide && !mobileDevice && !!url;
  const ctx = useMemo(() => ({ openPdf }), [openPdf]);

  return (
    <PdfContext.Provider value={ctx}>
      {children}
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className={showPreview ? "sm:max-w-3xl" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle>{req?.title ?? "Document"}</DialogTitle>
            <DialogDescription className="truncate">{req?.fileName}</DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-danger-soft p-4 text-sm text-destructive">
              <p className="font-medium">Could not create the PDF</p>
              <p className="mt-1 text-destructive/80">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => req && openPdf(req)}
              >
                <RotateCcw /> Try again
              </Button>
            </div>
          ) : !blob ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/40 py-10">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Preparing PDF…</p>
            </div>
          ) : showPreview ? (
            <iframe title="PDF preview" src={url!} className="h-[58vh] w-full rounded-xl border bg-muted" />
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border bg-accent/50 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <FileText className="size-6" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{req?.fileName}</p>
                <p className="text-xs text-muted-foreground">PDF · {sizeLabel(blob.size)} · A4</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button className="col-span-2 sm:col-span-1" disabled={!blob} onClick={onShare}>
              <Share2 /> {shareable ? "Share" : "Save"}
            </Button>
            <Button variant="outline" disabled={!blob} onClick={onDownload}>
              <Download /> Download
            </Button>
            <Button variant="outline" disabled={!blob} onClick={onPrint}>
              <Printer /> Print
            </Button>
            <Button variant="outline" disabled={!blob} onClick={onOpen} className={showPreview ? "" : ""}>
              <ExternalLink /> Open
            </Button>
          </div>
          {req?.whatsapp?.mobile ? (
            <Button
              variant="secondary"
              className="bg-[#e7f8ee] text-[#128c4b] hover:bg-[#d6f3e2]"
              onClick={() => openWhatsApp(req.whatsapp!.mobile, req.whatsapp!.text)}
            >
              <MessageCircle /> Send message on WhatsApp
            </Button>
          ) : null}
          {shareable ? (
            <p className="text-center text-xs text-muted-foreground">
              Tap <span className="font-medium text-foreground">Share</span> and pick WhatsApp to send this PDF.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </PdfContext.Provider>
  );
}

export function usePdf() {
  const ctx = useContext(PdfContext);
  if (!ctx) throw new Error("usePdf must be used inside PdfProvider");
  return ctx;
}
