/* Full seven-inning stress test on the live address, phone viewport, with per-play state checks and timing. */
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'https://doc-jpg.github.io/dugout-dad/';
const X = (t) => `role=button[name="${t}"s]`;
const B = (t) => `role=button[name=/${t}/]`;
const CONFIRM = '.sheet-foot >> role=button[name=/Confirm/]';
const fails = [];
let PAGE = null; let plays = 0, totalMs = 0, maxMs = 0, maxLabel = '';
function expect(label, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails.push(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    console.log('  !! MISMATCH', label, 'got', JSON.stringify(got), 'want', JSON.stringify(want));
  }
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage(); PAGE = page;
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails.push('pageerror ' + e.message); });

  const state = async () => {
    await page.waitForTimeout(350);
    const runs = await page.locator('.sb-team .runs').allInnerTexts();
    const inning = await page.locator('.sb-mid .inning').innerText();
    const outs = (await page.locator('.out-dot.on').count());
    const bases = [1, 2, 3].map(async (b) => (await page.locator(`.base.b${b}.on`).count()) > 0);
    const on = await Promise.all(bases);
    return { away: +runs[0], home: +runs[1], inning, outs, on: on.map((x) => (x ? 1 : 0)).join('') };
  };
  const timed = async (label, fn) => {
    const t0 = Date.now();
    await fn();
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('.sheet', { state: 'detached', timeout: 15000 }).catch(() => {});
    const ms = Date.now() - t0;
    plays++; totalMs += ms; if (ms > maxMs) { maxMs = ms; maxLabel = label; }
    return ms;
  };
  // Plate appearance helper. steps are extra taps between result and confirm (fielders etc.)
  const pa = async (label, path, opts = {}) => {
    await timed(label, async () => {
      await page.click(B('Record at-bat'));
      for (const s of path) await page.click(s);
      if (opts.fielders) for (const f of opts.fielders) await page.click(`.pos >> text=${f}`);
      if (opts.next || opts.skip) {
        const b = page.locator('.sheet-foot >> role=button[name="Next"]');
        if (await b.count()) await b.click();
      }
      if (opts.runners) for (const [who, dest] of opts.runners) {
        // who: text fragment of the runner row, dest: chip label
        await page.locator('.card', { hasText: who }).getByRole('button', { name: dest, exact: true }).click();
      }
      if (opts.rbi != null) await page.locator('.sheet-body').getByText('RBI', { exact: true }).locator('..').getByRole('button', { name: String(opts.rbi), exact: true }).click();
      await page.click(CONFIRM);
    });
    if (opts.want) expect(label, await state(), opts.want);
  };
  const runner = async (label, kind, base, want) => {
    await timed(label, async () => {
      await page.click(B('Runner SB'));
      await page.click(X(kind));
      if (base) { const b = page.locator(`role=button[name=/on ${base}/]`); if (await b.count()) await b.first().click(); }
      await page.click(CONFIRM);
    });
    if (want) expect(label, await state(), want);
  };
  const defense = async (label, pairs) => {
    await timed(label, async () => {
      await page.click(B('Defense subs'));
      await page.waitForSelector('text=Tap a position');
      for (const [pos, who] of pairs) {
        await page.click(`.pos >> text=${pos}`);
        await page.click(`.chips .chip:has-text("${who}")`);
      }
      await page.click('.sheet-foot >> role=button[name=/Save/]');
    });
  };

  // ---------- setup ----------
  await page.goto(URL);
  await page.waitForSelector('text=Dugout Dad');
  // fresh profile: set up team via practice loader (roster), then remove practice games
  await page.click('role=button[name="Load a practice game"]');
  await page.waitForURL(/\/live$/, { timeout: 60000 });
  await page.goto(URL + '#/help');
  await page.click('role=button[name="Remove practice games"]');
  await page.waitForSelector('.toast');
  await page.goto(URL + '#/games/new');
  await page.waitForSelector('text=New game');
  await page.click('role=button[name="New opponent"s]');
  await page.fill('input[placeholder*="Opponent name"]', 'Stress Test Sluggers');
  await page.click('role=button[name="Enhanced"s]');
  await page.locator('label.switch input[type=checkbox]').first().uncheck(); // this run scores results only, no pitch logging
  await page.waitForTimeout(300);
  await page.click('text=Next: lineups');
  await page.waitForSelector('text=Lineups');
  for (let i = 0; i < 9; i++) await page.locator('.add-chips .chip').first().click();
  await page.click('role=button[name="Defense"s]');
  await page.click('text=Fill from batting order');
  await page.click('.pos >> text=CF'); await page.click('.chips .chip:has-text("E. Flesher")'); // Eli CF, swaps with CF holder
  await page.click('role=button[name=/Stress Test/]');
  await page.click('text=Unknown lineup: 9 players');
  await page.waitForSelector('text=Player 9');
  await page.click('text=Start game');
  await page.waitForSelector(B('Record at-bat'));
  console.log('setup done; order:', (await page.locator('.now .who').innerText()));
  const gameUrl = page.url();
  // Batting order after fill: slot1 Eli(P originally), ... We moved Eli to CF; the CF player went to P.

  // ---------- TOP 1 (Rattlers) ----------
  await pa('T1 single', [X('Hit'), X('Single')], { skip: true, want: { away: 0, home: 0, inning: 'Top 1', outs: 0, on: '100' } });
  await runner('T1 SB', 'Stolen base', null, { away: 0, home: 0, inning: 'Top 1', outs: 0, on: '010' });
  await pa('T1 walk', [X('Walk'), X('Walk')], { want: { away: 0, home: 0, inning: 'Top 1', outs: 0, on: '110' } });
  await pa('T1 K', [X('Strikeout'), X('Swinging')], { want: { away: 0, home: 0, inning: 'Top 1', outs: 1, on: '110' } });
  await pa('T1 double, both score (override R1 home)', [X('Hit'), X('Double'), X('Line drive')], { next: true, runners: [['on 1st', 'Home']], want: { away: 2, home: 0, inning: 'Top 1', outs: 1, on: '010' } });
  await pa('T1 flyout F8', [X('Out'), X('Flyout')], { fielders: ['CF'], next: true, want: { away: 2, home: 0, inning: 'Top 1', outs: 2, on: '010' } });
  await pa('T1 groundout 6-3 ends inning', [X('Out'), X('Groundout')], { fielders: ['SS', '1B'], next: true, want: { away: 2, home: 0, inning: 'Bot 1', outs: 0, on: '000' } });

  // ---------- BOT 1 (Sluggers) ----------
  await pa('B1 K looking', [X('Strikeout'), X('Looking')], { want: { away: 2, home: 0, inning: 'Bot 1', outs: 1, on: '000' } });
  await pa('B1 ROE SS throwing', [X('Reached on error'), '.pos >> text=SS', X('Throwing error')], { skip: true, want: { away: 2, home: 0, inning: 'Bot 1', outs: 1, on: '100' } });
  await pa('B1 HBP', [X('Hit by pitch')], { want: { away: 2, home: 0, inning: 'Bot 1', outs: 1, on: '110' } });
  await pa('B1 bases loaded walk? no, single loads bases', [X('Hit'), X('Single')], { skip: true, runners: [['on 2nd', '3rd']], want: { away: 2, home: 0, inning: 'Bot 1', outs: 1, on: '111' } });
  await pa('B1 bases loaded walk forces run', [X('Walk'), X('Walk')], { want: { away: 2, home: 1, inning: 'Bot 1', outs: 1, on: '111' } });
  await pa('B1 6-4-3 double play with one out: inning over, no run', [X('Out'), X('Double play')], { fielders: ['SS', '2B', '1B'], next: true, want: { away: 2, home: 1, inning: 'Top 2', outs: 0, on: '000' } });

  // ---------- TOP 2 ----------
  await pa('T2 HR', [X('Hit'), X('Home run')], { skip: true, want: { away: 3, home: 1, inning: 'Top 2', outs: 0, on: '000' } });
  await pa('T2 pop out P5', [X('Out'), X('Pop-out')], { fielders: ['3B'], next: true, want: { away: 3, home: 1, inning: 'Top 2', outs: 1, on: '000' } });
  await pa('T2 single', [X('Hit'), X('Single')], { skip: true, want: { away: 3, home: 1, inning: 'Top 2', outs: 1, on: '100' } });
  await runner('T2 caught stealing', 'Caught stealing', null, { away: 3, home: 1, inning: 'Top 2', outs: 2, on: '000' });
  await pa('T2 lineout', [X('Out'), X('Lineout')], { fielders: ['SS'], next: true, want: { away: 3, home: 1, inning: 'Bot 2', outs: 0, on: '000' } });

  // ---------- BOT 2: Eli CF -> SS mid-inning, then pitching change with runners on ----------
  await pa('B2 groundout 4-3', [X('Out'), X('Groundout')], { fielders: ['2B', '1B'], next: true, want: { away: 3, home: 1, inning: 'Bot 2', outs: 1, on: '000' } });
  await defense('B2 Eli to SS (swap)', [['SS', 'E. Flesher']]);
  await pa('B2 single', [X('Hit'), X('Single')], { skip: true, want: { away: 3, home: 1, inning: 'Bot 2', outs: 1, on: '100' } });
  await pa('B2 walk', [X('Walk'), X('Walk')], { want: { away: 3, home: 1, inning: 'Bot 2', outs: 1, on: '110' } });
  await defense('B2 pitching change (inherited runners)', [['P', 'J. Watts']]);
  await pa('B2 sac fly? no runner on 3rd; fly out F9', [X('Out'), X('Flyout')], { fielders: ['RF'], next: true, want: { away: 3, home: 1, inning: 'Bot 2', outs: 2, on: '110' } });
  await runner('B2 wild pitch moves both', 'Wild pitch', null, { away: 3, home: 1, inning: 'Bot 2', outs: 2, on: '011' });
  await pa('B2 single scores both (override R2 home)', [X('Hit'), X('Single')], { skip: true, runners: [['on 2nd', 'Home']], want: { away: 3, home: 3, inning: 'Bot 2', outs: 2, on: '100' } });
  await pa('B2 K ends', [X('Strikeout'), X('Swinging')], { want: { away: 3, home: 3, inning: 'Top 3', outs: 0, on: '000' } });

  // ---------- TOP 3: wrong batter, undo, redo ----------
  // Change batter to slot 5 (scorer realizes order was off)
  await timed('T3 change batter', async () => {
    await page.click('.now .who');
    await page.locator('.sheet .item').nth(4).click();
  });
  const who = await page.locator('.now .who').innerText();
  expect('T3 batter is slot 5', who.startsWith('5.'), true);
  await pa('T3 triple', [X('Hit'), X('Triple')], { skip: true, want: { away: 3, home: 3, inning: 'Top 3', outs: 0, on: '001' } });
  await pa('T3 sac fly', [X('Out'), X('Sacrifice fly')], { fielders: ['CF'], next: true, want: { away: 4, home: 3, inning: 'Top 3', outs: 1, on: '000' } });
  await pa('T3 K (will undo)', [X('Strikeout'), X('Swinging')], { want: { away: 4, home: 3, inning: 'Top 3', outs: 2, on: '000' } });
  await timed('T3 undo', async () => { await page.click(B('Undo')); });
  expect('T3 after undo', await state(), { away: 4, home: 3, inning: 'Top 3', outs: 1, on: '000' });
  await timed('T3 redo', async () => { await page.click(X('Redo')); });
  expect('T3 after redo', await state(), { away: 4, home: 3, inning: 'Top 3', outs: 2, on: '000' });
  await pa('T3 FC? no runners; groundout 5-3', [X('Out'), X('Groundout')], { fielders: ['3B', '1B'], next: true, want: { away: 4, home: 3, inning: 'Bot 3', outs: 0, on: '000' } });

  // ---------- BOT 3: scorer missed the whole half; use Fix to end it, crediting outs ----------
  await timed('B3 fix: end half crediting missed outs', async () => {
    await page.click(B('Fix score'));
    await page.click('role=button[name="Inning / outs / runners"s]');
    await page.click('role=button[name=/End this half \\(credit missed outs\\)/]');
  });
  expect('B3 skipped', await state(), { away: 4, home: 3, inning: 'Top 4', outs: 0, on: '000' });
  // and the opponent scored 2 we missed
  await timed('B3 fix: +2 runs opponent', async () => {
    await page.click(B('Fix score'));
    await page.click('.sheet-body >> role=button[name=/Stress/]');
    await page.click('role=button[name="+2"s]');
    await page.click('role=button[name=/Apply \\+2/]');
  });
  expect('B3 +2', await state(), { away: 4, home: 5, inning: 'Top 4', outs: 0, on: '000' });

  // ---------- TOP 4: fielders choice, pickoff, sac bunt, intentional walk, D3K ----------
  await pa('T4 single', [X('Hit'), X('Single')], { skip: true, want: { away: 4, home: 5, inning: 'Top 4', outs: 0, on: '100' } });
  await pa("T4 fielder's choice 6-4", [X("Fielder's choice")], { fielders: ['SS', '2B'], next: true, want: { away: 4, home: 5, inning: 'Top 4', outs: 1, on: '100' } });
  await runner('T4 picked off', 'Picked off (out)', null, { away: 4, home: 5, inning: 'Top 4', outs: 2, on: '000' });
  await pa('T4 D3K reaches', [X('Strikeout'), X('Dropped 3rd strike, batter safe')], { want: { away: 4, home: 5, inning: 'Top 4', outs: 2, on: '100' } });
  await pa('T4 sac bunt advances (1 out: ends inning)', [X('Out'), X('Sacrifice bunt')], { fielders: ['C', '1B'], next: true, want: { away: 4, home: 5, inning: 'Bot 4', outs: 0, on: '000' } });

  // ---------- BOT 4 quick, with intentional walk and passed ball ----------
  await pa('B4 IBB', [X('Walk'), X('Intentional walk')], { want: { away: 4, home: 5, inning: 'Bot 4', outs: 0, on: '100' } });
  await runner('B4 passed ball', 'Passed ball', null, { away: 4, home: 5, inning: 'Bot 4', outs: 0, on: '010' });
  await pa('B4 K', [X('Strikeout'), X('Unspecified')], { want: { away: 4, home: 5, inning: 'Bot 4', outs: 1, on: '010' } });
  await pa('B4 K', [X('Strikeout'), X('Unspecified')], { want: { away: 4, home: 5, inning: 'Bot 4', outs: 2, on: '010' } });
  await pa('B4 groundout 1-3', [X('Out'), X('Groundout')], { fielders: ['P', '1B'], next: true, want: { away: 4, home: 5, inning: 'Top 5', outs: 0, on: '000' } });

  // ---------- TOP 5: quick-level speed run (switch level), 3 up 3 down with no detail ----------
  await page.click('role=button[name="Enhanced"s]');
  await page.click('.sheet >> role=button[name=/Quick/]');
  await page.waitForSelector('.sheet', { state: 'detached' });
  for (let i = 0; i < 3; i++) await pa(`T5 quick K ${i}`, [X('Strikeout'), X('Swinging')]);
  expect('T5 end', await state(), { away: 4, home: 5, inning: 'Bot 5', outs: 0, on: '000' });
  await pa('B5 quick single', [X('Hit'), X('Single')], { want: { away: 4, home: 5, inning: 'Bot 5', outs: 0, on: '100' } });
  await pa('B5 quick double scores', [X('Hit'), X('Double')], { runners: [['on 1st', 'Home']], want: { away: 4, home: 6, inning: 'Bot 5', outs: 0, on: '010' } });
  for (let i = 0; i < 3; i++) await pa(`B5 quick out ${i}`, [X('Out'), X('Flyout')], { skip: true });
  expect('B5 end', await state(), { away: 4, home: 6, inning: 'Top 6', outs: 0, on: '000' });

  // ---------- TOP 6: edit a play from the second inning (the HR becomes a double) via the Log ----------
  await timed('T6 edit T2 HR into a double from the log', async () => {
    await page.click('role=link[name="Log"]');
    await page.waitForSelector('text=Play log');
    await page.locator('.log-item', { hasText: 'HR' }).first().click();
    await page.waitForSelector('.sheet');
    await page.click('.sheet-head >> role=button[name=/Back/]'); // back to category
    await page.click(X('Hit')); await page.click(X('Double'));
    { const b = page.locator('.sheet-foot >> role=button[name="Skip"]'); if (await b.count()) await b.click(); }
    await page.click(CONFIRM);
    await page.waitForSelector('.toast');
    await page.goto(gameUrl);
    await page.waitForSelector(B('Record at-bat'));
  });
  expect('T6 after edit (away loses a run)', await state(), { away: 3, home: 6, inning: 'Top 6', outs: 0, on: '000' });

  // ---------- end game by time limit, reopen, score one more, end again ----------
  await timed('end game time limit', async () => {
    await page.click('.live-actions >> role=button[name="End game"]');
    await page.click('role=button[name="Time limit"s]');
    await page.waitForSelector('text=Play log');
  });
  const title = await page.locator('h1').innerText();
  expect('summary title', title.startsWith('Loss 3-6'), true);
  await timed('reopen', async () => {
    await page.click('role=button[name="Reopen"s]');
    await page.click('.sheet-foot >> role=button[name="Reopen"s]');
    await page.waitForSelector(B('Record at-bat'));
  });
  await pa('T6 after reopen: HR', [X('Hit'), X('Home run')], { want: { away: 4, home: 6, inning: 'Top 6', outs: 0, on: '000' } });
  await timed('end game again', async () => {
    await page.click('.live-actions >> role=button[name="End game"]');
    await page.click('role=button[name="Time limit"s]');
    await page.waitForSelector('text=Play log');
  });

  // ---------- verify Eli's defensive innings: CF 1.1 (T? no: bottom 1 full = 3 outs at CF, + 1 out bottom 2 = 4 outs CF), SS afterwards ----------
  const summary = await page.locator('body').innerText();
  const eliLine = summary.split('\n').find((l) => l.includes('E. Flesher') && (l.includes('CF') || l.includes('SS')));
  console.log('Eli defense line:', eliLine);
  // Defensive outs for Rattlers: B1 3 outs (CF), B2 1 out CF then 2 outs SS, B3 3 credited outs SS, B4 3 SS, B5 3 SS => CF 1.1, SS 3.2
  const row = await page.locator('.item', { hasText: 'E. Flesher' }).first().innerText();
  expect('Eli CF 1.1', row.includes('CF 1.1'), true);
  expect('Eli SS 3.2', row.includes('SS 3.2'), true);
  expect('Eli total 5.0', row.includes('5.0'), true);

  console.log(`\nplays/actions: ${plays}, avg ${(totalMs / plays).toFixed(0)} ms, slowest ${maxMs} ms (${maxLabel})`);
  console.log(fails.length ? `FAILURES (${fails.length}):\n - ` + fails.join('\n - ') : 'ALL CHECKS PASSED');
  await page.screenshot({ path: '/tmp/claude-0/-home-claude/50d88ed7-a1bc-5bfd-aa51-150dc70ea742/scratchpad/fullgame_summary.png', fullPage: true });
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch(async (e) => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); console.log('failures so far:', fails); try { await PAGE.screenshot({ path: 'fullgame_FAIL.png' }); console.log('URL', PAGE.url()); console.log((await PAGE.locator('body').innerText()).slice(0, 700)); } catch {} process.exit(1); });
