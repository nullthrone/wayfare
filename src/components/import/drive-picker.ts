"use client";

/**
 * Lazy loader + wrapper for the Google Picker (Drive). The third-party script is only requested
 * when the owner clicks "Google Drive" (GDPR: no third-party requests otherwise).
 */

const SCRIPT_URL = "https://apis.google.com/js/api.js";

interface PickerView {
  setMimeTypes?(types: string): PickerView;
  setIncludeFolders?(include: boolean): PickerView;
}
interface PickerInstance {
  setVisible(visible: boolean): void;
  dispose?(): void;
}
interface PickerBuilder {
  enableFeature(feature: unknown): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setLocale?(locale: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  setCallback(cb: (data: Record<string, unknown>) => void): PickerBuilder;
  build(): PickerInstance;
}
interface GooglePickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView?: new (viewId: unknown) => PickerView;
  View: new (viewId: unknown) => PickerView;
  ViewId: { DOCS_IMAGES?: unknown; DOCS: unknown };
  Feature: { MULTISELECT_ENABLED: unknown };
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string };
}
interface GapiGlobal {
  load(api: string, options: { callback: () => void; onerror: () => void; timeout?: number; ontimeout?: () => void }): void;
}
type PickerWindow = Window & { gapi?: GapiGlobal; google?: { picker?: GooglePickerNamespace } };

export interface DrivePickerConfig {
  apiKey: string;
  appId: string;
  accessToken: string;
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  const w = window as PickerWindow;
  if (w.gapi) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = SCRIPT_URL;
      el.async = true;
      el.referrerPolicy = "strict-origin-when-cross-origin";
      el.onload = () => resolve();
      el.onerror = () => {
        el.remove();
        reject(new Error("script"));
      };
      document.head.appendChild(el);
    }).catch((e) => {
      scriptPromise = null; // allow retry
      throw e;
    });
  }
  return scriptPromise;
}

function loadPickerModule(): Promise<GooglePickerNamespace> {
  return loadScript().then(
    () =>
      new Promise<GooglePickerNamespace>((resolve, reject) => {
        const w = window as PickerWindow;
        if (!w.gapi) return reject(new Error("gapi"));
        w.gapi.load("picker", {
          callback: () => (w.google?.picker ? resolve(w.google.picker) : reject(new Error("picker"))),
          onerror: () => reject(new Error("picker")),
          timeout: 15_000,
          ontimeout: () => reject(new Error("picker")),
        });
      }),
  );
}

/**
 * Opens the Drive image picker. Resolves with the picked file ids, or null if the user cancelled.
 * Rejects if the script could not be loaded.
 */
export async function openDrivePicker(cfg: DrivePickerConfig, locale?: string): Promise<string[] | null> {
  const picker = await loadPickerModule();
  let view: PickerView;
  if (picker.DocsView && picker.ViewId.DOCS_IMAGES) {
    view = new picker.DocsView(picker.ViewId.DOCS_IMAGES);
  } else {
    const generic = new picker.View(picker.ViewId.DOCS);
    generic.setMimeTypes?.("image/jpeg,image/png,image/webp,image/heic");
    view = generic;
  }
  return new Promise<string[] | null>((resolve) => {
    let instance: PickerInstance | null = null;
    const builder = new picker.PickerBuilder()
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setOAuthToken(cfg.accessToken)
      .addView(view)
      .setCallback((data) => {
        const action = data[picker.Response.ACTION];
        if (action === picker.Action.PICKED) {
          const docs = (data[picker.Response.DOCUMENTS] as Record<string, unknown>[] | undefined) ?? [];
          const ids = docs.map((d) => d[picker.Document.ID]).filter((id): id is string => typeof id === "string");
          resolve(ids);
          instance?.dispose?.();
        } else if (action === picker.Action.CANCEL) {
          resolve(null);
          instance?.dispose?.();
        }
      });
    if (locale) builder.setLocale?.(locale);
    instance = builder.build();
    instance.setVisible(true);
  });
}
