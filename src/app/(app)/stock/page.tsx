import type { Metadata } from "next";
import { StockClient } from "./stock-client";

export const metadata: Metadata = { title: "Stock" };

export default function StockPage() {
  return <StockClient />;
}
