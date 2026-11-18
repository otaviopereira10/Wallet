"use client";

import { Command } from "cmdk";
import { Bell, CheckCheck, LogOut, Menu, Monitor, Moon, Plus, Search, Settings, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, DropdownMenu, Popover } from "radix-ui";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AppNotification } from "@/lib/finance/analysis";
import type { Currency } from "@/lib/finance/types";
import { signOutAction } from "@/server/actions/auth";
import { globalSearch, type SearchHit } from "@/server/actions/search";
import { setTheme } from "@/server/actions/settings";
import { MOBILE_PRIMARY, NAV } from "./nav";
import { QuickAdd, type QuickBill } from "./quick-add";

export interface ShellProps {
  children: React.ReactNode;
  notifications: AppNotification[];
  openBills: QuickBill[];
  debts: Array<{ id: string; name: string; currency: Currency }>;
}

const DISMISS_KEY = "iw_dismissed_notifications";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function AppShell({ children, notifications, openBills, debts }: ShellProps) {
  const pathname = usePathname();
  const [quickOpen, setQuickOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    const onQuick = () => setQuickOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("iw:quick-add", onQuick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("iw:quick-add", onQuick);
    };
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface/70 backdrop-blur lg:flex">
        <div className="px-6 pb-4 pt-6">
          <Link href="/dashboard" aria-label="Isabelle Wallet — home">
            <Wordmark />
          </Link>
        </div>
        <div className="px-4">
          <Button className="w-full" onClick={() => setQuickOpen(true)}>
            <Plus /> Add money in or out
          </Button>
        </div>
        <nav className="scrollbar-thin mt-4 flex-1 overflow-y-auto px-3 pb-6" aria-label="Main navigation">
          {groups.map((g) => (
            <div key={g} className="mt-4 first:mt-1">
              <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted/80">{g}</p>
              {NAV.filter((n) => n.group === g).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition",
                    isActive(n.href) ? "bg-pink-50 text-pink-600" : "text-ink/75 hover:bg-surface-2 hover:text-ink",
                  )}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  title={n.hint}
                >
                  <n.icon className={cn("size-[18px] transition", isActive(n.href) ? "text-pink-500" : "text-muted group-hover:text-ink")} />
                  {n.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <Topbar onSearch={() => setSearchOpen(true)} onQuickAdd={() => setQuickOpen(true)} notifications={notifications} />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {MOBILE_PRIMARY.slice(0, 2).map((href) => (
            <MobileLink key={href} href={href} active={isActive(href)} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              aria-label="Add money in or out"
              className="-mt-5 grid size-14 place-items-center rounded-full bg-pink-500 text-on-primary shadow-[0_10px_24px_-8px_var(--c-pink-500)] transition active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </div>
          <MobileLink href={MOBILE_PRIMARY[2]} active={isActive(MOBILE_PRIMARY[2])} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted"
          >
            <Menu className="size-5" />
            More
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} isActive={isActive} />
      <QuickAdd open={quickOpen} onOpenChange={setQuickOpen} openBills={openBills} debts={debts} />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function MobileLink({ href, active }: { href: string; active: boolean }) {
  const item = NAV.find((n) => n.href === href)!;
  const short: Record<string, string> = { "/dashboard": "Home", "/expenses": "Expenses", "/bills": "Bills" };
  return (
    <Link href={href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-pink-600" : "text-muted")}>
      <item.icon className="size-5" />
      {short[href] ?? item.label}
    </Link>
  );
}

function MoreSheet({ open, onOpenChange, isActive }: { open: boolean; onOpenChange: (o: boolean) => void; isActive: (h: string) => boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-[#302630]/35 backdrop-blur-[2px]" />
        <Dialog.Content className="dialog-content fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-display text-xl">Menu</Dialog.Title>
            <Dialog.Description className="sr-only">All Isabelle Wallet pages</Dialog.Description>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-[11.5px] font-medium leading-tight",
                  isActive(n.href) ? "border-pink-300 bg-pink-50 text-pink-600" : "border-border text-ink",
                )}
              >
                <n.icon className="size-5 text-pink-500" />
                {n.label}
              </Link>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Topbar({ onSearch, onQuickAdd, notifications }: { onSearch: () => void; onQuickAdd: () => void; notifications: AppNotification[] }) {
  const app = useApp();
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-2 px-4 sm:px-6 lg:px-10">
        <Link href="/dashboard" className="lg:hidden" aria-label="Home">
          <Wordmark className="[&_svg]:size-8" />
        </Link>
        <button
          type="button"
          onClick={onSearch}
          className="ml-auto flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm text-muted transition hover:border-border-strong sm:w-72 lg:ml-0"
          aria-label="Search"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="ml-auto hidden rounded-md border border-border px-1.5 text-[10px] font-semibold sm:inline">Ctrl K</kbd>
        </button>
        <div className="flex items-center gap-1 lg:ml-auto">
          <Button size="sm" className="hidden sm:inline-flex lg:hidden" onClick={onQuickAdd}>
            <Plus /> Add
          </Button>
          <ThemeToggle />
          <Notifications items={notifications} />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="ml-1 grid size-9 place-items-center rounded-full bg-gradient-to-br from-pink-300 to-pink-500 text-sm font-semibold text-white"
                aria-label="Account menu"
              >
                {(app.displayName ?? app.email ?? "I").slice(0, 1).toUpperCase()}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} className="fade-in z-50 w-60 rounded-2xl border border-border bg-surface p-1.5 shadow-pop">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{app.displayName ?? "My account"}</p>
                  <p className="truncate text-xs text-muted">{app.email}</p>
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item asChild>
                  <Link href="/settings" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
                    <Settings className="size-4" /> Settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => void signOutAction()}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-bg"
                >
                  <LogOut className="size-4" /> Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const app = useApp();
  const [theme, setLocal] = React.useState(app.theme);
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const apply = (t: typeof theme) => {
    const resolved = t === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
    document.documentElement.setAttribute("data-theme", resolved);
    document.cookie = `iw_theme=${t}; path=/; max-age=31536000; samesite=lax`;
  };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = { light: "Light theme", dark: "Dark theme", system: "Device theme" }[theme];
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${label} — switch`}
      title={label}
      onClick={() => {
        setLocal(next);
        apply(next);
        void setTheme({ theme: next });
      }}
    >
      <Icon />
    </Button>
  );
}

function Notifications({ items }: { items: AppNotification[] }) {
  const [dismissed, setDismissed] = React.useState<string[]>([]);
  React.useEffect(() => {
    setDismissed(readDismissed());
  }, []);
  const visible = items.filter((n) => !dismissed.includes(n.id));
  const dismiss = (ids: string[]) => {
    const next = [...new Set([...dismissed, ...ids])].slice(-300);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  const tone = { danger: "bg-danger", warning: "bg-warning", info: "bg-info", positive: "bg-success" };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${visible.length})`} className="relative">
          <Bell />
          {visible.length > 0 && (
            <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-pink-500 px-1 text-[10px] font-bold leading-4 text-white">
              {visible.length > 9 ? "9+" : visible.length}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="fade-in z-50 w-[min(92vw,380px)] rounded-2xl border border-border bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {visible.length > 0 && (
              <button type="button" className="flex items-center gap-1 text-xs font-medium text-pink-600" onClick={() => dismiss(visible.map((v) => v.id))}>
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto p-2">
            {visible.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">All caught up ✨</p>
            ) : (
              visible.map((n) => (
                <div key={n.id} className="group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone[n.tone])} />
                  <Link href={n.href} className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    <p className="text-xs text-muted">{n.detail}</p>
                  </Link>
                  <button type="button" aria-label="Dismiss" className="text-muted opacity-60 hover:opacity-100" onClick={() => dismiss([n.id])}>
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
    }
  }, [open]);
  React.useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setHits(await globalSearch(q));
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const pages = NAV.filter((n) => !q || norm(`${n.label} ${n.hint} ${n.keywords ?? ""}`).includes(norm(q)));
  const groups = [...new Set(hits.map((h) => h.group))];
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search"
      shouldFilter={false}
      overlayClassName="dialog-overlay fixed inset-0 z-50 bg-[#302630]/35 backdrop-blur-[2px]"
      contentClassName="dialog-content fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl border border-border bg-surface shadow-pop"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-4 text-muted" />
        <Command.Input
          value={q}
          onValueChange={setQ}
          placeholder="Search pages, expenses, bills, goals…"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
      </div>
      <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted">{loading ? "Searching…" : "Nothing found."}</Command.Empty>
        {pages.length > 0 && (
          <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted">
            {pages.map((n) => (
              <Command.Item
                key={n.href}
                value={`page:${n.href}`}
                onSelect={() => go(n.href)}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm data-[selected=true]:bg-pink-50 data-[selected=true]:text-pink-600"
              >
                <n.icon className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block">{n.label}</span>
                  <span className="block truncate text-xs text-muted">{n.hint}</span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {groups.map((g) => (
          <Command.Group
            key={g}
            heading={g}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted"
          >
            {hits
              .filter((h) => h.group === g)
              .map((h) => (
                <Command.Item
                  key={`${g}-${h.id}`}
                  value={`${g}-${h.id}`}
                  onSelect={() => go(h.href)}
                  className="flex cursor-pointer flex-col rounded-xl px-3 py-2 data-[selected=true]:bg-pink-50"
                >
                  <span className="text-sm font-medium text-ink">{h.title}</span>
                  <span className="text-xs text-muted">{h.subtitle}</span>
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
