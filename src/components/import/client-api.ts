"use client";

import { useSyncExternalStore } from "react";

/** Thin fetch wrappers that return `{ ok, data | error }` where error is an i18n key (sources.errors.*). */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { credentials: "same-origin", ...init });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // empty / non-JSON body
    }
    if (!res.ok) {
      const key = json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string" ? (json as { error: string }).error : "internalError";
      return { ok: false, error: key, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "network", status: 0 };
  }
}

export const getJson = <T,>(url: string) => request<T>(url, { cache: "no-store" });

export const postJson = <T,>(url: string, body?: unknown) =>
  request<T>(url, {
    method: "POST",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

/** Strips the namespace prefix of `SourceInfo.labelKey` ("sources.googlePhotos" → "googlePhotos"). */
export const labelKeyOf = (labelKey: string) => labelKey.replace(/^sources\./, "");

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

/** Current `pathname + search` (hydration-safe; "/" during SSR). */
export function useRelativeLocation(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
    () => "/",
  );
}

/** Value of the `?source=` flag set by the OAuth callback redirect. */
export function sourceFlag(relativeLocation: string): "connected" | "error" | null {
  const v = new URLSearchParams(relativeLocation.split("?")[1] ?? "").get("source");
  return v === "connected" || v === "error" ? v : null;
}

export const connectHref = (sourceId: string, returnTo: string) => `/api/sources/${sourceId}/connect?returnTo=${encodeURIComponent(returnTo)}`;
