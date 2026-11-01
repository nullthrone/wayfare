"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "../ui/cn";

export function SignOutButton({ children, className, redirectTo = "/" }: { children: ReactNode; className?: string; redirectTo?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      data-testid="sign-out"
      className={cn("disabled:opacity-60", className)}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        })
      }
    >
      {children}
    </button>
  );
}
