/* eslint-disable @typescript-eslint/no-require-imports -- Playwright provided by the QA runner. */
const {selectScenario} = require('./browser-helpers.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const base = process.env.UI_BASE_URL || 'http://localhost:3112';
(async () => {
  const browser = await chromium.launch({headless:true,channel:process.env.UI_BROWSER_CHANNEL || 'msedge'});
  const context = await browser.newContext(); const page = await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  fs.mkdirSync('.data/ui-qa',{recursive:true});
  async function settle(){await page.locator('.launch-screen').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('.loading'));}
  try {
    await page.setViewportSize({width:320,height:740});await page.goto(base+'/login');await settle();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'320px login overflow');
    assert.equal((await context.request.post(base+'/api/auth/session',{data:{username:process.env.ADMIN_USERNAME || 'admin',password:process.env.ADMIN_PASSWORD}})).status(),200);
    await page.goto(base+'/overview');await settle();
    await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),true,'menu receives focus');
    for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),true,'Tab stays inside menu');}
    await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),true);
    assert.equal(await page.locator('.workspace').evaluate(el=>el.inert),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-menu').evaluate(el=>el===document.activeElement),true);
    await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(()=>!document.querySelector('.workspace').inert);
    console.log('PASS keyboard menu, Escape focus return, background isolation and desktop resize');
    const samples=[['ru','light',1440],['en','dark',1440],['kk','light',768],['ru','dark',390],['en','light',320],['kk','dark',390]];
    for(const [locale,theme,width] of samples){
      await page.setViewportSize({width,height:900});
      await page.locator('.language-control select').selectOption(locale);
      if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.theme-toggle').click();
      for(const route of ['history','overview','forecast','sources','agent-log']){
        await page.goto(base+'/'+route);await settle();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route}/${locale}/${theme}/${width}: overflow`);
        assert.equal(await page.locator('main h1').count(),1,`${route}: one main heading`);
        if(locale==='en') assert.doesNotMatch(await page.locator('main').innerText(),/[А-Яа-яЁё]/,route+' has Russian text');
        if(route==='overview') assert.doesNotMatch(await page.locator('.overview-kpis').innerText(),/%|п\.п\./,'do not invent percent of nominal');
        await page.screenshot({path:`.data/ui-qa/ux-${route}-${locale}-${theme}-${width}.png`,fullPage:true});
      }
      console.log(`PASS five routes: ${locale}/${theme}/${width}px`);
    }
    await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/overview');await settle();
    await page.locator('.language-control select').selectOption('ru');
    await selectScenario(page, 'partial');await settle();
    assert.equal(await page.locator('.overview-kpi').last().locator('strong').textContent(),'Нет данныхнорм.-ч','partial sum must not look complete');
    await selectScenario(page, 'ready');await settle();
    const Module=require('node:module');const ts=require('typescript');const m=new Module('fixtures');
    m._compile(ts.transpileModule(fs.readFileSync('src/components/dashboard/fixtures.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'fixtures');
    await page.route('**/api/v1/forecasts?*',route=>route.fulfill({json:m.exports.forecasts('backtest','ready')}));
    await page.route('**/api/v1/connections',route=>route.fulfill({json:{connections:[]}}));
    await page.getByLabel('Данные',{exact:true}).selectOption('api');await settle();
    assert.equal(await page.locator('.success-alert').count(),0,'empty sources must not claim healthy history');
    assert.deepEqual(errors,[]);console.log('PASS truthful units, incomplete sums, empty sources and no runtime errors');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
