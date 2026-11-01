import type { Theme } from "@/domain/theme";
import { anniversary } from "./anniversary";
import { baby } from "./baby";
import { birthday } from "./birthday";
import { christmas } from "./christmas";
import { easter } from "./easter";
import { graduation } from "./graduation";
import { memorial } from "./memorial";
import { neutral } from "./neutral";
import { newYear } from "./new-year";
import { thankYou } from "./thank-you";
import { travel } from "./travel";
import { valentine } from "./valentine";
import { wedding } from "./wedding";

export const NEUTRAL_THEME_ID = "builtin:neutral";

/** All 13 built-in themes, one per occasion (neutral first, then the order of OCCASIONS). */
export const BUILTIN_THEMES: Theme[] = [
  neutral,
  birthday,
  wedding,
  baby,
  christmas,
  easter,
  newYear,
  travel,
  thankYou,
  anniversary,
  graduation,
  valentine,
  memorial,
];

const BY_ID = new Map(BUILTIN_THEMES.map((t) => [t.id, t]));

export function getBuiltinTheme(id: string): Theme | undefined {
  return BY_ID.get(id);
}

export function isBuiltinThemeId(id: string): boolean {
  return id.startsWith("builtin:");
}
