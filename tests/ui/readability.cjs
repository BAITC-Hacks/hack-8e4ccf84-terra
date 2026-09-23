/* eslint-disable @typescript-eslint/no-require-imports -- Playwright is supplied by the UI test runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const base = process.env.UI_BASE_URL || 'http://localhost:3107';
const locales = ['ru', 'kk', 'en'];
const themes = ['light', 'dark'];
const viewports = [{ name: 'wide', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }];
const routes = ['/overview', '/forecast', '/sources', '/agent-log'];

function contrastAudit() {
  const parse = value => {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 1 : Number(match[4])] : null;
  };
  const luminance = ([r, g, b]) => {
    const linear = value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; };
    return .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
  };
  const background = element => {
    for (let current = element; current; current = current.parentElement) {
      const color = parse(getComputedStyle(current).backgroundColor);
      if (color && color[3] === 1) return color;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const selectors = 'h1,h2,h3,p,label,button,a,select,input,th,td,caption,small,.badge,.notice,.mode-pill,.eyebrow,.workspace-label';
  const failures = [];
  for (const element of document.querySelectorAll(selectors)) {
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility !== 'visible' || style.display === 'none') continue;
    const text = element instanceof HTMLInputElement ? (element.value || element.placeholder) : element.innerText;
    if (!text?.trim()) continue;
    const foreground = parse(style.color); const backdrop = background(element);
    if (!foreground || !backdrop || foreground[3] !== 1) continue;
    const bright = Math.max(luminance(foreground), luminance(backdrop));
    const dark = Math.min(luminance(foreground), luminance(backdrop));
    const ratio = (bright + .05) / (dark + .05);
    const size = Number.parseFloat(style.fontSize); const weight = Number.parseInt(style.fontWeight, 10) || 400;
    const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    if (ratio + .01 < threshold) failures.push({ element: element.tagName, className: element.className, text: text.trim().slice(0, 70), ratio: ratio.toFixed(2), threshold });
  }
  return failures;
}

function layoutAudit() {
  const clipped = [];
  for (const element of document.querySelectorAll('h1,h2,h3,p,label,button,a,select,th,td,caption,small,.badge,.notice,.mode-pill,.eyebrow')) {
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility !== 'visible' || style.display === 'none') continue;
    if ((style.overflowX === 'hidden' || style.overflowX === 'clip') && element.scrollWidth > element.clientWidth + 1) clipped.push({ element: element.tagName, text: element.textContent?.trim().slice(0, 70), axis: 'x' });
    if ((style.overflowY === 'hidden' || style.overflowY === 'clip') && element.scrollHeight > element.clientHeight + 1) clipped.push({ element: element.tagName, text: element.textContent?.trim().slice(0, 70), axis: 'y' });
    if (element instanceof HTMLSelectElement) {
      const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
      context.font = style.font; const option = element.selectedOptions[0]?.text ?? '';
      const chrome = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight) + 12;
      if (context.measureText(option).width + chrome > element.clientWidth + 1) clipped.push({ element: element.tagName, text: option, axis: 'selected-value' });
    }
  }
  return { overflow: document.documentElement.scrollWidth - window.innerWidth, clipped };
}

(async () => {
  assert.ok(process.env.ADMIN_PASSWORD, 'Set ADMIN_PASSWORD for the test server');
  const browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_CHANNEL ? { channel: process.env.UI_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const output = path.join('.next', 'ui-qa', 'readability'); fs.mkdirSync(output, { recursive: true });
  try {
    assert.equal((await context.request.post(base + '/api/auth/session', { data: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD } })).status(), 200);
    await page.goto(base + '/overview'); await page.locator('.launch-screen').waitFor({ state: 'hidden', timeout: 5000 });
    for (const theme of themes) for (const locale of locales) for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.getByLabel(/^(Язык интерфейса|Интерфейс тілі|Interface language)$/).selectOption(locale);
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      assert.equal(await page.evaluate(() => document.fonts.check('14px "Noto Sans"', 'Қазақша Кириллица')), true);
      for (const route of routes) {
        await page.goto(base + route); await page.locator('.launch-screen').waitFor({ state: 'hidden', timeout: 5000 });
        await page.locator('.loading').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
        const layout = await page.evaluate(layoutAudit);
        assert.ok(layout.overflow <= 0, `${theme}/${locale}/${viewport.name}${route}: page overflow ${layout.overflow}px`);
        assert.deepEqual(layout.clipped, [], `${theme}/${locale}/${viewport.name}${route}: clipped copy`);
        assert.deepEqual(await page.evaluate(contrastAudit), [], `${theme}/${locale}/${viewport.name}${route}: insufficient contrast`);
        if (route === '/overview') await page.screenshot({ path: path.join(output, `overview-${theme}-${locale}-${viewport.name}.png`), fullPage: true });
      }
    }

    await page.setViewportSize(viewports[0]); await page.goto(base + '/overview'); await page.locator('.launch-screen').waitFor({ state: 'hidden', timeout: 5000 });
    const primary = page.locator('.overview-hero .button');
    const normalPrimary = await primary.evaluate(element => getComputedStyle(element).backgroundColor);
    await primary.hover(); await page.waitForTimeout(200);
    assert.notEqual(await primary.evaluate(element => getComputedStyle(element).backgroundColor), normalPrimary, 'primary hover state must be visible');
    const language = page.locator('.language-control select'); await language.focus();
    assert.notEqual(await language.evaluate(element => getComputedStyle(element).outlineStyle), 'none', 'language focus state must be visible');
    const selected = page.locator('.sidebar nav a.active'); assert.ok(await selected.isVisible(), 'selected navigation state must be visible');

    const anonymous = await browser.newContext({ viewport: viewports[0] }); const login = await anonymous.newPage();
    await login.goto(base + '/login'); await login.locator('.launch-screen').waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await login.locator('.login-submit').isDisabled(), true);
    assert.deepEqual(await login.evaluate(contrastAudit), [], 'disabled/login controls must remain readable');
    await anonymous.close();
    assert.deepEqual(errors, []);
    console.log(`PASS readability matrix: ${themes.length} themes × ${locales.length} languages × ${viewports.length} viewports × ${routes.length} routes`);
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
