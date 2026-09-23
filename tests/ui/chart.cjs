/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser regression runner. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
const base=process.env.UI_BASE_URL || 'http://localhost:3112';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.UI_BROWSER_CHANNEL || 'msedge'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
 try{
  await page.request.post(base+'/api/auth/session',{data:{username:process.env.ADMIN_USERNAME || 'admin',password:process.env.ADMIN_PASSWORD}});
  await page.goto(base+'/forecast');await page.locator('.launch-screen').waitFor({state:'hidden'});
  const svg=page.locator('.reference-chart svg');await svg.waitFor();
  assert.ok(await page.locator('.forecast-band').count()>0);
  await svg.focus();await page.keyboard.press('Home');const initial=await page.getByRole('tooltip').innerText();
  assert.match(initial,/Диапазон/);assert.match(initial,/Предыдущая версия/);assert.match(initial,/Доступный факт/);
  await page.keyboard.press('ArrowRight');assert.notEqual(await page.getByRole('tooltip').innerText(),initial);
  await page.keyboard.press('End');await page.getByRole('tooltip').getByText('Нет данных',{exact:true}).first().waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('tooltip').count(),0);
  await svg.evaluate(el=>el.blur());const box=await svg.boundingBox();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.55);
  await page.getByRole('tooltip').waitFor();
  fs.mkdirSync('.data/ui-qa',{recursive:true});await page.locator('.reference-chart').screenshot({path:'.data/ui-qa/chart-reference.png'});
  await page.locator('.theme-toggle').click();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);await page.locator('.reference-chart').screenshot({path:'.data/ui-qa/chart-reference-dark.png'});
  await page.getByLabel('Сценарий UI').selectOption('partial');await page.waitForFunction(()=>!document.querySelector('.loading'));
  await page.locator('.reference-chart svg').focus();await page.keyboard.press('End');
  assert.equal(await page.getByRole('tooltip').getByText('Диапазон',{exact:true}).count(),0);
  await page.getByLabel('Сценарий UI').selectOption('ready');await page.waitForFunction(()=>!document.querySelector('.loading'));
  const Module=require('node:module'),ts=require('typescript'),m=new Module('fixtures');m._compile(ts.transpileModule(fs.readFileSync('src/components/dashboard/fixtures.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'fixtures');
  const forecasts=m.exports.forecasts('backtest','ready');for(const run of forecasts)for(const point of run.points)delete point.interval;
  forecasts[0].points.splice(8,1);
  await page.route('**/api/v1/assets',r=>r.fulfill({json:m.exports.assets}));await page.route('**/api/v1/forecasts?*',r=>r.fulfill({json:forecasts}));
  await page.getByLabel('Данные',{exact:true}).selectOption('api');await page.locator('.reference-chart svg').waitFor();
  assert.equal(await page.locator('.forecast-band').count(),0,'API without bounds must not invent a range');
  assert.equal((await page.locator('path.prediction').getAttribute('d')).split('M').length-1,2,'missing hour breaks line');
  await page.setViewportSize({width:390,height:844});await page.locator('.reference-chart svg').dispatchEvent('pointerdown',{clientX:180,clientY:300,pointerType:'touch'});await page.getByRole('tooltip').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS reference chart: band, pointer, keyboard, touch, dark theme, missing values/hour and no fabricated API bounds');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
