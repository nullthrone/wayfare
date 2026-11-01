import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

/** Toggle switch built on a native checkbox (form-compatible: submits "on" when checked). */
export function Switch({
  label,
  description,
  className,
  id,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <label htmlFor={fid} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
      </label>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={fid} type="checkbox" role="switch" className="peer sr-only" {...rest} />
        <span
          aria-hidden
          className="pointer-events-none block h-6 w-11 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
}

export function Checkbox({
  label,
  className,
  id,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label htmlFor={fid} className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-ink", className)}>
      <input id={fid} type="checkbox" className="mt-0.5 size-4 rounded border-line-strong accent-accent" {...rest} />
      <span>{label}</span>
    </label>
  );
}
