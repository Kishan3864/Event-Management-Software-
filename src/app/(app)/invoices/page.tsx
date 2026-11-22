import type { Metadata } from "next";
import { InvoicesClient } from "./invoices-client";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return <InvoicesClient />;
}
