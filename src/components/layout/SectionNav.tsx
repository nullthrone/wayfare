"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export interface SectionNavItem {
  href: string;
  label: ReactNode;
  /** Active when pathname starts with this prefix (default: href). `exact` for index routes. */
  exact?: boolean;
  testId?: string;
}

/** Secondary navigation bar (dashboard / admin). */
export function SectionNav({ items, label }: { items: SectionNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="border-b border-line bg-surface/60">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                data-testid={it.testId}
                className={cn(
                  "relative inline-flex h-12 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
