import type { Metadata } from "next";
import { AdminClient } from "./admin-client";

export const metadata: Metadata = { title: "Clients" };

export default function AdminPage() {
  return <AdminClient />;
}
