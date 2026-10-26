/* Availability stress test: absent at setup, bench, hurt mid-game, back in, and what the summary and stats say. */
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'http://localhost:4173/';
const X = (t) => `role=button[name="${t}"s]`;
const B = (t) => `role=button[name=/${t}/]`;
const CONFIRM = '.sheet-foot >> role=button[name=/Confirm/]';
const fails = [];
let PAGE;
function expect(label, got, want) { if (JSON.stringify(got) !== JSON.stringify(want)) { fails.push(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); console.log('  !! MISMATCH', label, JSON.stringify(got), 'want', JSON.stringify(want)); } else console.log('  ok', label); }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage(); PAGE = page;
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails.push('pageerror ' + e.message); });
  const settle = () => page.waitForTimeout(350);
  const inPlay = async (path, fielders = []) => {
    await page.click(B('In play'));
    for (const s of path) await page.click(s);
    for (const f of fielders) await page.click(`.pos >> text=${f}`);
    const nx = page.locator('.sheet-foot >> role=button[name="Next"]'); if (await nx.count()) await nx.click();
    await page.click(CONFIRM);
    await page.waitForSelector('.sheet', { state: 'detached' });
  };
  const threeOuts = async () => { for (let i = 0; i < 3; i++) await inPlay([X('Out'), X('Flyout')], ['CF']); };

  await page.goto(URL);
  await page.waitForSelector('text=Dugout Dad');
  await page.click('role=button[name="Load a practice game"]');
  await page.waitForURL(/\/live$/, { timeout: 60000 });
  await page.goto(URL + '#/help');
  await page.click('role=button[name="Remove practice games"]');
  await page.waitForSelector('.toast');

  // New game, nine in the order, mark Koon absent, Paston and Watts... (12 on roster: 9 start, 1 absent, 2 bench)
  await page.goto(URL + '#/games/new');
  await page.waitForSelector('text=New game');
  await page.click('role=button[name="New opponent"s]');
  await page.fill('input[placeholder*="Opponent name"]', 'Bench Test Bears');
  await page.click('text=Next: lineups');
  await page.waitForSelector('text=Lineups');
  for (let i = 0; i < 9; i++) await page.locator('.add-chips .chip').first().click();
  const notHere = page.locator('.absent-chips .chip');
  expect('three not in the order', await notHere.count(), 3);
  const names = await notHere.allInnerTexts();
  console.log('  bench candidates:', names.join(' | '));
  await notHere.last().click();
  expect('one marked absent', await page.locator('.absent-chips .chip.struck').count(), 1);
  expect('absent chip is out of tap-to-add', await page.locator('.add-chips .chip').count(), 2);
  await page.click('role=button[name="Defense"s]');
  await page.click('text=Fill from batting order');
  await page.click('role=button[name=/Bench Test/]');
  await page.click('text=Unknown lineup: 9 players');
  await page.waitForSelector('text=Player 9');
  await page.click('text=Start game');
  await page.waitForSelector(B('In play'));

  // Top 1 we bat, bottom 1 we field
  await threeOuts();
  await threeOuts();
  await threeOuts();
  // Bottom 2: one out, then the SS is hurt
  await inPlay([X('Out'), X('Groundout')], ['SS', '1B']);
  await page.click(B('Fix'));
  await page.waitForSelector('.sheet');
  await page.click('role=button[name="Who\'s here"]');
  await settle();
  const rows = page.locator('.sheet .list .item');
  const rosterCount = await rows.count();
  expect('twelve on the roster sheet', rosterCount, 12);
  const pills = await page.locator('.sheet .avail-pill').allInnerTexts();
  expect('one absent pill', pills.filter((p) => p === 'Absent').length, 1);
  expect('eleven here', pills.filter((p) => p === 'Here').length, 11);
  const benchRows = await page.locator('.sheet .list .item .sub').allInnerTexts();
  expect('two on the bench', benchRows.filter((t) => t === 'on the bench').length, 2);
  // Hurt the shortstop: find the row whose sub says in the field and whose name matches SS... simpler: pick row of the first batter (Flesher is SS? no: fill from order gives P to slot 1). Pick the row that is 'in the field' and tap, choose Hurt
  const fieldRow = page.locator('.sheet .list .item', { hasText: 'in the field' }).nth(5); // slot 6 = SS after fill from order
  const hurtName = (await fieldRow.locator('.title').innerText()).trim();
  await fieldRow.click();
  await page.click(X('Hurt'));
  await page.waitForSelector('.sheet', { state: 'detached' });
  console.log('  hurt:', hurtName);
  // Fill SS from the bench
  await page.click(B('Defense'));
  await page.waitForSelector('.sheet');
  await page.click('.pos >> text=SS');
  await settle();
  const benchChip = page.locator('.sheet .chips .chip').filter({ hasText: /./ }).last();
  const subName = (await benchChip.innerText()).trim();
  await benchChip.click();
  const save = page.locator('.sheet-foot >> role=button[name=/Save|Apply|Done/]'); if (await save.count()) await save.first().click();
  await page.waitForSelector('.sheet', { state: 'detached' }).catch(() => {});
  console.log('  sub at SS:', subName);
  await inPlay([X('Out'), X('Flyout')], ['CF']);
  await inPlay([X('Out'), X('Flyout')], ['CF']);
  // Top 3 / bottom 3
  await threeOuts();
  await threeOuts();
  // End
  await page.click('.live-actions >> role=button[name="End game"]');
  await page.click(X('Time limit'));
  await page.waitForSelector('text=Play log');
  const body = await page.locator('body').innerText();
  expect('summary names the hurt player', body.includes('Hurt'), true);
  expect('summary names the absent player', body.includes('Absent'), true);
  expect('summary shows bench time', /bench 3\.0/.test(body), true);
  expect('hurt player stopped at 1.1', /Mcgarraugh Hurt\nSS 1\.1/.test(body) || /SS 1\.1 · 1 PA/.test(body), true);
  expect('sub has SS 1.2 and bench 1.1', /SS 1\.2 · bench 1\.1/.test(body), true);
  expect('summary shows did not bat', body.includes('did not bat'), true);
  console.log('  summary roster block:\n' + body.split(/who played, who sat/i)[1].split('Bench means')[0].trim().split('\n').slice(0, 40).join('\n'));

  // Stats, playing time tab
  await page.goto(URL + '#/stats');
  await page.waitForSelector('text=Batting');
  await page.click('role=button[name=/Playing time|Time/]');
  await settle();
  const stats = await page.locator('body').innerText();
  expect('availability table present', /here, playing, or sitting/i.test(stats), true);
  expect('DNB column', stats.includes('DNB'), true);
  const row = await page.locator('table.stats tbody tr', { hasText: subName.replace(/^#\d+ /, '').replace(/ \(.*$/, '') }).first().innerText().catch(() => '');
  console.log('  sub row:', row.replace(/\n/g, ' | '));

  console.log(fails.length ? `FAILURES (${fails.length}):\n - ` + fails.join('\n - ') : 'ALL CHECKS PASSED');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch(async (e) => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); console.log('failures so far:', fails); try { await PAGE.screenshot({ path: 'availability_FAIL.png' }); console.log(PAGE.url()); console.log((await PAGE.locator('body').innerText()).slice(0, 800)); } catch {} process.exit(1); });
