# P7: воспроизводимый запуск приёмки

Команды `demo:import`, `demo:train`, `demo:backtest`, `demo:export` запускают соответствующие component integration suites, а не создают связанную цепочку пользовательских артефактов. `demo:verify` запускает все группы. Общая E2E приёмка остаётся BLOCKED до проверки общей цепочки и HTTP/UI на реальных ответах.

## Чистая disposable PostgreSQL

Требуются Docker, Node и установленные зависимости (`npm ci`). Используйте новый контейнер и отдельный свободный порт; не указывайте рабочую БД. Пароль ниже применяется только к локальной одноразовой тестовой БД.

```powershell
docker run --detach --name terra-p7-test -e POSTGRES_PASSWORD=p7-disposable-local -e POSTGRES_DB=terra_p7_test -p 127.0.0.1:55437:5432 postgres:16-alpine
$env:DEMO_DISPOSABLE = '1'
$env:DEMO_TEST_DATABASE_URL = 'postgres://postgres:p7-disposable-local@127.0.0.1:55437/terra_p7_test'
npm run demo:verify
```

Дождитесь готовности PostgreSQL (`docker exec terra-p7-test pg_isready -U postgres`). Runner требует локальный hostname и `test` в имени БД, применяет миграции дважды. Каждая группа получает новую отдельную базу. Weather/restart suites создают таблицы сами; остальные получают мигрированную схему. Базы сохраняются для анализа. Agent suite не выполняется на общей БД. Это изоляция component suites, а не доказательство идемпотентности единой цепочки.

Повторите `npm run demo:verify` с теми же переменными. Команды не удаляют контейнеры/тома. Запуск без opt-in заканчивается BLOCKED до подключения к БД. PostgreSQL-пользователь должен иметь CREATEDB. Проверки ограничены 60 секундами на группу; timeout считается FAIL.

## Результаты

`.data/acceptance/verify.json` — synthetic component integration, команды, длительности, exit codes; соседние `.log` содержат вывод. `historical.json` — независимый официальный отчёт BLOCKED с отсутствующими данными. `DEMO_REPORT_DIR` позволяет сохранить каждый запуск отдельно. Файлы не коммитятся.

Коды: 0 — выбранная component group прошла; 1 — ошибка suite; 2 — BLOCKED (включая общий verify даже при успешном synthetic); 64 — неизвестная команда. Synthetic PASS не снимает historical/E2E BLOCKED.

Следующий этап: одна цепочка import → canonical weather → approved training → automatic trigger → forecast → new inputs/new version → replay manifest → evaluation/export с общими IDs; затем HTTP/browser, реальный рестарт процессов и сравнение артефактов повторного запуска. Существующие unit/integration проверки этих компонентов не заменяют такой запуск.
