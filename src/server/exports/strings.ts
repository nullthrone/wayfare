import de from "../../../messages/de/share.json";
import en from "../../../messages/en/share.json";

export interface ExportStrings {
  scanMe: string;
  scanHint: string;
  scanMeSmall: string;
  passwordHint: string;
  defaultTitle: string;
  openAlbum: string;
}

/** Fixed export strings from messages/<locale>/share.json (imported directly, no next-intl). */
export function exportStrings(locale: "de" | "en"): ExportStrings {
  return (locale === "de" ? de : en).exports;
}
