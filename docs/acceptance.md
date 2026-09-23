# P7 — финальная приёмка, 2026-09-23

База проверки: локальный main `18b8a28`. **Общий результат BLOCKED; P7 не завершён.** P1–P6 интегрированы, но прохождение component suites не равно единому E2E. Старый отчёт S09 о пустом starter больше не актуален.

## Synthetic integration

Подключены пять `demo:*` команд к существующему acceptance harness. Запуск на отдельном PostgreSQL 16 в Docker, миграции и повтор миграций; каждая группа получает собственную БД. Полный вывод и JSON: `.data/acceptance/`. Документирован [чистый и повторный запуск](demo.md).

- PASS: canonical CSV import → persisted 24-hour forecast; повтор импорта внутри suite.
- PASS: training/approved inference component group (13 tests).
- FAIL: weather ingestion PostgreSQL suite: `tests/weather/ingestion.test.ts:118` ожидает 48 значений, canonical adapter возвращает 192 (несколько метрик). Проверку нельзя считать пройденной; требуется согласовать контракт и assertion.
- PASS: evaluation/export group — 11 tests; restart/replay group; миграции и повтор миграций.
- FAIL: trigger integration subtest `contract adapter pins revisions; existing runner publishes once per effective input`; затем suite не завершилась за 45 секунд, дерево процессов остановлено на 60 секундах. Replay manifest и synchronous/durable runtime subtests прошли.
- Итог `npm run demo:verify`: synthetic FAIL, E2E BLOCKED, historical BLOCKED, exit 1. Журналы: `.data/acceptance/{import,backtest,export,restart-replay}.log`.
- BLOCKED: одна общая цепочка import → weather → train/approve → automatic trigger → new version → replay → evaluation/export с общими IDs.
- BLOCKED: живые HTTP/UI ответы, реальный process-kill/restart всей системы и полный manifest реальных выпусков. Component tests восстановления не заменяют этот эксперимент.

## Official historical run

**BLOCKED**, независимо от synthetic результата:

1. Нет доказанного исторического publication provenance погодных прогонов.
2. В resource CSV отсутствует февральский факт для оценки.
3. Нет переданных подтверждений времени, координат и нормализации владельцем данных.
4. Не проверен полный manifest реальных выпусков и воспроизводимые экспорт/метрики.

`historical.json` всегда отделён от synthetic отчёта; текущий runner не сертифицирует официальный PASS. Synthetic fixtures не доказывают доступность внешних данных или превосходство модели.

## Автоматические проверки

- PASS: `npm test`: 79 passed, 4 PostgreSQL skipped (в общем запуске без test URL).
- PASS: acceptance harness и demo safety: 4 tests.
- PASS: foundation: 4; agent: 12; replay: 1; weather contract: 25.
- PASS: `npm run typecheck`, `npm run lint`, `npm run build` после удаления идентичного дублирующего ключа перевода, уже присутствовавшего в базе.
- Lint исключает только `.worktrees/**`; ошибки приложения не скрываются.
- Build предупреждает о dynamic filesystem tracing в approved-inference; не исправлялось в P7.
- PASS: `docker compose config --quiet` с явными disposable-параметрами; без них Compose корректно отказался из-за отсутствующего POSTGRES_PASSWORD.
- Fetch: BLOCKED, `Repository not found`. `STATE.md` отсутствует после предшествующего удаления; не восстановлен.

Следующий шаг: согласовать сломанные интеграционные проверки и выполнить общую цепочку с артефактами, затем HTTP/browser и исторический запуск после предоставления данных. До этого общий PASS запрещён.
