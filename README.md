# TERRA — Agentic AI для прогнозирования выработки ВЭС

TERRA — прототип платформы, которая формирует почасовой прогноз нормализованной активной мощности ветроэлектростанции на горизонте 24 или 48 часов. Система объединяет исторические измерения, архивные прогнозы погоды, ML-модель и устойчивый агентный процесс с журналом решений, повторным запуском и защитой от утечки будущих данных.

Проект создан для кейса HackAlem AI. Краткое ТЗ находится в [docs/hackalem-ai-agentic-wind-forecasting.md](docs/hackalem-ai-agentic-wind-forecasting.md), оригинальный PDF и два набора данных — в [resources/](resources/).

> **Важно:** репозиторий содержит рабочий вертикальный срез и синтетический UI-режим для демонстрации. В исходных CSV нет фактической выработки за февраль 2026 года, а у погодных прогонов нет доказанного исторического времени публикации. Поэтому официальный февральский результат и превосходство модели над baseline пока воспроизвести нельзя.

## Содержание

- [Задача и подход](#задача-и-подход)
- [Что реализовано](#что-реализовано)
- [Как работает система](#как-работает-система)
- [Архитектура](#архитектура)
- [Быстрый запуск в Docker](#быстрый-запуск-в-docker)
- [Локальный запуск](#локальный-запуск)
- [Интерфейс](#интерфейс)
- [Основной сценарий через API](#основной-сценарий-через-api)
- [Входные данные](#входные-данные)
- [Agentic AI, replay и модель](#agentic-ai-replay-и-модель)
- [Проверки](#проверки)
- [Структура репозитория](#структура-репозитория)
- [Переменные окружения](#переменные-окружения)
- [Ограничения](#ограничения)
- [Дополнительная документация](#дополнительная-документация)

## Задача и подход

По условиям кейса требуется:

1. обучить модель на истории работы ВЭС с марта 2023 года по 31 января 2026 года;
2. получать для координат ВЭС прогноз погоды, который был доступен в момент выпуска;
3. каждый час формировать прогноз мощности на следующие 24–48 часов;
4. повторять цикл при появлении нового погодного прогона;
5. последовательно воспроизвести выпуски с 31 января по 28 февраля 2026 года без использования будущей информации;
6. сохранить происхождение данных, параметры, версии модели и журнал решений агента.

Ключевой принцип TERRA: **числовой прогноз вычисляется детерминированным кодом, LLM используется только для анализа и пояснения**. Отключение LLM не меняет прогнозные значения и не останавливает основной процесс.

## Что реализовано

| Возможность | Состояние | Что можно проверить |
|---|---|---|
| Защищённый dashboard | Реализовано | Вход администратора, «Обзор», «Прогноз», «Источники», «Журнал агента» |
| Демонстрационный UI | Реализовано | Сценарии: готово, частично, устарело, загрузка, пусто, ошибка |
| PostgreSQL и миграции | Реализовано | `npm run db:migrate`, автоматическая миграция в Docker |
| Импорт CSV | Реализовано | Предпросмотр, подтверждение mapping/времени/единиц, дедупликация, отчёт ошибок, SHA-256 raw-файла |
| Канонические наблюдения | Реализовано | Training-строки попадают в `observations`, evaluation-only данные изолированы |
| Снимок входов и прогноз | Реализовано | Проверка доступности данных, 24/48 точек, версии и CSV export |
| Baseline | Реализовано | Production persistence-модель использует последнее допустимое наблюдение |
| ML training | Частично | Ridge, power curve, временная валидация и artifacts есть; ridge ещё не подключён к production inference |
| Agent jobs | Реализовано | PostgreSQL queue, checkpoint, journal, lease/fencing, retry, cancel и restart recovery |
| Replay | Реализовано как runtime | Виртуальные часы и постановка agent jobs; нужны реальные архивные weather rows |
| Open-Meteo Single Runs | Проверен как коннектор | Проверка циклов/raw/hash и evidence; нет production-моста в canonical weather tables |
| Oracle / Siemens WinCC | Реализованы gateway-контракты | Test/discover/enable; промышленные секреты не попадают в браузер |
| Официальный февральский backtest | Заблокирован данными | Нет факта за февраль и доказанного `published_at` архивной погоды |

Проверенная матрица backend-требований: [docs/backend-spec-audit.md](docs/backend-spec-audit.md).

## Как работает система

1. Администратор регистрирует станцию, турбину или линию.
2. Загружает CSV и подтверждает столбцы, часовой пояс, смысл метки времени, задержку доступности и единицы.
3. Импорт сохраняет raw-файл и хеш, проверяет строки и создаёт канонические наблюдения.
4. Погодный коннектор должен сохранить архивный прогноз с `issued_at`, `published_at` либо явным допущением о доступности.
5. Агент фиксирует неизменяемый снимок входов и проверяет `available_at <= issued_at`.
6. Детерминированная модель формирует ровно 24 или 48 часовых точек либо возвращает явный неполный результат.
7. Прогноз сохраняется как новая версия, решения и ошибки — в журнале агента.
8. Новый допустимый погодный run запускает повторный расчёт. Идемпотентность не допускает двойную публикацию.
9. Replay последовательно воспроизводит исторические события с виртуальным временем.

Режимы работы:

| Режим | Назначение |
|---|---|
| `live` | Текущий оперативный прогноз |
| `backtest` | Историческая оценка последовательности прошлых выпусков |
| `replay` | Управляемая симуляция потока событий |

Интерфейс также разделяет два источника данных:

- **«Демонстрационные»** — синтетические fixtures для полного показа UX, но не доказательство качества модели;
- **«Настоящий API»** — `/api/v1` с защищённой сессией. Ошибка API не заменяется fixture-данными.

## Архитектура

```mermaid
flowchart LR
    CSV[CSV / Oracle / WinCC] --> INGEST[Импорт и качество]
    INGEST --> DB[(PostgreSQL)]
    WEATHER[Архивные прогнозы погоды] --> DB
    API[Next.js API] --> JOBS[Очередь задач]
    DISPATCHER[Job dispatcher] --> JOBS
    JOBS --> AGENT[Agent workflow]
    DB --> SNAPSHOT[Снимок available_at <= issued_at]
    SNAPSHOT --> AGENT
    AGENT --> MODEL[Persistence / модель]
    MODEL --> FORECAST[(Версии прогнозов)]
    AGENT --> JOURNAL[(Checkpoint и журнал)]
    FORECAST --> UI[Dashboard / CSV]
    JOURNAL --> UI
    LLM[OpenAI, опционально] -. пояснение .-> AGENT
```

Стек:

- Next.js 16, React 19, TypeScript;
- PostgreSQL 16;
- Drizzle ORM и SQL-репозитории;
- Zod для входных контрактов;
- `@openai/agents` для опционального reasoning-слоя;
- Docker Compose;
- Node test runner, `tsx`, ESLint и TypeScript.

Агент управляет процессом: выбирает допустимый weather run, проверяет входы, запускает расчёт, сохраняет checkpoint и объяснение. Временные границы, вычисления, авторизация, идемпотентность и публикация остаются в детерминированном коде.

## Быстрый запуск в Docker

### Требования

- Docker с Compose v2;
- свободный порт `3000` либо другой `APP_PORT`;
- ресурсы, достаточные для локальной сборки Next.js и PostgreSQL.

### 1. Настройте `.env`

Скопируйте `.env.example` в `.env` и замените все `replace-with-*`. Не коммитьте `.env`.

```dotenv
POSTGRES_PASSWORD=local-terra-db-password
ADMIN_PASSWORD=local-terra-admin-password
ADMIN_API_TOKEN=local-terra-api-token
SESSION_SECRET=local-session-secret-at-least-32-characters
JOB_TICK_SECRET=local-job-tick-secret
APP_PORT=3000
AGENT_LLM_ENABLED=false
```

`ADMIN_PASSWORD` в production должен содержать не менее 12 символов, `SESSION_SECRET` — не менее 32. Для production-подобной среды используйте случайные значения.

### 2. Соберите и запустите

```bash
docker compose up --build
```

Контейнер приложения перед стартом применит миграции. Проверьте здоровье:

```bash
curl http://localhost:3000/api/health
```

Ожидается:

```json
{"status":"ok","database":"ready"}
```

Откройте <http://localhost:3000> и войдите как `admin` с `ADMIN_PASSWORD`. Имя можно изменить через `ADMIN_USERNAME`.

### 3. Запустите dispatcher для agent jobs

`compose.yaml` пока запускает приложение и БД, но не отдельный dispatcher. Для `/api/v1/agent-runs` откройте второй терминал в локальном checkout с установленными зависимостями:

```powershell
$env:JOB_TICK_SECRET = "local-job-tick-secret"
$env:JOB_DISPATCHER_BASE_URL = "http://localhost:3000"
node scripts/job-dispatcher.mjs
```

Dashboard в fixture-режиме и синхронный `/api/v1/forecast-jobs` dispatcher не требуют.

Остановка без удаления данных:

```bash
docker compose down
```

Команда `docker compose down --volumes` дополнительно и необратимо удалит локальные тома PostgreSQL и артефактов.

## Локальный запуск

Рекомендуются Node.js 22 (та же версия используется в Docker), npm 10+ и PostgreSQL 16.

```bash
npm ci
```

Создайте пустую БД и задайте окружение. Пример PowerShell:

```powershell
$env:DATABASE_URL = "postgres://terra:password@localhost:5432/terra"
$env:ARTIFACT_ROOT = ".data/artifacts"
$env:ADMIN_PASSWORD = "local-terra-admin-password"
$env:ADMIN_API_TOKEN = "local-terra-api-token"
$env:SESSION_SECRET = "local-session-secret-at-least-32-characters"
$env:JOB_TICK_SECRET = "local-job-tick-secret"
$env:AGENT_LLM_ENABLED = "false"
npm run db:migrate
npm run dev
```

В отдельном терминале с теми же `DATABASE_URL` и `JOB_TICK_SECRET`:

```powershell
node scripts/job-dispatcher.mjs
```

Production-сборка:

```bash
npm run build
npm run start
```

## Интерфейс

После входа доступны:

- **Обзор** — состояние объекта, текущий прогноз и качество данных;
- **Прогноз** — почасовой график, версии, горизонт, actuals в backtest и экспорт;
- **Источники** — CSV, weather и industrial connections, импорт и отчёты;
- **Журнал агента** — шаги workflow, аргументация, длительность и ошибки.

В верхней панели выбираются источник данных, `live`/`backtest`/`replay`, часовой пояс, язык и тема. В fixture-режиме можно отдельно проверить loading/empty/error-состояния. Все синтетические данные явно помечены.

## Основной сценарий через API

Все `/api/v1/*` защищены cookie-сессией. Сначала выполните вход и сохраните cookie:

```bash
curl -c terra.cookies \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"local-terra-admin-password"}' \
  http://localhost:3000/api/auth/session
```

Далее передавайте `-b terra.cookies`.

### 1. Создать объект

```bash
curl -b terra.cookies \
  -H "Content-Type: application/json" \
  -d '{
    "kind":"turbine",
    "name":"Турбина 1",
    "latitude":43.645150,
    "longitude":78.535604,
    "time_zone":"Asia/Almaty",
    "power_unit":"normalized"
  }' \
  http://localhost:3000/api/v1/assets
```

Координаты взяты из ссылок ТЗ, однако их mapping и часовой пояс должен подтвердить владелец данных.

### 2. Импортировать CSV

`POST /api/v1/imports` принимает multipart-поля `file`, `config` (JSON) и необязательный `connectionId`. Сначала используйте `confirmed: false`, проверьте preview, затем повторите с `confirmed: true`.

```json
{
  "assetId": "<UUID объекта>",
  "dialect": {"encoding":"utf-8","delimiter":",","decimalSeparator":"."},
  "mapping": {
    "timestamp": "Статистическое время",
    "windSpeed": "Средняя скорость ветра(m/s)",
    "normalizedPower": "Нормализованная активная мощность",
    "ambientTemperature": "Средняя температура окружающей среды(°C)"
  },
  "time": {
    "format": "yyyy-MM-dd HH:mm:ss",
    "timeZone": "Asia/Almaty",
    "timestampMeaning": "interval_start",
    "sourceIntervalMinutes": 10,
    "availabilityLagMinutes": 10,
    "availabilityAssumption": "available after the source interval"
  },
  "units": {
    "windSpeed": "m/s",
    "normalizedPower": "normalized",
    "ambientTemperature": "degC"
  },
  "hourlyCoverageThreshold": 1,
  "confirmed": false
}
```

Отчёт: `GET /api/v1/imports/{id}`; CSV ошибок: `GET /api/v1/imports/{id}/errors`. Повторный импорт не должен удваивать наблюдения.

### 3. Запустить прогноз

```bash
curl -b terra.cookies \
  -H "Content-Type: application/json" \
  -d '{
    "asset_ids":["<UUID объекта>"],
    "issued_at":"2026-01-31T12:00:00Z",
    "horizon_hours":24,
    "mode":"backtest",
    "model_version":"baseline",
    "data_policy":"history_only"
  }' \
  http://localhost:3000/api/v1/forecast-jobs
```

`issued_at` должен быть ровно на границе часа. Production-путь публикует только `normalized`. При неполных входах API возвращает явный неполный результат, а не подмену.

Для durable workflow отправьте контракт в `POST /api/v1/agent-runs` с уникальным `Idempotency-Key`. Ответ `202` содержит `job_id`; статус доступен по `GET /api/v1/jobs/{id}`, журнал — `GET /api/v1/agent-runs/{id}`, отмена — `POST /api/v1/agent-runs/{id}/cancel`.

### Карта API

| Метод и путь | Назначение |
|---|---|
| `GET /api/health` | Готовность приложения и БД |
| `POST, DELETE /api/auth/session` | Вход и выход |
| `GET, POST /api/v1/assets` | Список и регистрация объектов |
| `GET, POST /api/v1/connections` | CSV connections и подтверждённые mappings |
| `POST /api/v1/connections/{id}/test` | Проверка sample-файла |
| `POST /api/v1/imports` | Preview или подтверждённый CSV import |
| `GET /api/v1/imports/{id}` | Статус и отчёт импорта |
| `POST /api/v1/training-jobs` | Создание training-задачи |
| `POST /api/v1/forecast-jobs` | Синхронный 24/48-часовой прогноз |
| `GET /api/v1/forecasts` | Поиск сохранённых прогнозов |
| `GET /api/v1/forecasts/{id}/export` | Воспроизводимый CSV export |
| `POST /api/v1/backtest-jobs` | Последовательный backtest |
| `GET /api/v1/evaluations/{id}` | MAE, RMSE, baseline, N, покрытие |
| `POST /api/v1/agent-runs` | Durable agent job |
| `GET /api/v1/jobs/{id}` | Статус и текущий шаг |
| `POST /api/v1/replay-sessions` | Создание replay session |
| `POST /api/v1/replay-sessions/{id}/advance` | Продвижение virtual time |
| `POST /api/v1/industrial-connectors/{oracle\|wincc}` | Test/discover/enable gateway |

## Входные данные

В `resources/` находятся два CSV. Несмотря на их имена, фактический диапазон обоих файлов:

- начало: `2023-03-11 00:00:00`;
- конец: `2026-01-31 23:50:00`;
- шаг: 10 минут;
- строк за февраль 2026: **0**.

| Исходный столбец | Смысл |
|---|---|
| `ID` | ID строки внутри файла |
| `Статистическое время` | Локальная метка без указанной зоны |
| `Средняя скорость ветра(m/s)` | Скорость ветра, м/с |
| `Нормализованная активная мощность` | Цель в исходной нормализованной шкале |
| `Средняя температура окружающей среды(°C)` | Температура, °C |

Владелец данных должен подтвердить часовой пояс, начало/конец 10-минутного интервала, задержку доступности, смысл двух рядов, формулу нормализации, номинал, mapping координат и высоту ветра.

TERRA не называет нормализованные значения МВт/МВт·ч и не объединяет два ряда без подтверждения. Подробнее: [docs/data-contract.md](docs/data-contract.md) и [docs/data-audit.md](docs/data-audit.md).

## Agentic AI, replay и модель

Agent job выполняется возобновляемыми шагами. Runtime:

- атомарно сохраняет checkpoint и событие журнала;
- использует lease и fencing token против устаревшей публикации;
- ограничивает turns, tool calls и время;
- поддерживает retry, cancel и heartbeat;
- маскирует секреты и не сохраняет `OPENAI_API_KEY` в payload;
- использует `Idempotency-Key` против повторной публикации.

Replay хранит виртуальное время и события погоды. `advance` разрешает только движение вперёд и транзакционно обновляет cursor вместе с постановкой jobs.

По умолчанию `AGENT_LLM_ENABLED=false`. Для пояснений:

```dotenv
AGENT_LLM_ENABLED=true
OPENAI_API_KEY=<ключ>
OPENAI_MODEL=<проверенная модель>
OPENAI_REASONING_EFFORT=medium
```

При выключенном LLM или временной ошибке детерминированные gates продолжают работать, журнал фиксирует fallback.

Репозиторий содержит persistence baseline, признаки, ridge, power curve, временную валидацию, artifacts и backtest с MAE/RMSE. Обязательные gates:

- только `available_at <= issued_at`;
- `target_time = issued_at + lead_hour`;
- февральские targets — только `evaluation_only`;
- мартовский хвост не входит в февральскую метрику;
- при `N = 0` метрика отсутствует, а не равна нулю;
- фактическая погода не заменяет архивный forecast;
- выбор модели по февральской метрике запрещён.

Сейчас production inference поддерживает persistence. Неподдерживаемый trained artifact завершается явной ошибкой.

## Проверки

Основной набор:

```bash
npm test
npm run test:foundation
npm run test:agent
npm run test:agent:replay
node --test tests/weather/weather.test.mjs
node --test tests/acceptance/harness.test.mjs
npm run lint
npm run typecheck
npm run build
docker compose config --quiet
docker compose build app
```

PostgreSQL integration требует отдельную одноразовую БД. Agent test намеренно отказывается от URL, имя БД которого не содержит `test`.

```powershell
$env:TEST_DATABASE_URL = "postgres://terra:password@localhost:5432/terra_test"
npm run test:postgres
npm run test:agent:integration
```

OpenAI smoke по умолчанию пропускается:

```powershell
$env:RUN_OPENAI_SMOKE = "1"
$env:OPENAI_API_KEY = "..."
$env:OPENAI_MODEL = "..."
npm run test:agent:openai
```

Acceptance harness:

```bash
node --test tests/acceptance/harness.test.mjs
node tests/acceptance/run.mjs verify
```

Harness проверяет fail-closed контракт `import/train/backtest/export/verify`. Пока `demo:*` scripts не интегрированы, `verify` ожидаемо завершается кодом 2. Это не ошибка harness и не подтверждение полного E2E.

## Структура репозитория

```text
app/                         Next.js App Router и HTTP routes
src/components/dashboard/    Dashboard, API client и fixtures
src/server/agent/             Production agent workflow и adapters
src/server/connectors/        CSV, Open-Meteo и industrial contracts
src/server/data/              Импорт, качество и snapshots
src/server/db/migrations/     SQL migrations
src/server/forecast/          Расчёт, публикация и хранилище прогнозов
src/server/jobs/              Durable jobs, lease, checkpoint и runner
src/server/ml/                Baseline, features, ridge и training
src/server/replay/            Виртуальные часы и replay sessions
src/server/backtest/          Backtest и leakage gates
tests/                        Unit, integration, UI и acceptance tests
scripts/                      Миграции и job dispatcher
resources/                    ТЗ и исходные CSV
docs/                         Контракты, аудиты и demo-инструкции
samples/                      Synthetic CC0 smoke fixture
```

В проекте временно есть `app/` и `src/app/`: корневой `app/` — фактический App Router, часть handlers делегирует реализацию модулям из `src/app/`.

## Переменные окружения

| Переменная | Обязательность | Назначение |
|---|---|---|
| `DATABASE_URL` | Да вне Compose | PostgreSQL URL |
| `POSTGRES_PASSWORD` | Для Compose | Пароль PostgreSQL |
| `ADMIN_USERNAME` | Нет | Login, по умолчанию `admin` |
| `ADMIN_PASSWORD` | Да | Пароль веб-сессии |
| `ADMIN_API_TOKEN` | Да | Внутренний token backtest/evaluation/export |
| `SESSION_SECRET` | Да | HMAC cookie secret, минимум 32 символа |
| `JOB_TICK_SECRET` | Для agent jobs | Защита internal tick |
| `ARTIFACT_ROOT` | Нет | Raw/artifacts, по умолчанию `.data/artifacts` |
| `IMPORT_BATCH_SIZE` | Нет | Batch импорта, по умолчанию 500 |
| `FORECAST_CONFIG_VERSION` | Нет | Forecast config, по умолчанию `baseline-v1` |
| `AGENT_LLM_ENABLED` | Нет | Включение LLM, по умолчанию `false` |
| `OPENAI_API_KEY` | При LLM | Ключ OpenAI, не сохраняется в jobs |
| `OPENAI_MODEL` | При LLM | Явно проверенная модель |
| `AGENT_MAX_TURNS` | Нет | Лимит turns, по умолчанию 8 |
| `AGENT_MAX_TOOL_EXECUTIONS` | Нет | Лимит tools, по умолчанию 16 |
| `AGENT_LLM_TIMEOUT_MS` | Нет | LLM timeout, по умолчанию 30000 |
| `AGENT_TOOL_TIMEOUT_MS` | Нет | Tool timeout, по умолчанию 45000 |
| `AGENT_TICK_BUDGET_MS` | Нет | Tick budget, по умолчанию 60000 |
| `AGENT_LEASE_MS` | Нет | Lease, по умолчанию 90000 |
| `AGENT_HEARTBEAT_MS` | Нет | Heartbeat, по умолчанию 15000 |
| `JOB_DISPATCHER_BASE_URL` | Нет | App URL, по умолчанию `http://localhost:3000` |
| `JOB_DISPATCHER_INTERVAL_MS` | Нет | Пауза ticks, по умолчанию 1000 |
| `ORACLE_CONNECTOR_GATEWAY_URL/TOKEN` | Для Oracle | URL и token server gateway |
| `WINCC_CONNECTOR_GATEWAY_URL/TOKEN` | Для WinCC | URL и token server gateway |

Базовый безопасный шаблон: [.env.example](.env.example).

## Ограничения

1. В CSV нет февральского факта, поэтому официальный MAE/RMSE за 1–28 февраля не вычисляется.
2. Open-Meteo evidence не доказывает исторический момент публикации weather run.
3. Weather connector ещё не пишет в production `weather_runs/weather_values`.
4. Production inference использует persistence; ridge artifact пока не подключён.
5. Training/backtest stores локальные/in-memory и не имеют гарантий durable agent queue.
6. Fixture UI полностью демонстрирует UX, но часть real-API ответов имеет envelope, ещё не согласованный с dashboard adapter.
7. Dispatcher не включён в Compose и запускается отдельным процессом.
8. Без подтверждения семантики нельзя переводить мощность в MW/MWh или суммировать два ряда.

Проект не маскирует эти ограничения синтетическими результатами и не подменяет архивный прогноз фактической погодой.

## Дополнительная документация

- [ТЗ кейса](docs/hackalem-ai-agentic-wind-forecasting.md)
- [Контракт данных](docs/data-contract.md)
- [Аудит CSV](docs/data-audit.md)
- [Аудит backend](docs/backend-spec-audit.md)
- [Weather verification](docs/weather-verification.md)
- [Agent runtime verification](docs/agent-runtime-verification.md)
- [Industrial connectors](docs/industrial-connectors.md)
- [Acceptance](docs/acceptance.md)
- [Demo](docs/demo.md)
- [Synthetic sample](samples/README.md)

## Дальнейшее развитие

TERRA уже даёт безопасный импорт, версионированные данные, 24/48-часовой contract, durable agent, replay и наблюдаемость. Следующий приоритет: подтвердить семантику источника, загрузить доказуемо доступные архивные weather runs в PostgreSQL, подключить ridge artifact к production inference и получить закрытые февральские targets только на этапе оценки.
