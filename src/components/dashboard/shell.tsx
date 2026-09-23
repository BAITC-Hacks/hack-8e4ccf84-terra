"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient, type DashboardClient } from "./client";
import type { Mode, Scenario, Transport } from "./contracts";
import { Icon, type IconName } from "../platform/icon";
import { PreferenceControls, usePreferences } from "../platform/preferences";

type Context = { transport: Transport; mode: Mode; timezone: string; scenario: Scenario; client: DashboardClient };
const DashboardContext = createContext<Context | null>(null);
export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("Dashboard context missing");
  return value;
}
const navigation: [string, string, IconName][] = [["/history", "Исторический прогон", "forecast"], ["/overview", "Обзор", "overview"], ["/forecast", "Прогноз", "forecast"], ["/sources", "Источники", "sources"], ["/agent-log", "Журнал агента", "activity"]];
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter(); const { t, locale } = usePreferences();
  const [transport, setTransport] = useState<Transport>("fixture");
  const [mode, setMode] = useState<Mode>("backtest");
  const [timezone, setTimezone] = useState("UTC");
  const [scenario, setScenario] = useState<Scenario>("ready");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false); const [sessionError, setSessionError] = useState("");
  const client = useMemo(() => createClient(transport, mode, scenario, locale), [transport, mode, scenario, locale]);
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const expired = () => router.replace(`/login?next=${encodeURIComponent(path)}`);
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        if (!mounted) return;
        if (response.status === 401 || response.status === 503) expired();
        else if (!response.ok) setSessionError("Не удаётся проверить сессию. Повторите попытку.");
        else setSessionError("");
      } catch { if (mounted) setSessionError("Нет соединения с сервером. Повторите попытку."); }
    };
    void check(); const interval = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check); window.addEventListener("terra:session-expired", expired);
    return () => { mounted = false; controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", check); window.removeEventListener("terra:session-expired", expired); };
  }, [path, router]);
  useEffect(() => {
    if (!menuOpen) return;
    const drawer = document.getElementById("main-navigation")!;
    const trigger = document.querySelector<HTMLButtonElement>(".mobile-menu");
    const controls = () => Array.from(drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    controls()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const desktop = window.matchMedia("(min-width: 901px)");
    const resize = () => { if (desktop.matches) setMenuOpen(false); };
    window.addEventListener("keydown", keyboard);
    desktop.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keyboard);
      desktop.removeEventListener("change", resize);
      trigger?.focus();
    };
  }, [menuOpen]);
  async function logout() {
    setLoggingOut(true); setSessionError("");
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error();
      router.replace("/login"); router.refresh();
    } catch { setSessionError("Не удалось завершить сеанс. Повторите попытку."); setLoggingOut(false); }
  }
  return <DashboardContext.Provider value={{ transport, mode, timezone, scenario, client }}>
    <a href="#main" className="skip-link" inert={menuOpen}>{t("К содержимому")}</a>
    <div className={`app-shell ${menuOpen ? "menu-open" : ""}`}>
      {menuOpen && <button className="sidebar-scrim" tabIndex={-1} aria-hidden="true" onClick={() => setMenuOpen(false)} />}
      <aside className="sidebar" id="main-navigation" role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen || undefined} aria-label={t("Главная навигация")}>
        <button className="icon-button sidebar-close" aria-label={t("Закрыть меню")} onClick={() => setMenuOpen(false)}><Icon name="close" size={18}/></button>
        <Link href="/history" className="brand"><span className="brand-symbol"><Icon name="wind" size={24} /></span><span>TERRA<span className="brand-caption">ENERGY INTELLIGENCE</span></span></Link>
        <div className="site-selector"><span className="site-avatar"><Icon name="wind" /></span><div><strong>{t("Ветроэнергетика")}</strong><small>{t("Рабочее пространство")}</small></div><span className="site-indicator" /></div>
        <div className="workspace-label">{t("ОПЕРАЦИОННЫЙ ЦЕНТР")}</div>
        <nav aria-label={t("Главная навигация")}>{navigation.map(([href, title, icon], index) => <Link key={href} href={href} className={path === href ? "active" : ""} aria-current={path === href ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon name={icon} size={19} /><span>{t(title)}</span><small aria-hidden="true">0{index + 1}</small></Link>)}</nav>
        <div className="sidebar-assurance"><Icon name="shield" size={22} /><strong>{t("Каждый прогноз проверяем")}</strong><p>{t("Источники, версии и решения агента всегда под рукой.")}</p></div>
        <div className="sidebar-bottom"><span className="avatar">AD</span><div><strong>{t("Администратор")}</strong><small>{t("Защищённая сессия")}</small></div><span className="live-dot" /></div>
      </aside>
      <div className="workspace" inert={menuOpen}>
        <header className="topbar"><div className="topbar-location"><button className="icon-button mobile-menu" aria-label={t(menuOpen ? "Закрыть меню" : "Открыть меню")} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button><span>{t("Операционный центр")}<span className="slash">/</span><strong>{t(navigation.find(([href]) => href === path)?.[1] ?? "Обзор")}</strong></span></div><div className="topbar-actions"><PreferenceControls /><span className="toolbar-divider" /><button className="logout-button" aria-label={t(loggingOut ? "Выходим…" : "Выйти")} onClick={logout} disabled={loggingOut}><Icon name="logout" size={17} /><span>{t(loggingOut ? "Выходим…" : "Выйти")}</span></button></div></header>
        <div className="environment-controls">
          <label>{t("Данные")}<select aria-label={t("Данные")} value={transport} onChange={e => setTransport(e.target.value as Transport)}><option value="fixture">{t("Демонстрационные")}</option><option value="api">{t("Настоящий API")}</option></select></label>
          {path !== "/history" && <label>{t("Режим")}<select aria-label={t("Режим")} value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="live">{t("Live · текущий прогноз")}</option><option value="backtest">{t("Backtest · оценка истории")}</option><option value="replay">{t("Replay · симуляция")}</option></select></label>}
          <label>{t("Часовой пояс")}<select aria-label={t("Часовой пояс")} value={timezone} onChange={e => setTimezone(e.target.value)}><option value="UTC">UTC</option><option value="Asia/Almaty">Asia/Almaty</option><option value="Asia/Qyzylorda">Asia/Qyzylorda</option></select></label>
          {transport === "fixture" && <label>{t("Сценарий UI")}<select aria-label={t("Сценарий UI")} value={scenario} onChange={e => setScenario(e.target.value as Scenario)}>{[["ready", "Готово"], ["partial", "Частичные данные"], ["stale", "Устарело"], ["loading", "Загрузка"], ["empty", "Пусто"], ["error", "Ошибка"]].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>}
          {path !== "/history" && <span className={`mode-pill ${mode}`}>{mode === "replay" ? t("СИМУЛЯЦИЯ · REPLAY") : mode.toUpperCase()}</span>}
        </div>
        <div className={`environment-banner ${transport === "api" ? "api" : ""}`} role="status"><Icon name={transport === "api" ? "shield" : "sources"} size={16} /><strong>{t(transport === "fixture" ? "Демонстрационные данные" : "Настоящий API /api/v1")}</strong><span>{t(transport === "fixture" ? "Синтетические примеры, не результаты работы ВЭС." : "Доступ определяется серверной сессией. Ошибки API не заменяются примерами.")}</span></div>
        {sessionError && <div role="alert" className="notice danger session-notice">{t(sessionError)}</div>}
        <main id="main" key={`${transport}-${mode}-${scenario}`}>{children}</main>
        <footer><span>TERRA <b>/</b> {t("Центр управления ветроэнергетикой")}</span><span>{t("Нормализованная мощность · исходная шкала")} <b>•</b> {timezone}</span></footer>
      </div>
    </div>
  </DashboardContext.Provider>;
}
