import type { Metadata } from "next";
import { MoreClient } from "./more-client";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  return <MoreClient />;
}
