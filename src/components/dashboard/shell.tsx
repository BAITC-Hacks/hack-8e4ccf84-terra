"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { createClient, type DashboardClient } from "./client";
import type { Mode, Scenario, Transport } from "./contracts";

type Context = { transport: Transport; mode: Mode; timezone: string; scenario: Scenario; client: DashboardClient };
const DashboardContext = createContext<Context | null>(null);
export function useDashboard() { const value = useContext(DashboardContext); if (!value) throw new Error("Dashboard context missing"); return value; }
const navigation = [["/overview", "Обзор", "◫"], ["/forecast", "Прогноз", "↗"], ["/sources", "Источники", "▤"], ["/agent-log", "Журнал агента", "≋"]];
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [transport, setTransport] = useState<Transport>("fixture");
  const [mode, setMode] = useState<Mode>("backtest");
  const [timezone, setTimezone] = useState("UTC");
  const [scenario, setScenario] = useState<Scenario>("ready");
  const client = useMemo(() => createClient(transport, mode, scenario), [transport, mode, scenario]);
  return <DashboardContext.Provider value={{ transport, mode, timezone, scenario, client }}>
    <a href="#main" className="skip-link">К содержимому</a>
    <div className="app-shell">
      <aside className="sidebar"><Link href="/overview" className="brand"><span className="brand-mark">✳</span> terra<span className="brand-dot">.</span></Link>
        <div className="workspace-label">ЭНЕРГИЯ ВЕТРА</div>
        <nav aria-label="Главная навигация">{navigation.map(([href, title, icon]) => <Link key={href} href={href} className={path === href ? "active" : ""} aria-current={path === href ? "page" : undefined}><span aria-hidden>{icon}</span>{title}{path === href && <i />}</Link>)}</nav>
        <div className="sidebar-bottom"><span className="live-dot" /> Прогнозирование ВЭС<p>Почасовой горизонт · 24–48 ч</p><div className="avatar">T</div><span>Рабочее пространство<br /><small>Terra / HackAlem</small></span></div>
      </aside>
      <div className="workspace"><header className="topbar"><span>Рабочее пространство <span className="slash">/</span> <strong>{navigation.find(([href]) => href === path)?.[1]}</strong></span><span className="topbar-note">Ветер в данных. Ясность в решениях.</span></header>
        <div className="environment-controls">
          <label>Данные<select aria-label="Данные" value={transport} onChange={e => setTransport(e.target.value as Transport)}><option value="fixture">Демонстрационные</option><option value="api">Настоящий API</option></select></label>
          <label>Режим<select aria-label="Режим" value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="live">Live · текущий прогноз</option><option value="backtest">Backtest · оценка истории</option><option value="replay">Replay · симуляция</option></select></label>
          <label>Часовой пояс<select aria-label="Часовой пояс" value={timezone} onChange={e => setTimezone(e.target.value)}><option value="UTC">UTC</option><option value="Asia/Almaty">Asia/Almaty</option><option value="Asia/Qyzylorda">Asia/Qyzylorda</option></select></label>
          {transport === "fixture" && <label>Сценарий UI<select aria-label="Сценарий UI" value={scenario} onChange={e => setScenario(e.target.value as Scenario)}><option value="ready">Готово</option><option value="partial">Частичные данные</option><option value="stale">Устарело</option><option value="loading">Загрузка</option><option value="empty">Пусто</option><option value="error">Ошибка</option></select></label>}
        </div>
        <div className={`environment-banner ${transport === "api" ? "api" : ""}`} role="status"><span className="live-dot" /><strong>{transport === "fixture" ? "Демонстрационные данные" : "Настоящий API /api/v1"}</strong><span>{transport === "fixture" ? "Синтетические примеры, не результаты работы ВЭС." : "Доступ определяется серверной сессией. Ошибки API не заменяются примерами."}</span><b>{mode === "replay" ? "СИМУЛЯЦИЯ · REPLAY" : mode.toUpperCase()}</b></div>
        <main id="main" key={`${transport}-${mode}-${scenario}`}>{children}</main>
        <footer>Terra · прогнозирование выработки <span>Нормализованная мощность · исходная шкала, не МВт · время: {timezone}</span></footer>
      </div>
    </div>
  </DashboardContext.Provider>;
}
