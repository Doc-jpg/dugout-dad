/* Pitch-by-pitch stress test: counts, auto walk / strikeout, fouls, wild pitch shortcut, pickoff attempts, pitch totals and strike percentage. */
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'http://localhost:4173/';
const X = (t) => `role=button[name="${t}"s]`;
const B = (t) => `role=button[name=/${t}/]`;
const CONFIRM = '.sheet-foot >> role=button[name=/Confirm/]';
const fails = [];
let PAGE; let n = 0; let ms = 0;
function expect(label, got, want) { if (JSON.stringify(got) !== JSON.stringify(want)) { fails.push(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); console.log('  !! MISMATCH', label, JSON.stringify(got), 'want', JSON.stringify(want)); } }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage(); PAGE = page;
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails.push('pageerror ' + e.message); });
  const read = async () => {
    await page.waitForTimeout(300);
    const runs = await page.locator('.sb-team .runs').allInnerTexts();
    const countEl = page.locator('.now strong.num');
    const count = (await countEl.count()) ? await countEl.first().innerText() : 'n/a';
    const outs = await page.locator('.out-dot.on').count();
    const on = (await Promise.all([1, 2, 3].map(async (b) => (await page.locator(`.base.b${b}.on`).count()) > 0))).map((x) => (x ? 1 : 0)).join('');
    const inning = await page.locator('.sb-mid .inning').innerText();
    const pitcherLine = await page.locator('.now').innerText();
    const pm = /(\d+) P \((\d+)% strikes\)/.exec(pitcherLine);
    return { away: +runs[0], home: +runs[1], inning, outs, on, count, pitches: pm ? +pm[1] : null, strikePct: pm ? +pm[2] : null };
  };
  const tap = async (label, fn) => { const t0 = Date.now(); await fn(); await page.waitForSelector('.sheet', { state: 'detached', timeout: 15000 }).catch(() => {}); n++; ms += Date.now() - t0; };
  const pitch = async (r) => tap(r, async () => { await page.click(X(r)); });
  const inPlay = async (label, path, opts = {}) => tap(label, async () => {
    await page.click(B('In play'));
    for (const s of path) await page.click(s);
    if (opts.fielders) for (const f of opts.fielders) await page.click(`.pos >> text=${f}`);
    const nx = page.locator('.sheet-foot >> role=button[name="Next"]'); if (await nx.count()) await nx.click();
    if (opts.runners) for (const [who, dest] of opts.runners) await page.locator('.card', { hasText: who }).getByRole('button', { name: dest, exact: true }).click();
    await page.click(CONFIRM);
  });

  await page.goto(URL);
  await page.waitForSelector('text=Dugout Dad');
  await page.click('role=button[name="Load a practice game"]');
  await page.waitForURL(/\/live$/, { timeout: 60000 });
  await page.goto(URL + '#/help');
  await page.click('role=button[name="Remove practice games"]');
  await page.waitForSelector('.toast');
  await page.goto(URL + '#/games/new');
  await page.waitForSelector('text=New game');
  await page.click('role=button[name="New opponent"s]');
  await page.fill('input[placeholder*="Opponent name"]', 'Pitch Test Pirates');
  await page.click('text=Next: lineups');
  await page.waitForSelector('text=Lineups');
  for (let i = 0; i < 9; i++) await page.locator('.add-chips .chip').first().click();
  await page.click('role=button[name="Defense"s]');
  await page.click('text=Fill from batting order');
  await page.click('role=button[name=/Pitch Test/]');
  await page.click('text=Unknown lineup: 9 batters');
  await page.waitForSelector('text=Batter 9');
  await page.click('text=Start game');
  await page.waitForSelector(B('In play'));
  expect('start', await read(), { away: 0, home: 0, inning: 'Top 1', outs: 0, on: '000', count: '0-0', pitches: null, strikePct: null });

  // Full count then single: 6 pitches, 3 balls 3 strikes (50%)
  for (const r of ['Ball', 'Strike', 'Ball', 'Strike', 'Ball']) await pitch(r);
  expect('full count', (await read()).count, '3-2');
  await inPlay('single on 3-2', [X('Hit'), X('Single')]);
  expect('after single', await read(), { away: 0, home: 0, inning: 'Top 1', outs: 0, on: '100', count: '0-0', pitches: 6, strikePct: 50 });

  // Pickoff attempt to first (no movement), then back-pick
  await tap('pickoff attempt', async () => { await page.click(B('Runner SB')); await page.click(X('Pickoff attempt (pitcher)')); await page.click(CONFIRM); });
  await tap('back pick', async () => { await page.click(B('Runner SB')); await page.click(X('Back-pick (catcher)')); await page.click(CONFIRM); });
  expect('after attempts', await read(), { away: 0, home: 0, inning: 'Top 1', outs: 0, on: '100', count: '0-0', pitches: 6, strikePct: 50 });

  // Two fouls with two strikes: pitches 6+4=10 with strikes 3+4 = 7 after K (strike three)
  await pitch('Strike'); await pitch('Strike'); await pitch('Foul'); await pitch('Foul');
  expect('0-2 after fouls', (await read()).count, '0-2');
  await pitch('Strike'); // strike three -> K sheet
  await page.waitForSelector('.sheet');
  await tap('K swinging confirm', async () => { await page.click(X('Swinging')); await page.click(CONFIRM); });
  expect('after K', await read(), { away: 0, home: 0, inning: 'Top 1', outs: 1, on: '100', count: '0-0', pitches: 11, strikePct: 73 });

  // Walk: four balls -> walk sheet opens with runner forced to second
  for (const r of ['Ball', 'Ball', 'Strike', 'Ball']) await pitch(r);
  await pitch('Ball');
  await page.waitForSelector('.sheet');
  await tap('walk confirm', async () => { await page.click(CONFIRM); });
  expect('after walk', await read(), { away: 0, home: 0, inning: 'Top 1', outs: 1, on: '110', count: '0-0', pitches: 16, strikePct: 56 });

  // Ball, runners moved (wild pitch): both advance
  await tap('ball + wild pitch', async () => { await page.click(B('Ball, runners moved')); await page.waitForSelector('.sheet'); await page.click(X('Wild pitch')); await page.click(CONFIRM); });
  expect('after WP', await read(), { away: 0, home: 0, inning: 'Top 1', outs: 1, on: '011', count: '1-0', pitches: 17, strikePct: 53 });

  // First-pitch (well, 1-0) sac fly scores one: pitches 18
  await inPlay('sac fly', [X('Out'), X('Sacrifice fly')], { fielders: ['CF'] });
  expect('after SF', await read(), { away: 1, home: 0, inning: 'Top 1', outs: 2, on: '010', count: '0-0', pitches: 18, strikePct: 56 });

  // HBP via In play > Hit by pitch: pitch counted as a ball
  await inPlay('hbp', [X('Hit by pitch')]);
  expect('after HBP', await read(), { away: 1, home: 0, inning: 'Top 1', outs: 2, on: '110', count: '0-0', pitches: 19, strikePct: 53 });

  // Undo a pitch
  await pitch('Ball'); expect('1-0', (await read()).count, '1-0');
  await tap('undo pitch', async () => { await page.click(B('Undo')); });
  expect('undo restores 0-0', (await read()).count, '0-0');

  // Groundout ends the inning; the count resets for the other side and the other pitcher has no pitches yet
  await pitch('Strike');
  await inPlay('groundout 6-3', [X('Out'), X('Groundout')], { fielders: ['SS', '1B'] });
  const b1 = await read();
  expect('bottom 1', { inning: b1.inning, outs: b1.outs, on: b1.on, count: b1.count, pitches: b1.pitches }, { inning: 'Bot 1', outs: 0, on: '000', count: '0-0', pitches: null });

  // Bottom 1 with our pitcher: strikeout looking on three pitches
  await pitch('Strike'); await pitch('Strike'); await pitch('Strike');
  await page.waitForSelector('.sheet');
  await tap('K looking', async () => { await page.click(X('Looking')); await page.click(CONFIRM); });
  expect('our pitcher 3 pitches 100%', await read(), { away: 1, home: 0, inning: 'Bot 1', outs: 1, on: '000', count: '0-0', pitches: 3, strikePct: 100 });

  // Catch-up at-bat with no pitches logged: no count added
  await inPlay('no pitches logged flyout', [X('Out'), X('Flyout')], { fielders: ['LF'] });
  expect('first-pitch flyout adds one', (await read()).pitches, 4);

  // Edit pitcher: set throws L and check the label
  await tap('edit pitcher throws', async () => {
    await page.locator('.now button', { hasText: /IP|not set/ }).first().click();
    await page.waitForSelector('.sheet');
    await page.locator('.sheet').getByRole('button', { name: 'Left', exact: true }).last().click();
    await page.click('.sheet-foot >> role=button[name="Save"s]');
  });
  expect('LHP label', (await page.locator('.now').innerText()).includes('LHP'), true);

  // Summary pitch totals: go to summary via End game
  await tap('end', async () => { await page.click('.live-actions >> role=button[name="End game"]'); await page.click(X('Time limit')); await page.waitForSelector('text=Play log'); });
  const body = await page.locator('body').innerText();
  expect('summary has pitch column value 21 for their pitcher', /\b21\b/.test(body), true);

  console.log(`actions: ${n}, avg ${(ms / n).toFixed(0)} ms`);
  console.log(fails.length ? `FAILURES (${fails.length}):\n - ` + fails.join('\n - ') : 'ALL CHECKS PASSED');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch(async (e) => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); console.log('failures so far:', fails); try { await PAGE.screenshot({ path: 'pitchgame_FAIL.png' }); console.log(PAGE.url()); console.log((await PAGE.locator('body').innerText()).slice(0, 600)); } catch {} process.exit(1); });
