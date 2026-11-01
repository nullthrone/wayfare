"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { Alert } from "./Alert";
import { Button, type ButtonProps } from "./Button";
import { Dialog } from "./Dialog";
import { useToast } from "./Toast";

/** Structural twin of ActionResult from src/server/action-result.ts (kept client-safe). */
export type ActionResultLike<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Maps an error key from a server action to a user message.
 * Keys are looked up in the "errors" namespace first, then as a full "namespace.key" path
 * (e.g. "viewer.wrongPassword"), finally a generic message is shown.
 */
export function useErrorMessage() {
  const t = useTranslations();
  return useCallback(
    (key: string): string => {
      if (t.has(`errors.${key}`)) return t(`errors.${key}`);
      if (key.includes(".") && t.has(key)) return t(key);
      return t("common.genericError");
    },
    [t],
  );
}

const PendingCtx = createContext<boolean | null>(null);

/** Submit button that shows a spinner while the surrounding <ActionForm> (or a native form action) is pending. */
export function SubmitButton({ children, ...rest }: Omit<ButtonProps, "type">) {
  const ctx = useContext(PendingCtx);
  const status = useFormStatus();
  const pending = ctx ?? status.pending;
  return (
    <Button type="submit" loading={pending} {...rest}>
      {children}
    </Button>
  );
}

/**
 * Form wired to a server action. Does not use the native `action` attribute so that React 19
 * does not reset the fields after submit (important when the action returns a validation error).
 */
export function ActionForm<T = unknown>({
  action,
  children,
  className,
  successMessage,
  onSuccess,
  resetOnSuccess,
  toastOnSuccess,
  ...rest
}: {
  action: (formData: FormData) => Promise<ActionResultLike<T>>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  onSuccess?: (data: T) => void;
  resetOnSuccess?: boolean;
  /** Show success as toast instead of inline alert. */
  toastOnSuccess?: boolean;
  id?: string;
  "data-testid"?: string;
}) {
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState<ActionResultLike<T> | null, FormData>(async (_prev, fd) => action(fd), null);
  const [, startTransition] = useTransition();
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      if (toastOnSuccess && successMessage) toast.push("success", successMessage);
      onSuccess?.(state.data);
    }
  }, [state, resetOnSuccess, toastOnSuccess, successMessage, onSuccess, toast]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter as HTMLButtonElement | null);
    startTransition(() => dispatch(fd));
  };

  return (
    <PendingCtx.Provider value={pending}>
      <form ref={formRef} onSubmit={submit} className={className} {...rest}>
        {children}
        <div aria-live="polite" className="col-span-full empty:hidden">
          {state && !state.ok ? <Alert kind="error" className="mt-4">{errorMessage(state.error)}</Alert> : null}
          {state?.ok && successMessage && !toastOnSuccess ? <Alert kind="success" className="mt-4">{successMessage}</Alert> : null}
        </div>
      </form>
    </PendingCtx.Provider>
  );
}

/** Button that runs a server action (optionally behind a confirmation dialog); errors surface as toasts. */
export function ActionButton<T = unknown>({
  action,
  children,
  confirm,
  successMessage,
  onDone,
  ...rest
}: Omit<ButtonProps, "onClick" | "loading"> & {
  action: () => Promise<ActionResultLike<T>>;
  confirm?: { title: string; description?: ReactNode; confirmLabel: string; danger?: boolean };
  successMessage?: string;
  onDone?: (data: T) => void;
}) {
  const t = useTranslations("common");
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () => {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        if (successMessage) toast.push("success", successMessage);
        setOpen(false);
        onDone?.(res.data);
      } else {
        toast.push("error", errorMessage(res.error));
        setOpen(false);
      }
    });
  };

  return (
    <>
      <Button {...rest} loading={pending && !open} onClick={() => (confirm ? setOpen(true) : run())}>
        {children}
      </Button>
      {confirm ? (
        <Dialog
          open={open}
          onClose={() => !pending && setOpen(false)}
          title={confirm.title}
          description={confirm.description}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button variant={confirm.danger === false ? "primary" : "danger"} onClick={run} loading={pending} data-testid="confirm-action">
                {confirm.confirmLabel}
              </Button>
            </>
          }
        />
      ) : null}
    </>
  );
}
