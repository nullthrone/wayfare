"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, Shield, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { Role } from "@/domain/types";
import { SignOutButton } from "./SignOutButton";

function initials(name: string, email: string) {
  const src = (name || email).trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-deep";

export function UserMenu({ user }: { user: { name: string; email: string; role: Role } }) {
  const t = useTranslations("common");
  // Menu closes automatically on navigation: it is only "open" for the pathname it was opened on.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const open = openPath === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenPath((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canOwn = user.role === "owner" || user.role === "admin";

  return (
    <div ref={root} className="relative" data-testid="user-menu">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1 text-sm font-medium text-ink hover:bg-paper-deep"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink" aria-hidden>
          {initials(user.name, user.email)}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{user.name || user.email}</span>
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
        <span className="sr-only">{t("userMenu")}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{user.name || user.email}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          {canOwn ? (
            <Link role="menuitem" href="/dashboard" className={item}>
              <LayoutDashboard className="size-4 text-muted" aria-hidden /> {t("nav.dashboard")}
            </Link>
          ) : null}
          <Link role="menuitem" href="/account" className={item}>
            <UserRound className="size-4 text-muted" aria-hidden /> {t("nav.account")}
          </Link>
          {user.role === "admin" ? (
            <Link role="menuitem" href="/admin" className={item}>
              <Shield className="size-4 text-muted" aria-hidden /> {t("nav.admin")}
            </Link>
          ) : null}
          <div className="my-1 h-px bg-line" />
          <SignOutButton className={item}>
            <LogOut className="size-4 text-muted" aria-hidden /> {t("signOut")}
          </SignOutButton>
        </div>
      ) : null}
    </div>
  );
}
