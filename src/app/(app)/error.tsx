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
        <h1 className="mt-4 font-display text-2xl">Algo não saiu como esperado</h1>
        <p className="mt-2 text-sm text-muted">Não foi possível carregar esta página. Seus dados estão seguros — tente novamente em instantes.</p>
        <Button className="mt-6" onClick={reset}>
          <RotateCcw /> Tentar novamente
        </Button>
      </div>
    </div>
  );
}
