"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-bg text-danger">
          <TriangleAlert className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-2xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">This page could not load. Your data is safe — please try again in a moment.</p>
        <Button className="mt-6" onClick={reset}>
          <RotateCcw /> Try again
        </Button>
      </div>
    </div>
  );
}
