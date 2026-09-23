import { messages } from "./messages";
export type Locale = "ru" | "kk" | "en";
export type Theme = "light" | "dark";
export const locales: Record<Locale, string> = { ru: "Русский", kk: "Қазақша", en: "English" };
export function validLocale(value: string | undefined): Locale { return value === "kk" || value === "en" ? value : "ru"; }
export function validTheme(value: string | undefined): Theme { return value === "dark" ? "dark" : "light"; }
export function translate(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
  const catalog: Record<string, { en: string; kk: string }> = messages;
  const template = locale === "ru" ? key : catalog[key.trim()] ? `${key.match(/^\s*/)?.[0] ?? ""}${catalog[key.trim()][locale]}${key.match(/\s*$/)?.[0] ?? ""}` : key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] == null ? match : String(params[name]));
}
export function formatDate(value: string, timezone: string, locale: Locale) {
  const date = new Date(value);
  // Some Chromium ICU builds lack Kazakh month names and render "M01".
  if (locale === "kk") {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
    const months = ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."];
    return `${part("day")} ${months[Number(part("month")) - 1]}, ${part("hour")}:${part("minute")}`;
  }
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ru-RU", { timeZone: timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
export function formatNumber(value: number | null | undefined, locale: Locale, digits = 3) {
  return value == null ? translate(locale, "Нет данных") : new Intl.NumberFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-GB" : "ru-RU", { maximumFractionDigits: digits }).format(value);
}
