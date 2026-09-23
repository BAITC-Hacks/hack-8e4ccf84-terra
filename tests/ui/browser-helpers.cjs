async function selectScenario(page, value) {
  const details = page.locator('.demo-options');
  if (!(await details.evaluate(el => el.open))) await details.locator('summary').click();
  await page.getByLabel('Сценарий UI').selectOption(value);
}
module.exports = {selectScenario};
