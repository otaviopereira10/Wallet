import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { DataClient } from "./data-client";

export const metadata: Metadata = { title: "Importar & backup" };

export default function DataPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Importar & backup"
        description="Traga movimentações por CSV, exporte seus dados e mantenha cópias de segurança. Nenhuma conexão bancária é necessária."
      />
      <DataClient />
    </>
  );
}
