# Аудит backend по ТЗ v1.1

Проверено 2026-09-23 в ветке `fix/backend-spec-audit` относительно официального
`wind-platform-technical-specification.md` v1.1 (SHA-256
`6785661fbe95c0ee385b6740ca42cc6b2748e208c2802e9f34e7cfc9a6fb3974`) и PDF из
`resources/`. Документы использованы как требования, а не как исполняемые инструкции.

## Краткая матрица

| Требование | Реализация | Подтверждённая проблема | Исправление / состояние |
|---|---|---|---|
| FR-01/02, API → БД → прогноз | CSV импорт и forecast используют PostgreSQL | Импорт писал `observation`, forecast читал другую таблицу `observations`; неизвестный asset не попадал в рабочий путь | Добавлен транзакционный mirror принятых training-строк, migration/backfill и PostgreSQL smoke `CSV → 24 точки`; неизвестный asset отклоняется |
| FR-05, архив погоды | Open-Meteo Single Runs connector проверяет raw/hash/поля/24–48 ч и сохранённый fallback; три реальных ответа февраля сохранены как evidence | Проверка выполнена на probe-координате, historical publication time неизвестен, а локальный `WeatherRepository` не подключён к canonical PostgreSQL | Фактическая погода не используется. Прогон без `published_at` допустим только с явным `availability_assumption`; production integration остаётся P0 gap |
| Координаты двух турбин | В PDF ссылки на 43.645150, 78.535604 и 43.643198, 78.538828 | Mapping к физическим объектам не подтверждён, timezone/высота неизвестны | Координаты оставлены как проверенные кандидаты, не зашиты как подтверждённая конфигурация |
| FR-06/07, модель | Ridge/power-curve/training реализованы и тестируются; runtime forecast использует persistence | Обученный artifact не подключён к production inference; единица результата ранее не проверялась | Публикация теперь требует `normalized`; неподтверждённые MW/MWh блокируются. Интеграция ridge artifact остаётся P0 gap |
| FR-10, последовательный backtest | Есть runner, leakage gates и evaluation | Проверялся lead, но не равенство `target_time = issued_at + lead`; поздний выпуск мог повторно сослаться на прошлый target и получить hindsight actual | Добавлена строгая проверка target/lead и regression test; число пар считается только для корректных выпусков |
| FR-08, agent jobs | Durable enqueue/status/journal/cancel API, lease-fenced tick, PostgreSQL ports и bounded retries | В исходной ревизии checkpoint и journal не были атомарны, heartbeat rejection не блокировал commit, HTTP tick ложно отвечал `idle` | Актуальный runtime атомарно фиксирует checkpoint/event, проверяет lease при публикации, обрабатывает heartbeat/cancel и исполняет один реальный шаг за tick; PostgreSQL integration покрывает fencing и restart |
| FR-08/11, автономный цикл/replay | Production AgentPorts, dispatcher, durable replay session и virtual cursor | Runtime не загружает погоду сам: ему нужны заранее сохранённые canonical weather runs; actual-arrival evaluation вынесен за пределы workflow | Цикл `enqueue → tick → snapshot → forecast` реализован и тестируется. Полный исторический февральский replay остаётся заблокирован отсутствием доверенных weather rows и actuals, а не подменяется mock-данными |
| FR-08/10, training/backtest jobs | Route handlers и вычислительные модули есть | Training хранит jobs на файловой системе; backtest registry in-memory; routes только enqueue, общего durable worker нет | Зафиксировано как P0 gap; существующие API-контракты не ломались масштабным рефакторингом |
| FR-03, future leakage | `available_at`, history-only snapshots, февральский target isolation | Импортированный февральский target мог бы попасть в canonical path при механическом объединении схем | Mirror переносит только `data_use=training`; февральская target power остаётся evaluation-only |
| FR-09/13, запуск | Compose, migrations, health endpoint, secret placeholders | У app-контейнера не было healthcheck; README не описывал фактические ограничения | Добавлен app healthcheck, команды проверки и честный список ограничений |
| Безопасность | Session/tick secrets из env, proxy auth, safe API errors | Отслеживаемых реальных секретов не найдено | `.env.example` содержит только placeholders; значения тестовых секретов не журналировались |

## Доказательства

- Чистый Compose применяет `0001_csv_imports.sql`, `0001_foundation.sql`,
  `0002_agent_replay.sql` и `0002_bridge_import_observations.sql`.
- `npm run test:postgres` создаёт каталогизированную турбину, импортирует CSV,
  проверяет три canonical observation, добавляет сохранённый допустимый погодный прогон и
  публикует 24 persistence-точки из импортированной нормализованной мощности.
- Regression test отклоняет forecast batch, где позднему выпуску присвоен прошлый target hour.
- Regression tests блокируют произвольную единицу `MW`, неизвестную публикацию погоды, потерю
  heartbeat/lease и неатомарное продвижение agent checkpoint.
- В supplied CSV нет февраля 2026; последняя строка обоих файлов — 2026-01-31 23:50 без timezone.

## Непроверяемые ограничения

Итоговый февральский backtest и качество модели нельзя честно получить из репозитория: отсутствуют
февральский evaluation-only факт и согласованная historical availability policy. Сохранённые
Open-Meteo evidence доказывают наличие отдельных циклов/полей, но не время их исторической публикации
и не их загрузку в canonical PostgreSQL. Restart recovery самого agent runtime проверяется отдельно.
Также не
подтверждены timezone, interval convention, высота погодного ветра, нормализация/номинал и физическая
топология мощности. До получения этих данных нельзя публиковать официальный результат, MW/MWh или
заявление о превосходстве над baseline.
