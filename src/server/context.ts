import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { analyze, type Analysis } from "@/lib/finance/analysis";
import type { Snapshot } from "@/lib/finance/types";
import { requireUser, type SessionUser } from "./auth/session";
import { refreshIfStale } from "./services/fx";
import { loadSnapshot } from "./services/snapshot";

export interface AppData {
  user: SessionUser;
  snapshot: Snapshot;
  analysis: Analysis;
}

/** Loads (once per request) the user's data and the full financial analysis. */
export const getAppData = cache(async (): Promise<AppData> => {
  const user = await requireUser();
  let snapshot: Snapshot;
  try {
    snapshot = await loadSnapshot(user.id);
  } catch (err) {
    // The session points to a user that no longer exists (e.g. database reset).
    if (err instanceof Error && /foreign key|violates/i.test(err.message)) redirect("/auth/signout");
    throw err;
  }
  const latestApi = snapshot.fxRates.filter((r) => !r.isManual).sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))[0];
  if (await refreshIfStale(user.id, latestApi?.fetchedAt ?? null, snapshot.today)) {
    snapshot = await loadSnapshot(user.id);
  }
  return { user, snapshot, analysis: analyze(snapshot) };
});
