"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { WindScene } from "./wind-scene";
import { PreferenceControls, usePreferences } from "./preferences";

export function Login({ returnTo, initialUsername }: { returnTo: string; initialUsername: string }) {
  const { t } = usePreferences(); const router = useRouter();
  const [username, setUsername] = useState(initialUsername); const [password, setPassword] = useState(""); const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        setPassword("");
        setError(response.status === 401 ? "Неверный пароль. Попробуйте ещё раз." : response.status === 503 ? "Вход ещё не настроен. Обратитесь к администратору." : "Не удалось выполнить вход. Попробуйте ещё раз.");
        return;
      }
      setPassword(""); router.replace(returnTo); router.refresh();
    } catch { setError("Нет соединения с сервером. Повторите попытку."); } finally { setBusy(false); }
  }
  return <div className="login-page">
    <header className="login-header"><a href="/login" className="brand"><span className="brand-symbol"><Icon name="wind" size={25} /></span><span>TERRA<span className="brand-caption">ENERGY INTELLIGENCE</span></span></a><PreferenceControls /></header>
    <main className="login-main">
      <section className="login-story"><h1>{t("Прогноз выработки ВЭС")}</h1><p>{t("Почасовой прогноз на 24–48 часов на основе погоды и данных турбин.")}</p><WindScene /></section>
      <section className="login-card"><div className="login-lock"><Icon name="lock" size={24} /></div><h2>{t("Вход в систему")}</h2><form onSubmit={submit}><label htmlFor="username">{t("Учётная запись")}<input id="username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required disabled={busy} /></label><label htmlFor="password">{t("Пароль администратора")}</label><div className="password-field"><input id="password" type={visible ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} placeholder={t("Введите пароль")} aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined} /><button type="button" aria-label={t(visible ? "Скрыть пароль" : "Показать пароль")} onClick={() => setVisible(!visible)}><Icon name="eye" size={18} /></button></div>{error && <div id="login-error" className="notice danger" role="alert">{t(error)}</div>}<button className="primary login-submit" disabled={busy || !username || !password}>{busy ? <><span className="spinner" />{t("Проверяем доступ…")}</> : <>{t("Войти")}<Icon name="arrow" size={18} /></>}</button></form><p className="login-help">{t("Нет доступа? Обратитесь к администратору.")}</p></section>
    </main><footer className="login-footer"><span>© 2026 Terra</span></footer>
  </div>;
}
