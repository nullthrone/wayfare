import { cn } from "../ui/cn";

/** Wayfare mark: a tiny postcard with a stamp. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden fill="none">
      <rect x="2" y="6" width="28" height="20" rx="4" fill="currentColor" />
      <rect x="19" y="10" width="7" height="8" rx="1.2" fill="#faf7f2" />
      <path d="M6 20h9M6 15h9" stroke="#faf7f2" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
