# Касымжан / S03 → Бибарыс / S01

Проверенная независимая часть S03 опубликована: `origin/feat/s03-weather-runs`,
implementation commit `7ba273ec803822a80c1f40cd8f002b711485941a`.
После обновления AGENTS.md/SLICES.md ветка перебазирована на `origin/main` `0d251d6`;
25 unit-тестов повторно PASS. Сквозная интеграция остаётся BLOCKED контрактным gate.

Нужен адаптер локального `WeatherRepository` из
`src/server/connectors/weather/types.ts` к каноническому S01 WeatherRun/WeatherRunReader.
Центральные типы, миграции, package.json и lockfile S03 не меняет.

- Атомарный `save`: raw (точные байты), SHA-256, source/model, координаты запроса,
  run initialization, nullable publication, available_at, downloaded_at, политика
  допущения (delay/rationale/approvalReference), URL и normalized hourly values/units.
- Идемпотентное сохранение по полному ключу источника/модели/точки/цикла/политики/хеша;
  другое содержимое — неизменяемая ревизия, старые raw не перезаписывать.
- `list_saved(config, asOf)`: кандидаты того же источника/модели/координат,
  available_at <= asOf с доступными raw. Не ограничивать единственным новым прогоном:
  он может быть неполным. S03 повторно проверит политику, хеш и каждый target hour.
- Зафиксировать convention T+1h…T+Nh (24/48), hour-aligned UTC; подтвердить координаты S00.
- Протестировать реальный PostgreSQL save/read, атомарность при ошибке и fallback
  после перезапуска. Сейчас repository в unit-тестах только in-memory.

Исторический publication time в API не обнаружен. Production delay требует отдельного
согласования с основанием; тестовые 12 ч не являются принятым допущением. Реальные
HTTP ответы и ограничения описаны в `docs/weather-verification.md`.

Команды: `node --test tests/weather/weather.test.mjs`, `npm run lint`,
`npm run build`, затем `npx tsc --noEmit`. Все PASS до обновления только repo-инструкций;
после rebase повторены 25 unit-тестов (PASS). Изменений прикладной базы при rebase нет.
