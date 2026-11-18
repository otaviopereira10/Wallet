"use client";

import { Info, MoreHorizontal, X } from "lucide-react";
import { AlertDialog, Dialog, DropdownMenu, Popover, Switch as RSwitch, Tabs as RTabs, Tooltip } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

// ---------------------------------------------------------------------------
// Dialog (bottom sheet on phones, centered card on larger screens)
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  trigger?: React.ReactNode;
}) {
  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-[#302630]/35 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "dialog-content fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border border-border bg-surface shadow-pop focus:outline-none",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
            widths[size],
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
            <div>
              <Dialog.Title className="font-display text-xl font-medium tracking-tight text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Form"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-5 pt-2 sm:px-6 sm:pb-6">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Confirmation before destructive actions
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  tone = "danger",
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  /** Return false to keep the dialog open. */
  onConfirm: () => Promise<unknown> | unknown;
  tone?: "danger" | "primary";
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <AlertDialog.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-[#302630]/35 backdrop-blur-[2px]" />
        <AlertDialog.Content className="dialog-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-surface p-6 shadow-pop">
          <AlertDialog.Title className="font-display text-xl font-medium text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted">{description}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await onConfirm();
                  if (result !== false) setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Row action menu
// ---------------------------------------------------------------------------
export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function ActionMenu({ items, label = "Actions" }: { items: Array<MenuItem | null | false>; label?: string }) {
  const list = items.filter(Boolean) as MenuItem[];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="fade-in z-50 min-w-48 rounded-2xl border border-border bg-surface p-1.5 shadow-pop"
        >
          {list.map((it) => (
            <DropdownMenu.Item
              key={it.label}
              disabled={it.disabled}
              onSelect={it.onSelect}
              className={cn(
                "flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4",
                it.danger ? "text-danger" : "text-ink",
              )}
            >
              {it.icon}
              {it.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export function Tabs({
  value,
  onValueChange,
  defaultValue,
  tabs,
  className,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  defaultValue?: string;
  tabs: Array<{ value: string; label: React.ReactNode; count?: number }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} defaultValue={defaultValue} className={className}>
      <RTabs.List className="scrollbar-thin mb-5 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted transition data-[state=active]:bg-pink-500 data-[state=active]:text-on-primary hover:text-ink data-[state=active]:hover:text-on-primary"
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-black/10 px-1.5 text-[11px] tabular">{t.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}
export const TabPanel = ({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) => (
  <RTabs.Content value={value} className={cn("fade-in focus:outline-none", className)}>
    {children}
  </RTabs.Content>
);

// ---------------------------------------------------------------------------
// Tooltip explaining financial terms
// ---------------------------------------------------------------------------
export function InfoTip({ children, label = "What does this mean?" }: { children: React.ReactNode; label?: string }) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Popover.Root>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <button type="button" aria-label={label} className="inline-grid size-4 place-items-center rounded-full text-muted transition hover:text-pink-500">
                <Info className="size-3.5" />
              </button>
            </Popover.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              sideOffset={6}
              className="fade-in z-50 max-w-72 rounded-xl bg-ink px-3 py-2 text-xs leading-relaxed text-bg shadow-pop"
            >
              {children}
              <Tooltip.Arrow className="fill-ink" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="fade-in z-50 max-w-72 rounded-xl bg-ink px-3 py-2 text-xs leading-relaxed text-bg shadow-pop sm:hidden"
          >
            {children}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Tooltip.Provider>
  );
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-6 w-11 shrink-0 rounded-full bg-border-strong transition data-[state=checked]:bg-pink-500 disabled:opacity-50"
    >
      <RSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[22px]" />
    </RSwitch.Root>
  );
}

export { Popover };
