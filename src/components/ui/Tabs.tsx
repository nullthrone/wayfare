import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem {
  key: string;
  label: ReactNode;
  href: string;
  /** Small counter bubble (e.g. pending items). Hidden when 0/undefined. */
  count?: number;
}

/** Link-based tabs (server-rendered, state lives in the URL). */
export function Tabs({ items, active, label, className }: { items: TabItem[]; active: string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                data-testid={`tab-${it.key}`}
                className={cn(
                  "relative -mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {it.label}
                {it.count ? (
                  <span className="rounded-full bg-accent px-1.5 text-[11px] leading-5 font-semibold text-accent-ink">{it.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
