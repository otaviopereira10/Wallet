import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { IntelligenceClient } from "./intelligence-client";

export const metadata: Metadata = { title: "Ask Isabelle" };

export default function IntelligencePage() {
  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Ask Isabelle"
        description="Ask questions about your money in plain words. Answers are calculated from your real data — if something is missing, Isabelle tells you what to add."
      />
      <IntelligenceClient />
    </>
  );
}
