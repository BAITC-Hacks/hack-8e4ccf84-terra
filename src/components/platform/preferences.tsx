"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { formatDate, formatNumber, locales, translate, type Locale, type Theme } from "../../lib/i18n";
import { Icon } from "./icon";
import { WindScene } from "./wind-scene";

type Preferences = {
  locale: Locale; theme: Theme; setLocale: (value: Locale) => void; setTheme: (value: Theme) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dateLabel: (value: string, timezone: string) => string;
  numberLabel: (value: number | null | undefined, digits?: number) => string;
};
const Context = createContext<Preferences | null>(null);
export function usePreferences() { const context = useContext(Context); if (!context) throw new Error("Preferences provider missing"); return context; }
export function PreferencesProvider({ initialLocale, initialTheme, children }: { initialLocale: Locale; initialTheme: Theme; children: React.ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale); const [theme, updateTheme] = useState(initialTheme);
  const [launching, setLaunching] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setLaunching(false), 2000); return () => clearTimeout(timer); }, []);
  const value = useMemo<Preferences>(() => ({
    locale, theme,
    setLocale: next => { updateLocale(next); document.documentElement.lang = next; document.cookie = `terra_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`; },
    setTheme: next => { updateTheme(next); document.documentElement.dataset.theme = next; document.cookie = `terra_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`; },
    t: (key, params) => translate(locale, key, params),
    dateLabel: (date, zone) => formatDate(date, zone, locale),
    numberLabel: (number, digits) => formatNumber(number, locale, digits),
  }), [locale, theme]);
  useEffect(() => { document.title = translate(locale, "Terra — центр управления ветроэнергетикой"); }, [locale]);
  return <Context.Provider value={value}>{launching && <LaunchScreen onSkip={() => setLaunching(false)} />}<div className="platform-content" inert={launching}>{children}</div></Context.Provider>;
}
export function PreferenceControls() {
  const { locale, theme, setLocale, setTheme, t } = usePreferences();
  return <div className="preference-controls"><label className="language-control"><Icon name="globe" size={17} /><span className="sr-only">{t("Язык интерфейса")}</span><select aria-label={t("Язык интерфейса")} value={locale} onChange={e => setLocale(e.target.value as Locale)}>{Object.entries(locales).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><button type="button" className="icon-button theme-toggle" aria-label={t(theme === "light" ? "Включить тёмную тему" : "Включить светлую тему")} title={t(theme === "light" ? "Тёмная тема" : "Светлая тема")} onClick={() => setTheme(theme === "light" ? "dark" : "light")}><Icon name={theme === "light" ? "moon" : "sun"} /></button></div>;
}
function LaunchScreen({ onSkip }: { onSkip: () => void }) {
  const { t } = usePreferences();
  return <div className="launch-screen" role="status" aria-label={t("Запуск Terra")}><div className="launch-brand">TERRA<span>ENERGY INTELLIGENCE</span></div><WindScene compact /><div className="launch-caption">{t("Энергия начинается с ветра")}</div><div className="launch-progress" /><small>{t("Подготовка рабочего пространства")}</small><button className="launch-skip" type="button" onClick={onSkip}>{t("Пропустить")}</button></div>;
}
