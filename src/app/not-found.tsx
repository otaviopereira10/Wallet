import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <p className="font-display text-6xl text-pink-500">404</p>
        <h1 className="mt-2 text-lg font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted">O endereço não existe ou foi movido.</p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-full bg-pink-500 px-5 py-2.5 text-sm font-semibold text-on-primary">
          Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
