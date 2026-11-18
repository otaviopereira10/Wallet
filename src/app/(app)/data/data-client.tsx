"use client";

import { CheckCircle2, CircleAlert, Copy, DatabaseBackup, FileSpreadsheet, FileUp, RotateCcw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useApp, useFormat } from "@/components/app-context";
import { AccountSelect } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/constants";
import { parseCsv, parseDateString, parseMoney, type DateFormat } from "@/lib/finance/csv";
import { centsToInput } from "@/lib/format";
import { commitImport, previewImport, restoreBackupAction, type ImportRowResult } from "@/server/actions/data";

const FIELDS = [
  { key: "date", label: "Date", required: true, guess: /^(data|date|dia)/i },
  { key: "description", label: "Description", required: true, guess: /^(descri|description|hist|memo|nome|name)/i },
  { key: "amount", label: "Amount", required: true, guess: /^(valor|amount|value|quantia)/i },
  { key: "type", label: "Type (income/expense)", required: false, guess: /^(tipo|type|kind)/i },
  { key: "category", label: "Category", required: false, guess: /^(categ)/i },
  { key: "currency", label: "Currency", required: false, guess: /^(moeda|currency)/i },
  { key: "status", label: "Status", required: false, guess: /^(status|situa)/i },
  { key: "notes", label: "Notes", required: false, guess: /^(obs|notes|nota)/i },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CATEGORY_BY_LABEL = new Map<string, string>(Object.entries(CATEGORY_LABELS).flatMap(([k, v]) => [[norm(v), k], [norm(k), k]]));

interface Prepared {
  index: number;
  raw: string[];
  row: Record<string, unknown> | null;
  localError: string | null;
}

export function DataClient() {
  const app = useApp();
  const f = useFormat();
  const router = useRouter();
  const [rows, setRows] = React.useState<string[][]>([]);
  const [fileName, setFileName] = React.useState("");
  const [hasHeader, setHasHeader] = React.useState(true);
  const [mapping, setMapping] = React.useState<Record<FieldKey, number>>({} as Record<FieldKey, number>);
  const [dateFormat, setDateFormat] = React.useState<DateFormat>(app.locale === "en-US" ? "mdy" : "dmy");
  const [signMode, setSignMode] = React.useState<"negative-expense" | "all-expense" | "all-income">("negative-expense");
  const [accountId, setAccountId] = React.useState(app.accounts.find((a) => !a.archived)?.id ?? "");
  const [defaultCategory, setDefaultCategory] = React.useState("other");
  const [preview, setPreview] = React.useState<ImportRowResult[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [restoreJson, setRestoreJson] = React.useState<string | null>(null);
  const [restoreName, setRestoreName] = React.useState("");
  const [restoreSummary, setRestoreSummary] = React.useState<Record<string, number> | null>(null);
  const [confirmRestore, setConfirmRestore] = React.useState(false);

  const header = hasHeader ? (rows[0] ?? []) : (rows[0] ?? []).map((_, i) => `Column ${i + 1}`);
  const body = hasHeader ? rows.slice(1) : rows;
  const account = app.accounts.find((a) => a.id === accountId);

  const onFile = async (file: File) => {
    if (file.size > 4_000_000) return toast.error("File too large (max 4 MB).");
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) return toast.error("The file is empty or not a valid CSV.");
    setRows(parsed);
    setFileName(file.name);
    setPreview(null);
    const head = parsed[0];
    const guess = {} as Record<FieldKey, number>;
    for (const fd of FIELDS) {
      const idx = head.findIndex((h) => fd.guess.test(norm(h)));
      guess[fd.key] = idx;
    }
    setMapping(guess);
    setHasHeader(guess.date >= 0 || guess.amount >= 0);
    // Guess date format from the first data row.
    const sample = parsed[1]?.[guess.date] ?? "";
    if (/^\d{4}-/.test(sample)) setDateFormat("ymd");
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sample) && Number(sample.split("/")[0]) > 12) setDateFormat("dmy");
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sample) && Number(sample.split("/")[0]) <= 12 && Number(sample.split("/")[1]) > 12) setDateFormat("mdy");
  };

  const prepared: Prepared[] = body.map((r, index) => {
    const get = (k: FieldKey) => (mapping[k] >= 0 ? (r[mapping[k]] ?? "").trim() : "");
    const date = parseDateString(get("date"), dateFormat);
    const cents = parseMoney(get("amount"));
    if (!date) return { index, raw: r, row: null, localError: `invalid date (“${get("date")}”)` };
    if (cents === null || cents === 0) return { index, raw: r, row: null, localError: `invalid amount (“${get("amount")}”)` };
    let kind: "income" | "expense";
    const t = norm(get("type"));
    if (t) kind = /receita|income|entrada|credito|credit/.test(t) ? "income" : "expense";
    else if (signMode === "all-expense") kind = "expense";
    else if (signMode === "all-income") kind = "income";
    else kind = cents < 0 ? "expense" : "income";
    const catRaw = norm(get("category"));
    let category = catRaw ? (CATEGORY_BY_LABEL.get(catRaw) ?? catRaw) : kind === "income" ? "other_income" : defaultCategory;
    if (kind === "income" && !(INCOME_CATEGORIES as readonly string[]).includes(category)) category = "other_income";
    if (kind === "expense" && !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) category = defaultCategory;
    const cur = get("currency").toUpperCase();
    const st = norm(get("status"));
    return {
      index,
      raw: r,
      localError: null,
      row: {
        date,
        description: get("description") || "(no description)",
        amount: centsToInput(Math.abs(cents)),
        kind,
        category,
        currency: cur === "BRL" || cur === "USD" ? cur : (account?.currency ?? app.baseCurrency),
        status: kind === "expense" && /pend/.test(st) ? "pending" : "paid",
        notes: get("notes") || null,
      },
    };
  });
  const valid = prepared.filter((p) => p.row);

  const runPreview = async () => {
    if (!accountId) return toast.error("Choose the account.");
    if (!valid.length) return toast.error("No valid rows to check.");
    setBusy(true);
    try {
      const r = await previewImport({ accountId, rows: valid.map((p) => p.row) });
      if (!r.ok) toast.error(r.error);
      else setPreview(r.data ?? []);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const r = await commitImport({ accountId, rows: valid.map((p) => p.row) });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "Import finished");
        setRows([]);
        setPreview(null);
        setFileName("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const serverStatus = (validIdx: number) => preview?.find((p) => p.index === validIdx);
  const okCount = preview?.filter((p) => p.status === "ok").length ?? 0;
  const dupCount = preview?.filter((p) => p.status === "duplicate").length ?? 0;
  const badCount = (preview?.filter((p) => p.status === "invalid").length ?? 0) + prepared.filter((p) => p.localError).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="size-4 text-pink-500" /> Import transactions (CSV)
            </CardTitle>
            <CardDescription>1. Choose a file · 2. Match the columns · 3. Check · 4. Import. Invalid rows are flagged and duplicates are skipped — nothing is saved until you confirm.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong px-6 py-8 text-center transition hover:border-pink-300 hover:bg-pink-50/40">
            <Upload className="size-6 text-pink-500" />
            <span className="text-sm font-medium">{fileName || "Choose a .csv file"}</span>
            <span className="text-xs text-muted">Comma or semicolon separated · up to 5,000 rows</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>

          {rows.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Account for these transactions" htmlFor="imp-acc">
                  <AccountSelect id="imp-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
                </Field>
                <Field label="Date format" htmlFor="imp-date">
                  <Select id="imp-date" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                    <option value="dmy">DD/MM/YYYY</option>
                    <option value="mdy">MM/DD/YYYY</option>
                    <option value="ymd">YYYY-MM-DD</option>
                  </Select>
                </Field>
                <Field label="If there is no type column" htmlFor="imp-sign">
                  <Select id="imp-sign" value={signMode} onChange={(e) => setSignMode(e.target.value as typeof signMode)}>
                    <option value="negative-expense">Negative = expense, positive = income</option>
                    <option value="all-expense">All are expenses</option>
                    <option value="all-income">All are income</option>
                  </Select>
                </Field>
                <Field label="Default category (expenses)" htmlFor="imp-cat">
                  <Select id="imp-cat" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Match the file’s columns</p>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" className="accent-[var(--c-pink-500)]" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                    First row is a header
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {FIELDS.map((fd) => (
                    <Field key={fd.key} label={`${fd.label}${fd.required ? " *" : ""}`} htmlFor={`map-${fd.key}`}>
                      <Select
                        id={`map-${fd.key}`}
                        value={mapping[fd.key] ?? -1}
                        onChange={(e) => {
                          setMapping((m) => ({ ...m, [fd.key]: Number(e.target.value) }));
                          setPreview(null);
                        }}
                      >
                        <option value={-1}>{fd.required ? "Choose a column" : "Don’t use"}</option>
                        {header.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-surface-2/60 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {prepared.slice(0, 200).map((p) => {
                      const vi = valid.indexOf(p);
                      const srv = vi >= 0 ? serverStatus(vi) : undefined;
                      const status = p.localError ? "invalid" : srv?.status;
                      return (
                        <tr key={p.index} className={cn(status === "invalid" && "bg-danger-bg/50", status === "duplicate" && "bg-warning-bg/50")}>
                          <td className="px-3 py-2 text-xs text-muted">{p.index + 1}</td>
                          <td className="px-3 py-2">{p.row ? f.date(String(p.row.date), "short") : (p.raw[mapping.date] ?? "")}</td>
                          <td className="max-w-56 truncate px-3 py-2">{p.row ? String(p.row.description) : (p.raw[mapping.description] ?? "")}</td>
                          <td className="px-3 py-2">{p.row ? (p.row.kind === "income" ? "Income" : "Expense") : "—"}</td>
                          <td className="px-3 py-2">{p.row ? CATEGORY_LABELS[String(p.row.category)] : "—"}</td>
                          <td className="tabular px-3 py-2 text-right">{p.row ? `${p.row.currency} ${p.row.amount}` : (p.raw[mapping.amount] ?? "")}</td>
                          <td className="px-3 py-2 text-xs">
                            {p.localError ? (
                              <span className="text-danger">{p.localError}</span>
                            ) : srv ? (
                              srv.status === "ok" ? (
                                <Badge tone="success">ok</Badge>
                              ) : (
                                <span className={srv.status === "duplicate" ? "text-warning" : "text-danger"}>{srv.errors.join("; ")}</span>
                              )
                            ) : (
                              <span className="text-muted">not checked yet</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {prepared.length > 200 && <p className="px-3 py-2 text-xs text-muted">Showing 200 of {prepared.length} rows.</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {preview ? (
                    <>
                      <CheckCircle2 className="mr-1 inline size-4 text-success" />
                      {okCount} ready · {dupCount} duplicates · {badCount} invalid
                    </>
                  ) : (
                    `${valid.length} of ${prepared.length} rows look valid`
                  )}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={runPreview} loading={busy && !preview}>
                    Check rows
                  </Button>
                  <Button onClick={runImport} disabled={!preview || okCount === 0} loading={busy && !!preview}>
                    Import {preview ? okCount : ""} transaction(s)
                  </Button>
                </div>
              </div>
            </>
          )}
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Example file</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3">{`date,description,amount,category
2026-11-16,Grocery store,-84.90,Groceries
2026-11-15,Freelance job,350.00,Side income`}</pre>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-pink-500" /> Download CSV
              </CardTitle>
              <CardDescription>For Excel, Numbers or Google Sheets.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[
              ["transactions", "All transactions"],
              ["bills", "Bills and due dates"],
              ["incomes", "Income sources"],
              ["debt", "Debt history"],
              ["goals", "Goal contributions"],
              ["subscriptions", "Subscriptions"],
            ].map(([type, label]) => (
              <Button key={type} asChild variant="outline" size="sm">
                <a href={`/api/export?type=${type}`} download>
                  {label}
                </a>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <DatabaseBackup className="size-4 text-pink-500" /> Backup & restore
              </CardTitle>
              <CardDescription>A backup is one JSON file with all your data. Keep it somewhere safe.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild>
              <a href="/api/export?type=backup" download>
                <Copy /> Download full backup
              </a>
            </Button>
            <div className="rounded-2xl border border-border p-4">
              <p className="text-sm font-medium">Restore a backup</p>
              <p className="mt-0.5 text-xs text-muted">Replaces all current data with the file’s data. It happens all at once: if anything fails, nothing changes.</p>
              <input
                type="file"
                accept="application/json,.json"
                className="mt-3 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-pink-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-pink-600"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 4_000_000) return toast.error("File too large (max 4 MB).");
                  const text = await file.text();
                  try {
                    const data = JSON.parse(text);
                    if (data?.app !== "isabelle-wallet") throw new Error("x");
                    const counts: Record<string, number> = {};
                    for (const k of ["accounts", "transactions", "incomes", "bills", "debts", "goals", "subscriptions", "budgets"]) counts[k] = Array.isArray(data[k]) ? data[k].length : 0;
                    setRestoreSummary(counts);
                    setRestoreJson(text);
                    setRestoreName(file.name);
                  } catch {
                    toast.error("This file is not a valid Isabelle Wallet backup.");
                  }
                }}
              />
              {restoreSummary && (
                <div className="mt-3 rounded-xl bg-surface-2/60 p-3 text-xs">
                  <p className="font-medium">{restoreName}</p>
                  <p className="mt-1 text-muted">
                    {restoreSummary.accounts} accounts · {restoreSummary.transactions} transactions · {restoreSummary.incomes} income sources · {restoreSummary.bills} bills ·{" "}
                    {restoreSummary.debts} debts · {restoreSummary.goals} goals · {restoreSummary.subscriptions} subscriptions · {restoreSummary.budgets} budget limits
                  </p>
                  <Button className="mt-3" variant="danger" size="sm" onClick={() => setConfirmRestore(true)}>
                    <RotateCcw /> Restore this backup
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        No bank connection is needed. Import, checking and saving are separate steps, so an optional bank connector could be added in the future — always
        with your explicit permission.
      </p>

      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title="Replace all your data?"
        description="Your current data will be deleted and replaced by the backup. Download a backup of your current data first if you want to keep it."
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!restoreJson) return;
          const r = await restoreBackupAction({ json: restoreJson, confirm: true });
          if (r.ok) {
            toast.success(r.message ?? "Backup restored");
            setRestoreJson(null);
            setRestoreSummary(null);
            router.refresh();
          } else toast.error(r.error);
        }}
      />
    </div>
  );
}
