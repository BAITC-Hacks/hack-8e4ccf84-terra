"use client";

import {useState} from "react";
import {usePreferences} from "../platform/preferences";
import type {DashboardClient} from "./client";
import type {Asset, IndustrialKind, IndustrialResponse, Transport} from "./contracts";

const definitions: Record<IndustrialKind, {
  title: string;
  eyebrow: string;
  description: string;
  resourceLabel: string;
  enableLabel: string;
  mappings: {key: string; label: string}[];
}> = {
  postgres: {
    title: "PostgreSQL / SCADA", eyebrow: "DATABASE / SCADA",
    description: "Проверка серверного шлюза, выбор таблицы и полей, привязка к турбине и запуск истории.",
    resourceLabel: "Таблица PostgreSQL", enableLabel: "Включить загрузку истории",
    mappings: [{key: "timestamp", label: "Поле времени"}, {key: "normalized_active_power", label: "Поле мощности"}],
  },
  oracle: {
    title: "Oracle · исторические данные",
    eyebrow: "КОННЕКТОР / ИСТОРИЧЕСКИЕ ДАННЫЕ",
    description: "Проверка серверного шлюза, выбор таблицы и полей, привязка к турбине и запуск истории.",
    resourceLabel: "Таблица Oracle",
    enableLabel: "Включить загрузку истории",
    mappings: [{key: "timestamp", label: "Поле времени"}, {key: "normalized_active_power", label: "Поле мощности"}],
  },
  wincc: {
    title: "Siemens WinCC · текущие данные",
    eyebrow: "КОННЕКТОР / ТЕКУЩИЕ ДАННЫЕ",
    description: "Проверка промышленного шлюза, выбор тегов, привязка к турбине и подписка на обновления.",
    resourceLabel: "Группа тегов WinCC",
    enableLabel: "Включить получение обновлений",
    mappings: [{key: "normalized_active_power", label: "Тег мощности"}, {key: "wind_speed", label: "Тег скорости ветра"}],
  },
};

function Setup({kind, client, assets, transport}: {kind: IndustrialKind; client: DashboardClient; assets: Asset[]; transport: Transport}) {
  const {t} = usePreferences();
  const definition = definitions[kind];
  const [access, setAccess] = useState<"unchecked" | "checking" | "healthy" | "error">("unchecked");
  const [resources, setResources] = useState<{name: string; fields: string[]}[]>([]);
  const [resource, setResource] = useState("");
  const [assetId, setAssetId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState<Extract<IndustrialResponse, {action: "enable"}>>();
  const selected = resources.find(item => item.name === resource);
  const currentAsset = assetId || assets[0]?.id || "";
  const fields = definition.mappings.map(item => mapping[item.key]).filter(Boolean);
  const canEnable = access === "healthy" && !!resource && !!currentAsset && fields.length === definition.mappings.length && new Set(fields).size === fields.length && fields.every(field => selected?.fields.includes(field));

  async function testAccess() {
    setAccess("checking"); setError(""); setEnabled(undefined); setResources([]); setResource(""); setMapping({});
    try {
      await client.industrial(kind, {action: "test"});
      const discovered = await client.industrial(kind, {action: "discover"});
      if (discovered.action !== "discover") throw new Error(t("Шлюз вернул неожиданный ответ."));
      setResources(discovered.resources); setResource(discovered.resources[0]?.name ?? ""); setAccess("healthy");
    } catch (failure) {
      setAccess("error"); setError(failure instanceof Error ? failure.message : t("Не удалось проверить доступ."));
    }
  }

  async function enable() {
    if (!canEnable || !selected) return;
    setBusy(true); setError("");
    try {
      const result = await client.industrial(kind, {action: "enable", assetId: currentAsset, resource: selected.name, fields, mapping});
      if (result.action !== "enable") throw new Error(t("Шлюз вернул неожиданный ответ."));
      setEnabled(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Не удалось включить коннектор."));
    } finally { setBusy(false); }
  }

  return <section id={`connector-${kind}`} className="panel industrial-connector" aria-labelledby={`${kind}-title`}>
    <div className="panel-heading"><div><div className="eyebrow">{t(definition.eyebrow)}</div><h2 id={`${kind}-title`}>{t(definition.title)}</h2><p>{t(definition.description)}</p></div><span className={`badge ${enabled ? "ready" : access === "error" ? "error" : access === "healthy" ? "ready" : "planned"}`}>{t(enabled ? "Включено" : access === "healthy" ? "Доступ подтверждён" : access === "checking" ? "Проверяем…" : access === "error" ? "Ошибка" : "Не проверено")}</span></div>
    {transport === "fixture" && <div className="notice neutral">{t("Демонстрационный шлюз: таблицы, теги и успешный запуск синтетические.")}</div>}
    <button type="button" onClick={testAccess} disabled={access === "checking" || busy}>{t(access === "checking" ? "Проверяем доступ…" : "Проверить доступ")}</button>
    {access === "healthy" && selected && <>
      <div className="form-grid">
        <label>{t(definition.resourceLabel)}<select disabled={busy} aria-label={t(definition.resourceLabel)} value={resource} onChange={event => { setResource(event.target.value); setMapping({}); setEnabled(undefined); }}>{resources.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
        <label>{t("Турбина")}<select disabled={busy} aria-label={`${t(definition.title)} · ${t("Турбина")}`} value={currentAsset} onChange={event => { setAssetId(event.target.value); setEnabled(undefined); }}>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      </div>
      <h3>{t("Сопоставление полей с турбиной")}</h3>
      <div className="mapping-grid">{definition.mappings.map(item => <label key={item.key}>{t(item.label)}<select disabled={busy} aria-label={`${t(definition.title)} · ${t(item.label)}`} value={mapping[item.key] ?? ""} onChange={event => { setMapping({...mapping, [item.key]: event.target.value}); setEnabled(undefined); }}><option value="">{t("Выберите поле или тег")}</option>{selected.fields.map(field => <option key={field} value={field}>{field}</option>)}</select></label>)}</div>
      <p className="muted">{t("Доступно:")} {selected.fields.join(" · ")}</p>
      <button type="button" className="primary" onClick={enable} disabled={!canEnable || busy}>{t(busy ? "Включаем…" : definition.enableLabel)}</button>
    </>}
    {error && <div className="notice danger" role="alert">{error}</div>}
    {enabled && <div className="notice success" role="status"><strong>{t("Шлюз принял настройку подключения")}</strong><span>{t("Турбина:")} {assets.find(asset => asset.id === currentAsset)?.name ?? currentAsset} · {t("источник:")} {resource}</span></div>}
  </section>;
}

export function IndustrialConnectors({client, assets, transport}: {client: DashboardClient; assets: Asset[]; transport: Transport}) {
  return <div className="industrial-grid"><Setup kind="postgres" client={client} assets={assets} transport={transport} /><Setup kind="oracle" client={client} assets={assets} transport={transport} /><Setup kind="wincc" client={client} assets={assets} transport={transport} /></div>;
}
