"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { AppleIcon, DiscordIcon, FacebookIcon, GoogleIcon } from "./BrandIcons";

type Social = "google" | "apple" | "facebook" | "discord";
export interface LoginMethods {
  social: Social[];
  magicLink: boolean;
  passkey: boolean;
  emailPassword: boolean;
}

const ICONS: Record<Social, typeof GoogleIcon> = { google: GoogleIcon, apple: AppleIcon, facebook: FacebookIcon, discord: DiscordIcon };
const NAMES: Record<Social, string> = { google: "Google", apple: "Apple", facebook: "Facebook", discord: "Discord" };

export function LoginForm({ methods, callbackURL }: { methods: LoginMethods; callbackURL: string }) {
  const t = useTranslations("account.login");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const done = () => {
    router.push(callbackURL);
    router.refresh();
  };
  const fail = (msg?: string) => setError(msg || t("failed"));

  const hasAny = methods.social.length > 0 || methods.magicLink || methods.passkey || methods.emailPassword;
  const hasForms = methods.magicLink || methods.emailPassword;

  if (sentTo) {
    return (
      <div className="space-y-5 text-center" data-testid="login-sent">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-semibold">{t("sent.title")}</h2>
          <p className="mt-2 text-sm text-muted">{t("sent.description", { email: sentTo })}</p>
        </div>
        <Button variant="ghost" onClick={() => setSentTo(null)}>
          {t("sent.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="login-form">
      {!hasAny ? <Alert kind="warning">{t("noMethods")}</Alert> : null}

      {methods.social.length > 0 ? (
        <div className="space-y-2.5">
          {methods.social.map((p) => {
            const Icon = ICONS[p];
            return (
              <Button
                key={p}
                variant="outline"
                size="lg"
                className="w-full"
                data-testid={`login-${p}`}
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const res = await authClient.signIn.social({ provider: p, callbackURL });
                    if (res?.error) fail(res.error.message);
                  });
                }}
              >
                <Icon aria-hidden />
                {t("continueWith", { provider: NAMES[p] })}
              </Button>
            );
          })}
        </div>
      ) : null}

      {methods.passkey ? (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          data-testid="login-passkey"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await authClient.signIn.passkey();
              if (res?.error) fail(res.error.message);
              else done();
            });
          }}
        >
          <KeyRound className="size-5" aria-hidden />
          {t("passkey")}
        </Button>
      ) : null}

      {(methods.social.length > 0 || methods.passkey) && hasForms ? (
        <div className="flex items-center gap-3 text-xs tracking-wide text-muted uppercase">
          <span className="h-px flex-1 bg-line" />
          {t("or")}
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}

      {methods.magicLink ? (
        <form
          className="space-y-3"
          data-testid="login-magic-link"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
            if (!email) return;
            start(async () => {
              const res = await authClient.signIn.magicLink({ email, callbackURL });
              if (res?.error) fail(res.error.message);
              else setSentTo(email);
            });
          }}
        >
          <Input name="email" type="email" label={t("email")} autoComplete="email webauthn" required placeholder={t("emailPlaceholder")} />
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            <Mail className="size-4" aria-hidden />
            {t("sendLink")}
          </Button>
          <p className="text-xs text-muted">{t("magicHint")}</p>
        </form>
      ) : null}

      {methods.emailPassword ? (
        <form
          className="space-y-3 border-t border-line pt-6"
          data-testid="login-password"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            const email = String(fd.get("email") ?? "").trim();
            const password = String(fd.get("password") ?? "");
            const name = String(fd.get("name") ?? "").trim();
            start(async () => {
              const res =
                mode === "signin"
                  ? await authClient.signIn.email({ email, password })
                  : await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
              if (res?.error) fail(res.error.message);
              else done();
            });
          }}
        >
          <h2 className="text-sm font-semibold">{mode === "signin" ? t("password.signinTitle") : t("password.signupTitle")}</h2>
          {mode === "signup" ? <Input name="name" label={t("password.name")} autoComplete="name" required /> : null}
          <Input name="email" type="email" label={t("email")} autoComplete="email" required />
          <Input
            name="password"
            type="password"
            label={t("password.password")}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            {mode === "signin" ? t("password.signin") : t("password.signup")}
          </Button>
          <button type="button" className="text-sm text-accent underline-offset-4 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? t("password.toSignup") : t("password.toSignin")}
          </button>
        </form>
      ) : null}

      {error ? <Alert kind="error">{error}</Alert> : null}
      <p className="text-center text-xs text-muted">{t("legalNote")}</p>
    </div>
  );
}
