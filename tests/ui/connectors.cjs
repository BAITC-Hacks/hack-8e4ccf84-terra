/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser acceptance runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const base = process.env.UI_BASE_URL || 'http://localhost:3110';
(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.UI_BROWSER_CHANNEL || 'msedge'});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    assert.equal((await context.request.post(base+'/api/v1/connectors/weather',{data:{}})).status(),401);
    assert.equal((await context.request.post(base+'/api/auth/session',{data:{username:process.env.ADMIN_USERNAME || 'admin',password:process.env.ADMIN_PASSWORD}})).status(),200);
    assert.equal((await context.request.post(base+'/api/v1/connectors/weather',{data:{latitude:91,longitude:65,initializedAt:'2026-01-01T00:00:00Z'}})).status(),400);
    for(const kind of ['postgres','oracle','wincc']) {
      const response=await context.request.post(base+'/api/v1/industrial-connectors/'+kind,{data:{action:'test'}});
      assert.equal(response.status(),503);assert.equal((await response.json()).error.code,'not_configured');
    }
    console.log('PASS actual auth, invalid weather and unconfigured gateway routes');
    await page.goto(base+'/sources');
    await page.locator('.connector-catalog a').first().waitFor(); assert.equal(await page.locator('.connector-catalog a').count(),5);
    for(const [kind,time,power] of [['postgres','measured_at','normalized_power'],['oracle','EVENT_TIME','ACTIVE_POWER_NORM'],['wincc','TURBINE_01.ActivePower','TURBINE_01.WindSpeed']]) {
      const card=page.locator('#connector-'+kind);
      await card.getByRole('button',{name:'Проверить доступ',exact:true}).click();
      const mapping=card.locator('.mapping-grid select'); await mapping.first().selectOption(time); await mapping.last().selectOption(power);
      await card.locator('button.primary').click(); await card.getByText('Шлюз принял настройку подключения',{exact:true}).waitFor();
      await mapping.last().selectOption(time); assert.equal(await card.locator('button.primary').isDisabled(),true);
    }
    const weather=page.locator('#connector-weather');
    await weather.getByLabel('Широта').fill('45');await weather.getByLabel('Долгота').fill('65');await weather.getByLabel('Прогон · UTC').fill('2026-01-01T00:00');
    await weather.getByRole('button',{name:'Проверить доступ'}).click();await weather.getByText('Погодный прогон доступен').waitFor();
    console.log('PASS all industrial fixture workflows, duplicate mapping and weather form');
    // Canonical API wire mock: HTTP route tests above use the actual server. No database integration claim.
    let upload;
    const id='123e4567-e89b-42d3-a456-426614174000';
    await page.route('**/api/v1/assets',route=>route.fulfill({json:{assets:[{id,name:'QA turbine',time_zone:'UTC',power_unit:'normalized'}]}}));
    await page.route('**/api/v1/connections',route=>route.fulfill({json:{connections:[]}}));
    await page.route('**/api/v1/imports',route=>{upload=route.request().postData();return route.fulfill({json:{id}});});
    await page.route('**/api/v1/imports/'+id,route=>route.fulfill({json:{id,status:'completed',report:{read:2,accepted:1,rejected:1,duplicates:0,reasons:{invalid_row:1}},errorsUrl:'/api/v1/imports/'+id+'/errors'}}));
    await page.getByLabel('Данные',{exact:true}).selectOption('api');
    await page.getByLabel('Объект',{exact:true}).selectOption(id);
    await page.locator('input[type=file]').setInputFiles({name:'qa.csv',mimeType:'text/csv',buffer:Buffer.from('time,wind,power,temp\n2026-01-01 00:00:00,5,0.5,10\n')});
    for(const [label,value] of [['Время','time'],['Скорость ветра · м/с','wind'],['Нормализованная мощность · исходная шкала','power'],['Температура · °C','temp']]) await page.getByLabel(label,{exact:true}).selectOption(value);
    await page.getByLabel('Исходный часовой пояс',{exact:true}).selectOption('UTC');await page.getByLabel('Смысл метки времени',{exact:true}).selectOption('interval_start');
    await page.getByLabel('Основание доступности данных').fill('Available after interval');
    await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Загрузить и проверить'}).click();
    await page.getByRole('heading',{name:'Отчёт импорта · '+id}).waitFor();
    assert.match(upload,/name="config"/);assert.match(upload,/"sourceIntervalMinutes":10/);assert.match(upload,/"availabilityAssumption":"Available after interval"/);
    await page.getByRole('link',{name:'↓ Скачать причины отклонения'}).waitFor();
    await page.locator('#connector-postgres').getByRole('button',{name:'Проверить доступ'}).click();
    await page.getByRole('alert').filter({hasText:'Серверный шлюз не настроен'}).waitFor();
    console.log('PASS canonical CSV upload/report and actionable gateway error without fixture fallback');
    fs.mkdirSync('.next/ui-qa',{recursive:true});
    await page.screenshot({path:'.next/ui-qa/connectors-light.png',fullPage:true});
    await page.locator('.language-control select').selectOption('en');
    await page.getByRole('heading',{name:'Data sources',exact:true}).waitFor();
    await page.locator('.language-control select').selectOption('kk');assert.equal(await page.locator('html').getAttribute('lang'),'kk');
    await page.locator('.language-control select').selectOption('ru');
    await page.locator('.theme-toggle').click();
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.next/ui-qa/connectors-mobile.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);console.log('PASS RU/EN/KK, theme, mobile layout and no browser exceptions');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
