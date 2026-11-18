import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { DataClient } from "./data-client";

export const metadata: Metadata = { title: "Import & Backup" };

export default function DataPage() {
  return (
    <>
      <PageHeader
        eyebrow="App"
        title="Import & Backup"
        description="Bring in transactions from a CSV file (like a bank statement), download your data and keep backup copies. No bank connection needed."
      />
      <DataClient />
    </>
  );
}
