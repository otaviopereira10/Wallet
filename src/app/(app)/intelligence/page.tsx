import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { IntelligenceClient } from "./intelligence-client";

export const metadata: Metadata = { title: "Isabelle Intelligence" };

export default function IntelligencePage() {
  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Isabelle Intelligence"
        description="Sua assistente financeira. As respostas são calculadas a partir dos seus dados reais; quando falta informação, ela diz o que falta."
      />
      <IntelligenceClient />
    </>
  );
}
