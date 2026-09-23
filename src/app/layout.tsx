import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { PreferencesProvider } from "../components/platform/preferences";
import { validLocale, validTheme } from "../lib/i18n";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-noto-sans",
  fallback: ["Segoe UI", "Arial", "sans-serif"],
});

export const metadata: Metadata = { title: "Terra — прогноз выработки ВЭС", description: "Прогноз, источники данных и журнал агента" };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const saved = await cookies();
  const locale = validLocale(saved.get("terra_locale")?.value);
  const theme = validTheme(saved.get("terra_theme")?.value);
  return <html lang={locale} data-theme={theme} className={notoSans.variable}><body><PreferencesProvider initialLocale={locale} initialTheme={theme}>{children}</PreferencesProvider></body></html>;
}
