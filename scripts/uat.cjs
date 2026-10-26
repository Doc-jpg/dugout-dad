/* Acceptance walkthrough on a phone viewport: team -> game -> score -> close/reopen -> second game -> export -> import on a fresh "computer" profile -> dashboards. */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:4173/';
let shotN = 0; let cur = null;
async function shot(page, name) {
  shotN++;
  await page.screenshot({ path: path.join(OUT, `${String(shotN).padStart(2, '0')}_${name}.png`), fullPage: false });
}
const log = (...a) => console.log('[uat]', ...a);

async function tapChip(page, text) {
  await page.getByRole('button', { name: text, exact: true }).first().click();
}
const X = (t) => `role=button[name="${t}"s]`;
const B = (t) => `role=button[name=/${t}/]`;

(async () => {
  const browser = await chromium.launch();
  const iphone = devices['iPhone 13'];
  const phoneDir = path.join(__dirname, 'profile-phone');
  const phone = await browser.newContext({ ...iphone, storageState: undefined, acceptDownloads: true });
  const page = await phone.newPage(); cur = page;
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  await page.goto(URL);
  await page.waitForSelector('text=Dugout Dad');
  await shot(page, 'home_empty');

  // Team + roster (from the GameChanger roster, numbers as exported)
  await page.click('text=Set up my team');
  await page.click('text=+ Team');
  await page.fill('input[placeholder="Oklahoma Rattlers 13U"]', 'Oklahoma Rattlers 13U');
  await page.fill('input[placeholder="Rattlers"]', 'Rattlers');
  await page.click('text=Save');
  await page.waitForSelector('text=Quick add');
  const roster = ['1 Eli Flesher', '24 Hudson Fuerst', '4 AJ Todd', '36 Hunter Meadows', '3 Knox Taylor', '12 Clay Mcgarraugh', '99 Ford Fox', '7 Wyatt Fisher', '9 Graham Weece', '13 Jayden Watts', '0 Hendrix Paston', '0 Kyle Koon'];
  await page.fill('textarea', roster.join('\n'));
  await page.click('text=Add players');
  await page.waitForSelector('text=Eli Flesher');
  // Mark Eli as tracked
  await page.locator('.item:has-text("Eli Flesher")').first().click();
  await page.waitForSelector('text=Edit player');
  await page.check('input[type=checkbox]');
  await page.click('.sheet-foot >> role=button[name=/Save/]');
  await page.waitForSelector('text=Tracking');
  await shot(page, 'roster');

  // New game
  await page.click('.tabbar >> text=Games');
  await page.click('text=+ New game');
  await page.waitForSelector('text=New game');
  await page.fill('input[placeholder*="Opponent name"]', 'Tulsa Drillers 13U');
  await page.selectOption('select >> nth=1', { label: '+ New tournament…' }).catch(() => {});
  const tSel = page.locator('select').filter({ hasText: 'None / friendly' });
  await tSel.selectOption('__new');
  await page.fill('input[placeholder="Tournament name"]', 'Fall Finale');
  await page.fill('input[placeholder="Optional"]', 'Edmond Field 3');
  await page.click('text=Enhanced');
  await shot(page, 'new_game');
  await page.click('text=Next: lineups');
  await page.waitForSelector('text=Lineups');

  // My batting order: tap first 9 chips in roster order shown, then fill defense from order
  for (let i = 0; i < 9; i++) await page.locator('.add-chips .chip').first().click();
  await page.click(X('Defense'));
  await page.click('text=Fill from batting order');
  await shot(page, 'defense_fill');
  // Put Eli at CF explicitly: tap CF, pick Eli
  await page.click('.pos >> text=CF');
  await page.click('.chips .chip:has-text("E. Flesher")');
  await shot(page, 'defense_eli_cf');
  // Opponent: unknown 9
  await page.click('button:has-text("Tulsa")');
  await page.click('text=Unknown lineup: 9 batters');
  await page.waitForSelector('text=Batter 9');
  await page.click('text=Start game');
  await page.waitForSelector(B('Record at-bat'));
  await shot(page, 'live_start');

  // Top 1: Rattlers bat. Three hits, a walk, an error, two stolen bases, a hard LD to left-center
  const recordPA = async (steps) => {
    await page.click(B('Record at-bat'));
    for (const s of steps) {
      await page.click(s);
    }
  };
  await recordPA([X('Hit'), X('Single'), '.sheet-foot >> role=button[name="Skip"]']);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  await page.waitForSelector('.toast');
  // Stolen base
  await page.click(B('Runner SB'));
  await page.click(X('Stolen base'));
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  // Double, hard line drive to left-center
  await page.click(B('Record at-bat'));
  await page.click(X('Hit'));
  await page.click(X('Double'));
  await page.click(X('Line drive'));
  await page.click('button.chip:text-is("Hard")');
  // tap the LC zone on the field
  const lc = page.locator('polygon.zone').nth(11);
  await lc.click();
  await shot(page, 'contact_detail');
  await page.click('.sheet-foot >> role=button[name="Next"]');
  await shot(page, 'review_double');
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  // Walk
  await recordPA([X('Walk'), X('Walk')]);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  // Stolen base by runner on 1st
  await page.click(B('Runner SB'));
  await page.click(X('Stolen base'));
  await page.click('button:has-text("on 1st")');
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  // Reached on error by SS, throwing
  await page.click(B('Record at-bat'));
  await page.click(X('Reached on error'));
  await page.click('.pos >> text=SS');
  await page.click(X('Throwing error'));
  await page.click('.sheet-foot >> role=button[name="Skip"]');
  await shot(page, 'review_roe');
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  // Third hit: single
  await recordPA([X('Hit'), X('Single'), '.sheet-foot >> role=button[name="Skip"]']);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  // Three outs
  await recordPA([X('Strikeout'), X('Swinging')]);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  await recordPA([X('Out'), X('Flyout'), '.pos >> text=CF', '.sheet-foot >> role=button[name="Next"]']);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  await recordPA([X('Out'), X('Groundout'), '.pos >> text=SS', '.pos >> text=1B', '.sheet-foot >> role=button[name="Next"]']);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  await page.waitForSelector('text=Bot 1');
  await shot(page, 'after_top1');

  // Bottom 1: opponent bats; our defense. One out, then Eli CF -> SS (swap with whoever is at SS), pitcher change
  await recordPA([X('Out'), X('Groundout'), '.pos >> text=2B', '.pos >> text=1B', '.sheet-foot >> role=button[name="Next"]']);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  await page.click(B('Defense subs'));
  await page.waitForSelector('text=Tap a position');
  await page.click('.pos >> text=SS');
  await page.click('.chips .chip:has-text("E. Flesher")');
  await shot(page, 'defense_swap');
  await page.click('.sheet-foot >> role=button[name=/Save/]');
  // pitching change: P -> Jayden Watts (bench? no, he is on the field at some position; swap)
  await page.click(B('Defense subs'));
  await page.click('.pos >> text=P');
  await page.click('.chips .chip:has-text("J. Watts")');
  await page.click('.sheet-foot >> role=button[name=/Save/]');
  await page.waitForSelector('.toast');
  // Opponent gets an error-free out and a K; Eli at SS fields a grounder
  await recordPA([X('Out'), X('Groundout'), '.pos >> text=SS', '.pos >> text=1B', '.sheet-foot >> role=button[name="Next"]']);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  // Mistake: record a HR then undo
  await recordPA([X('Hit'), X('Home run'), '.sheet-foot >> role=button[name="Skip"]']);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  await page.click(B('Undo'));
  await page.waitForSelector('text=Undid');
  await recordPA([X('Strikeout'), X('Looking')]);
  await page.click('.sheet-foot >> role=button[name=/Confirm/]');
  await page.waitForSelector('text=Top 2');
  await shot(page, 'after_bot1');

  // Close and reopen: new page in same context
  const gameUrl = page.url();
  await page.close();
  const page2 = await phone.newPage(); cur = page2;
  page2.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page2.goto(gameUrl);
  await page2.waitForSelector(B('Record at-bat'));
  const score = await page2.locator('.sb-team .runs').allInnerTexts();
  log('reopened; score', score.join('-'));
  await shot(page2, 'reopened');
  // Fix: opponent scored two runs I missed
  await page2.click(B('Fix score'));
  await page2.click('.sheet-body >> role=button[name=/Drillers/]');
  await page2.click('button.chip:has-text("+2")');
  await page2.click('role=button[name=/Apply \\+2/]');
  await page2.waitForSelector('.toast');
  // End the game by time limit
  await page2.click('.live-actions >> role=button[name="End game"]');
  await page2.click(X('Time limit'));
  await page2.waitForSelector('text=Play log');
  await shot(page2, 'summary1');

  // Second game, quick level, same opponent
  await page2.click('text=‹ Games');
  await page2.click('text=+ New game');
  await page2.waitForSelector('text=New game');
  await page2.click('text=Home (bat second)');
  await page2.click('text=Next: lineups');
  await page2.waitForSelector('text=Lineups');
  for (let i = 0; i < 9; i++) await page2.locator('.add-chips .chip').first().click();
  await page2.click(X('Defense'));
  await page2.click('text=Fill from batting order');
  await page2.click('button:has-text("Tulsa")');
  await page2.click('text=Unknown lineup: 9 batters');
  await page2.waitForSelector('text=Batter 9');
  await page2.click('text=Start game');
  await page2.waitForSelector(B('Record at-bat'));
  for (let i = 0; i < 3; i++) {
    await page2.click(B('Record at-bat'));
    await page2.click(X('Strikeout'));
    await page2.click(X('Unspecified'));
    await page2.click('.sheet-foot >> role=button[name=/Confirm/]');
    await page2.waitForSelector('.toast');
  }
  await page2.waitForSelector('text=Bot 1');
  await page2.click(B('Record at-bat'));
  await page2.click(X('Hit'));
  await page2.click(X('Triple'));
  await page2.click('.sheet-foot >> role=button[name=/Confirm/]');
  await page2.click(B('Record at-bat'));
  await page2.click(X('Out'));
  await page2.click(X('Sacrifice fly'));
  await page2.click('.pos >> text=RF');
  await page2.click('.sheet-foot >> role=button[name="Next"]');
  await page2.click('.sheet-foot >> role=button[name=/Confirm/]');
  await page2.click('.live-actions >> role=button[name="End game"]');
  await page2.click(X('Mercy rule'));
  await page2.waitForSelector('text=Play log');
  await shot(page2, 'summary2');

  // Games list
  await page2.click('text=‹ Games');
  await page2.waitForSelector('text=Finished games');
  await shot(page2, 'home_games');

  // Export the weekend
  await page2.click('.tabbar >> text=Transfer');
  await page2.waitForSelector('text=Export games');
  const [download] = await Promise.all([page2.waitForEvent('download'), page2.click('text=Export the weekend')]);
  const zipPath = path.join(__dirname, 'weekend.zip');
  await download.saveAs(zipPath);
  log('exported', zipPath, fs.statSync(zipPath).size, 'bytes');
  await shot(page2, 'transfer');

  // Stats on phone
  await page2.click('.tabbar >> text=Stats');
  await page2.waitForSelector('text=Record');
  await shot(page2, 'stats_phone');
  await page2.click('text=E. Flesher');
  await page2.waitForSelector('text=Playing time');
  await shot(page2, 'eli_phone');

  // "Computer": fresh desktop context, import archive, import GameChanger CSV
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const d = await desk.newPage(); cur = d;
  d.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await d.goto(URL + '#/transfer');
  await d.waitForSelector('text=Import games');
  const input = d.locator('input[type=file][accept*="zip"]');
  await input.setInputFiles(zipPath);
  await d.waitForSelector('text=Import preview');
  await shot(d, 'import_preview');
  await d.click('.sheet-foot >> role=button[name="Import"]');
  await d.waitForSelector('text=Imported:');
  await shot(d, 'imported');
  // Import same archive again -> unchanged
  await input.setInputFiles(zipPath);
  await d.waitForSelector('text=Import preview');
  const unchanged = await d.locator('.pill:has-text("unchanged")').count();
  log('second import unchanged games:', unchanged);
  await d.click('.sheet-foot >> role=button[name="Cancel"]');

  // GameChanger CSV
  await d.click('text=Import a GameChanger season export');
  await d.waitForSelector('text=Import GameChanger season stats');
  await d.locator('input[type=file][accept*="csv"]').setInputFiles('/home/claude/dugout-dad/data/private/Oklahoma_Rattlers_13U_Fall_2026_Stats.csv');
  await d.waitForSelector('text=Detected layout');
  await d.fill('input[type=date] >> nth=0', '2026-10-25');
  await d.fill('input[type=date] >> nth=2', '2026-10-19');
  await shot(d, 'gc_wizard');
  await d.click('text=Import snapshot');
  await d.waitForSelector('text=Record', { timeout: 15000 });
  await shot(d, 'stats_desktop');
  await d.click('text=Imported (GameChanger)');
  await d.waitForSelector('text=Innings by position (imported)');
  await shot(d, 'stats_imported');
  await d.click('text=Batting');
  await d.click('text=Combined');
  await shot(d, 'stats_combined');
  await d.click('text=Position comparison');
  await d.waitForSelector('text=Shortstop');
  await shot(d, 'positions');
  await d.goto(URL + '#/stats/lineup');
  await d.waitForSelector('text=Lineup lab');
  await shot(d, 'lineup_lab');
  await d.goto(URL + '#/stats/pitching');
  await d.waitForSelector('text=Pitching workload');
  await shot(d, 'pitching');
  await d.goto(URL + '#/stats/tournaments');
  await d.waitForSelector('text=Tournaments');
  await shot(d, 'tournaments');
  // Eli page on desktop
  await d.goto(URL + '#/stats');
  await d.click('text=E. Flesher');
  await d.waitForSelector('text=Fielding by position');
  await shot(d, 'eli_desktop');
  // SQLite export
  await d.goto(URL + '#/transfer');
  const [dl2] = await Promise.all([d.waitForEvent('download'), d.click('text=Export SQLite database')]);
  const sqlitePath = path.join(__dirname, 'export.sqlite');
  await dl2.saveAs(sqlitePath);
  log('sqlite', fs.statSync(sqlitePath).size, 'bytes');

  // Offline check on the phone: go offline and reload
  await phone.setOffline(true);
  const page3 = await phone.newPage(); cur = page3;
  page3.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  try {
    await page3.goto(URL, { waitUntil: 'load', timeout: 15000 });
    await page3.waitForSelector('text=Finished games', { timeout: 10000 });
    log('OFFLINE RELOAD OK: app shell served by service worker, games listed');
    await shot(page3, 'offline_home');
  } catch (e) {
    log('OFFLINE RELOAD FAILED:', e.message);
  }
  await browser.close();
  log('done');
})().catch(async (e) => { console.error('UAT FAILED', e.message.split('\n')[0]); try { if (cur) { await cur.screenshot({ path: path.join(OUT, 'FAIL.png') }); console.log('URL', cur.url()); console.log('BODY', (await cur.locator('body').innerText()).slice(0, 800)); } } catch {} process.exit(1); });
