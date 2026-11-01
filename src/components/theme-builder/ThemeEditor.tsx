"use client";

import { useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Plus, Save, Trash2, TriangleAlert, Upload, CircleCheck } from "lucide-react";
import { FONT_FAMILIES, FRAMES, OCCASIONS, PATTERNS, type Theme } from "@/domain/theme";
import { contrastIssues, contrastRatio } from "@/themes/contrast";
import { fontStack } from "@/themes/fonts";
import { parseThemeJson, serializeTheme, validateTheme } from "@/themes/validate";
import { saveThemeAction } from "@/app/dashboard/themes/actions";
import { ThemePreview } from "./ThemePreview";

type ColorKey = keyof Theme["colors"];
const COLOR_KEYS: ColorKey[] = ["background", "surface", "text", "muted", "accent", "accentContrast"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const ORNAMENT_SUGGESTIONS = ["", "🎂", "🎉", "💍", "🍼", "🎄", "🐣", "🎆", "✈️", "🌸", "🥂", "🎓", "💌", "🕯️", "📷", "🌿"];

const inputCls =
  "w-full rounded-lg border border-current/25 bg-transparent px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-current/60";
const btnCls =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-current/25 px-3 py-2 text-sm font-medium hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
const primaryCls =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-current/15 p-4 sm:p-5">
      <legend className="px-2 text-sm font-semibold">{title}</legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {hint ? <p className="text-xs opacity-70">{hint}</p> : null}
    </div>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const invalid = draft !== null && !HEX.test(draft);
  return (
    <div className="space-y-1">
      <label htmlFor={`${id}-hex`} className="block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={HEX.test(value) ? value.toLowerCase() : "#000000"}
          onChange={(e) => {
            setDraft(null);
            onChange(e.target.value);
          }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-current/25 bg-transparent p-1"
        />
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          spellCheck={false}
          maxLength={7}
          value={shown}
          aria-invalid={invalid}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setDraft(v);
            if (HEX.test(v)) onChange(v.toLowerCase());
          }}
          onBlur={() => setDraft(null)}
          className={`${inputCls} font-mono ${invalid ? "border-red-500" : ""}`}
        />
      </div>
    </div>
  );
}

export interface ThemeEditorProps {
  initial: Theme;
  locale: "de" | "en";
  /** True when creating a new theme (id is assigned by the server on first save). */
  isNew?: boolean;
}

export function ThemeEditor({ initial, locale, isNew = false }: ThemeEditorProps) {
  const t = useTranslations("themes");
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string; details?: string[] } | null>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Theme>) => setTheme((prev) => ({ ...prev, ...patch }));
  const setColor = (k: ColorKey, v: string) => setTheme((prev) => ({ ...prev, colors: { ...prev.colors, [k]: v } }));

  const issues = contrastIssues(theme.colors);
  const validation = validateTheme(theme);

  function updateReaction(i: number, patch: Partial<Theme["reactions"][number]>) {
    setTheme((prev) => ({ ...prev, reactions: prev.reactions.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }
  function updateReactionLabel(i: number, lang: "de" | "en", value: string) {
    setTheme((prev) => ({
      ...prev,
      reactions: prev.reactions.map((r, idx) => (idx === i ? { ...r, label: { ...r.label, [lang]: value } } : r)),
    }));
  }
  function addReaction() {
    setTheme((prev) => {
      if (prev.reactions.length >= 6) return prev;
      let n = prev.reactions.length + 1;
      while (prev.reactions.some((r) => r.key === `reaction-${n}`)) n++;
      return { ...prev, reactions: [...prev.reactions, { key: `reaction-${n}`, emoji: "👍", label: { de: "Neu", en: "New" } }] };
    });
  }
  function removeReaction(i: number) {
    setTheme((prev) => (prev.reactions.length <= 1 ? prev : { ...prev, reactions: prev.reactions.filter((_, idx) => idx !== i) }));
  }

  function errorText(code: string): string {
    return t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");
  }

  function save() {
    setStatus(null);
    const v = validateTheme(theme);
    if (!v.ok) {
      setStatus({ kind: "error", text: t("editor.invalid"), details: v.errors });
      return;
    }
    startTransition(async () => {
      const res = await saveThemeAction(v.theme);
      if (!res.ok) {
        setStatus({ kind: "error", text: errorText(res.error) });
        return;
      }
      setStatus({ kind: "ok", text: t("editor.saved") });
      if (isNew || res.data.id !== theme.id) router.replace(`/dashboard/themes/${res.data.id}`);
      else router.refresh();
    });
  }

  function exportJson() {
    const v = validateTheme(theme);
    if (!v.ok) {
      setStatus({ kind: "error", text: t("editor.invalid"), details: v.errors });
      return;
    }
    const blob = new Blob([serializeTheme(v.theme)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wayfare-theme-${(theme.name.en || "theme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStatus(null);
    if (file.size > 100_000) {
      setImportErrors([t("editor.importTooLarge")]);
      return;
    }
    const result = parseThemeJson(await file.text());
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportErrors(null);
    // keep this editor's identity, take everything else from the file
    setTheme({ ...result.theme, id: theme.id, baseThemeId: result.theme.baseThemeId ?? theme.baseThemeId });
    setStatus({ kind: "ok", text: t("editor.imported") });
  }

  const keyErrors = (key: string, idx: number) => {
    if (!/^[a-z0-9-]{1,24}$/.test(key)) return t("editor.keyInvalid");
    if (theme.reactions.some((r, i) => i !== idx && r.key === key)) return t("editor.keyDuplicate");
    return null;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="order-2 space-y-5 lg:order-1">
        <Section title={t("editor.sections.general")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("editor.nameDe")} htmlFor="theme-name-de">
              <input id="theme-name-de" className={inputCls} maxLength={60} value={theme.name.de} onChange={(e) => set({ name: { ...theme.name, de: e.target.value } })} />
            </Field>
            <Field label={t("editor.nameEn")} htmlFor="theme-name-en">
              <input id="theme-name-en" className={inputCls} maxLength={60} value={theme.name.en} onChange={(e) => set({ name: { ...theme.name, en: e.target.value } })} />
            </Field>
          </div>
          <Field label={t("editor.occasion")} htmlFor="theme-occasion">
            <select id="theme-occasion" className={inputCls} value={theme.occasion} onChange={(e) => set({ occasion: e.target.value as Theme["occasion"] })}>
              {OCCASIONS.map((o) => (
                <option key={o} value={o}>{t(`occasions.${o}`)}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title={t("editor.sections.colors")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_KEYS.map((k) => (
              <ColorField key={k} id={`theme-color-${k}`} label={t(`editor.colors.${k}`)} value={theme.colors[k]} onChange={(v) => setColor(k, v)} />
            ))}
          </div>
          <div aria-live="polite" className="space-y-1.5 text-sm">
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> {t("editor.contrastOk")}
              </p>
            ) : (
              issues.map((i) => (
                <p key={i.pair} className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-950">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{t(`editor.contrastWarning.${i.pair}`, { ratio: i.ratio.toFixed(1) })}</span>
                </p>
              ))
            )}
          </div>
        </Section>

        <Section title={t("editor.sections.fonts")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["heading", "body"] as const).map((which) => (
              <Field key={which} label={t(`editor.fonts.${which}`)} htmlFor={`theme-font-${which}`}>
                <select
                  id={`theme-font-${which}`}
                  className={inputCls}
                  style={{ fontFamily: fontStack(theme.fonts[which]) }}
                  value={theme.fonts[which]}
                  onChange={(e) => set({ fonts: { ...theme.fonts, [which]: e.target.value as Theme["fonts"]["heading"] } })}
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>
                  ))}
                </select>
                <p className="mt-1 truncate text-lg" style={{ fontFamily: fontStack(theme.fonts[which]) }}>
                  {t("editor.fontSample")}
                </p>
              </Field>
            ))}
          </div>
        </Section>

        <Section title={t("editor.sections.decoration")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("editor.pattern")} htmlFor="theme-pattern">
              <select id="theme-pattern" className={inputCls} value={theme.pattern.kind} onChange={(e) => set({ pattern: { ...theme.pattern, kind: e.target.value as Theme["pattern"]["kind"] } })}>
                {PATTERNS.map((p) => (
                  <option key={p} value={p}>{t(`patterns.${p}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("editor.patternOpacity", { value: Math.round(theme.pattern.opacity * 100) })} htmlFor="theme-pattern-opacity">
              <input
                id="theme-pattern-opacity"
                type="range"
                min={0}
                max={0.6}
                step={0.01}
                value={Math.min(theme.pattern.opacity, 0.6)}
                disabled={theme.pattern.kind === "none"}
                onChange={(e) => set({ pattern: { ...theme.pattern, opacity: Number(e.target.value) } })}
                className="h-10 w-full"
              />
            </Field>
            <Field label={t("editor.frame")} htmlFor="theme-frame">
              <select id="theme-frame" className={inputCls} value={theme.frame} onChange={(e) => set({ frame: e.target.value as Theme["frame"] })}>
                {FRAMES.map((f) => (
                  <option key={f} value={f}>{t(`frames.${f}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("editor.ornament")} htmlFor="theme-ornament" hint={t("editor.ornamentHint")}>
              <input id="theme-ornament" className={inputCls} maxLength={8} value={theme.ornament} onChange={(e) => set({ ornament: e.target.value })} />
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t("editor.ornamentSuggestions")}>
                {ORNAMENT_SUGGESTIONS.map((o) => (
                  <button
                    key={o || "none"}
                    type="button"
                    onClick={() => set({ ornament: o })}
                    aria-pressed={theme.ornament === o}
                    className={`min-h-9 min-w-9 rounded-lg border px-2 text-lg ${theme.ornament === o ? "border-current bg-current/15" : "border-current/20 hover:bg-current/10"}`}
                  >
                    {o || <span className="text-xs">{t("editor.noOrnament")}</span>}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Section>

        <Section title={t("editor.sections.reactions", { count: theme.reactions.length })}>
          <p className="text-xs opacity-70">{t("editor.reactionsHint")}</p>
          <ul className="space-y-3">
            {theme.reactions.map((r, i) => {
              const keyErr = keyErrors(r.key, i);
              return (
                <li key={i} className="rounded-xl border border-current/15 p-3">
                  <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[4.5rem_8rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Field label={t("editor.reactionEmoji")} htmlFor={`r-emoji-${i}`}>
                      <input id={`r-emoji-${i}`} className={`${inputCls} text-center text-lg`} maxLength={8} value={r.emoji} onChange={(e) => updateReaction(i, { emoji: e.target.value })} />
                    </Field>
                    <Field label={t("editor.reactionKey")} htmlFor={`r-key-${i}`}>
                      <input id={`r-key-${i}`} className={`${inputCls} font-mono ${keyErr ? "border-red-500" : ""}`} maxLength={24} aria-invalid={!!keyErr} value={r.key} onChange={(e) => updateReaction(i, { key: e.target.value.toLowerCase() })} />
                    </Field>
                    <Field label={t("editor.reactionLabelDe")} htmlFor={`r-de-${i}`}>
                      <input id={`r-de-${i}`} className={inputCls} maxLength={60} value={r.label.de} onChange={(e) => updateReactionLabel(i, "de", e.target.value)} />
                    </Field>
                    <Field label={t("editor.reactionLabelEn")} htmlFor={`r-en-${i}`}>
                      <input id={`r-en-${i}`} className={inputCls} maxLength={60} value={r.label.en} onChange={(e) => updateReactionLabel(i, "en", e.target.value)} />
                    </Field>
                    <button type="button" onClick={() => removeReaction(i)} disabled={theme.reactions.length <= 1} className={`${btnCls} col-span-2 sm:col-span-1`} aria-label={t("editor.removeReaction", { n: i + 1 })}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  {keyErr ? <p className="mt-1 text-xs text-red-600">{keyErr}</p> : null}
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={addReaction} disabled={theme.reactions.length >= 6} className={btnCls}>
            <Plus className="size-4" aria-hidden="true" /> {t("editor.addReaction")}
          </button>
        </Section>

        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-current/15 bg-white/90 p-3 backdrop-blur dark:bg-neutral-950/90">
          <button type="button" onClick={save} disabled={pending || !validation.ok} className={primaryCls}>
            <Save className="size-4" aria-hidden="true" /> {pending ? t("editor.saving") : t("editor.save")}
          </button>
          <button type="button" onClick={exportJson} className={btnCls}>
            <Download className="size-4" aria-hidden="true" /> {t("editor.exportJson")}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={btnCls}>
            <Upload className="size-4" aria-hidden="true" /> {t("editor.importJson")}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label={t("editor.importJson")} onChange={onImport} />
          <div aria-live="polite" className="min-w-0 flex-1 text-sm">
            {status ? (
              <div className={status.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-red-600"}>
                <p>{status.text}</p>
                {status.details?.length ? (
                  <ul className="list-disc pl-5 text-xs">
                    {status.details.slice(0, 6).map((d) => <li key={d}>{d}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {importErrors ? (
          <div role="alert" className="rounded-xl border border-red-500/60 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-semibold">{t("editor.importFailed")}</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {importErrors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      <aside className="order-1 lg:order-2">
        <div className="space-y-3 lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold">{t("editor.preview")}</h2>
          <ThemePreview
            theme={theme}
            locale={locale}
            title={t("editor.previewTitle")}
            greeting={t("editor.previewGreeting")}
            captions={[t("editor.previewCaption1"), t("editor.previewCaption2"), t("editor.previewCaption3")]}
          />
          <p className="text-xs opacity-70">
            {t("editor.contrastSummary", {
              text: contrastRatio(theme.colors.text, theme.colors.background).toFixed(1),
              accent: contrastRatio(theme.colors.accentContrast, theme.colors.accent).toFixed(1),
            })}
          </p>
        </div>
      </aside>
    </div>
  );
}
