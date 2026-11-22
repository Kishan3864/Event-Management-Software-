import type { Booking, Invoice, Payment, Settings } from "../types";

export interface ReportColumn {
  key: string;
  label: string;
  width?: number; // points; omitted = flexible
  align?: "left" | "right" | "center";
}

export interface ReportSpec {
  title: string;
  period?: string;
  summary?: { label: string; value: string }[];
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals?: Record<string, string>;
  orientation?: "portrait" | "landscape";
  sections?: { title: string; columns: ReportColumn[]; rows: Record<string, string>[]; totals?: Record<string, string> }[];
  note?: string;
}

export type PdfJob =
  | { kind: "invoice"; invoice: Invoice; settings: Settings; paid?: number; balance?: number }
  | { kind: "bookingSlip"; booking: Booking; settings: Settings; variant: "slip" | "challan" }
  | { kind: "returnSlip"; booking: Booking; settings: Settings }
  | { kind: "receipt"; payment: Payment; booking?: Booking | null; settings: Settings }
  | { kind: "report"; report: ReportSpec; settings: Settings };

export async function renderPdf(job: PdfJob): Promise<Blob> {
  const mod = await import("./render");
  return mod.renderPdfBlob(job);
}
