import type { Metadata } from "next";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return <SetupClient />;
}
