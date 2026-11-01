"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, type ButtonProps } from "./Button";

export function CopyButton({ value, label, ...rest }: Omit<ButtonProps, "onClick" | "children"> & { value: string; label?: string }) {
  const t = useTranslations("common");
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      {...rest}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard unavailable (insecure context) – ignore */
        }
      }}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{done ? t("copied") : (label ?? t("copy"))}</span>
    </Button>
  );
}
