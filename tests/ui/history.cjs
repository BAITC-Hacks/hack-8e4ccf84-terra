/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser QA, Playwright supplied by runner. */
const {selectScenario} = require('./browser-helpers.cjs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Own production server and ephemeral credentials; no dependency on local secrets or a real DB.
const port = process.env.HISTORY_UI_PORT || '3136';
const base = `http://localhost:${port}`;
const password = randomUUID();
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', port], {
  env: { ...process.env, ADMIN_USERNAME: 'history-qa', ADMIN_PASSWORD: password, SESSION_SECRET: randomUUID() },
  windowsHide: true, stdio: 'ignore',
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
async function count(locator, expected) {
  for (let i = 0; i < 100; i++) { if (await locator.count() === expected) return; await sleep(100); }
  assert.equal(await locator.count(), expected);
}
(async () => {
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/login')).ok) { ready = true; break; } } catch { /* Server is still starting. */ }
      await sleep(200);
    }
    assert.ok(ready, 'Isolated production server did not start');
    browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/history');
    assert.equal(new URL(page.url()).pathname, '/login');
    assert.equal((await page.request.post(base + '/api/auth/session', { data: { username: 'history-qa', password } })).status(), 200);
    await page.goto(base);
    await page.waitForURL('**/history');
    await page.locator('.launch-screen').waitFor({ state: 'hidden' });
    await visible(page.getByRole('heading', { name: 'История прогнозов', exact: true }));
    await visible(page.getByText('Дней с полным прогнозом: 29 из 29', { exact: true }));
    assert.equal(await page.getByLabel('Режим', { exact: true }).count(), 0);
    assert.equal(await page.locator('.history-days button').count(), 29);
    assert.equal(await page.getByRole('button', { name: 'Предыдущий день', exact: true }).isDisabled(), true);
    fs.mkdirSync('.next/ui-qa', { recursive: true });
    await page.screenshot({ path: '.next/ui-qa/history-desktop.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Таблица', exact: true }).click();
    await count(page.locator('tbody tr'), 48);
    const first = await page.locator('tbody tr').first().innerText();
    await page.getByRole('button', { name: 'Следующий день', exact: true }).click();
    assert.notEqual(await page.locator('tbody tr').first().innerText(), first);
    await page.getByLabel('Горизонт', { exact: true }).selectOption('24');
    await count(page.locator('tbody tr'), 24);
    const before = await page.locator('tbody tr').first().innerText();
    await page.getByLabel('Турбина', { exact: true }).selectOption('demo-turbine-2');
    await count(page.locator('tbody tr'), 24);
    assert.notEqual(await page.locator('tbody tr').first().innerText(), before);
    await page.getByLabel('Первый день (UTC)').fill('2026-02-28');
    assert.equal(await page.locator('.history-days button').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Следующий день', exact: true }).isDisabled(), true);
    await page.getByLabel('Последний день (UTC)').fill('2026-02-01');
    await visible(page.getByRole('alert').filter({ hasText: 'Выберите период' }));
    assert.equal(await page.locator('.history-days button').count(), 0);
    await page.getByLabel('Первый день (UTC)').fill('2026-01-31');
    await page.getByLabel('Последний день (UTC)').fill('2026-02-28');
    await selectScenario(page, 'partial');
    await visible(page.getByText('Доступно часов: 18 из 48. Пропуски не заменяются нулями.', { exact: true }));
    await selectScenario(page, 'empty');
    await visible(page.getByRole('heading', { name: 'Турбины ещё не добавлены' }));
    await selectScenario(page, 'error');
    await visible(page.getByRole('alert').filter({ hasText: 'Демонстрация ошибки' }));
    await selectScenario(page, 'ready');
    await visible(page.getByText('Дней с полным прогнозом: 29 из 29', { exact: true }));
    for (const [language, heading] of [['en', 'Forecast history'], ['kk', 'Болжамдар тарихы']]) {
      await page.locator('.language-control select').selectOption(language);
      await visible(page.getByRole('heading', { name: heading, exact: true }));
      await count(page.locator('.history-days button'), 29);
    }
    await page.locator('.language-control select').selectOption('ru');
    await visible(page.getByText('Дней с полным прогнозом: 29 из 29', { exact: true }));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout must not overflow');
    await page.screenshot({ path: '.next/ui-qa/history-mobile.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
    await page.screenshot({ path: '.next/ui-qa/history-dark.png', fullPage: true, animations: 'disabled' });

    let fail = false;
    await page.route('**/api/v1/assets', route => route.fulfill({ json: { assets: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'turbine', name: 'Saved turbine' }] } }));
    await page.route('**/api/v1/forecasts?**', route => {
      if (fail) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
      const replay = new URL(route.request().url()).searchParams.get('mode') === 'replay';
      return route.fulfill({ json: { forecasts: replay ? [] : [{ id: 'saved', version: 1, status: 'published',
        request: { assetIds: ['11111111-1111-4111-8111-111111111111'], issuedAt: '2026-01-31T00:00:00Z', horizonHours: 48, mode: 'backtest', modelVersionId: 'model' },
        inputSnapshotId: 'snapshot', snapshot: { weatherRunIds: ['weather'] },
        values: Array.from({ length: 48 }, (_, i) => ({ assetId: '11111111-1111-4111-8111-111111111111', targetTime: new Date(Date.parse('2026-01-31T00:00:00Z') + (i + 1) * 3600000).toISOString(), value: i / 100, unit: 'normalized' })) }] } });
    });
    await page.getByLabel('Данные', { exact: true }).selectOption('api');
    await visible(page.getByText('Дней с полным прогнозом: 1 из 29', { exact: true }));
    await page.getByRole('button', { name: 'Следующий день', exact: true }).click();
    await visible(page.getByRole('heading', { name: 'За этот день нет загруженного выпуска' }));
    fail = true;
    await page.getByRole('button', { name: 'Обновить выпуски' }).click();
    await visible(page.getByRole('alert').filter({ hasText: 'HTTP 503' }));
    await visible(page.getByText('Показаны ранее загруженные выпуски. Обновление не удалось.', { exact: true }));
    assert.equal(await page.getByText('Дней с полным прогнозом: 29 из 29', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS historical viewer: auth, default route, daily sequence, turbines, horizons, invalid range, gaps, resource states, RU/EN/KK, mobile/dark, canonical API mocks and refresh failure without demo fallback');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
