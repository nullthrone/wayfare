import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

export type AlertKind = "error" | "success" | "info" | "warning";
const styles: Record<AlertKind, { box: string; Icon: typeof Info }> = {
  error: { box: "border-danger/30 bg-danger-soft text-danger", Icon: XCircle },
  success: { box: "border-success/30 bg-success-soft text-success", Icon: CheckCircle2 },
  info: { box: "border-accent/25 bg-accent-soft text-accent", Icon: Info },
  warning: { box: "border-warn/30 bg-warn-soft text-warn", Icon: AlertTriangle },
};

export function Alert({ kind = "info", title, children, className, ...rest }: { kind?: AlertKind; title?: ReactNode; children?: ReactNode; className?: string; "data-testid"?: string }) {
  const { box, Icon } = styles[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", box, className)} {...rest}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink/85">{children}</div> : null}
      </div>
    </div>
  );
}
