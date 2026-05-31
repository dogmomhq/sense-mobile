// Headless screenshots of every key screen (run in CI). Serves the web export,
// drives the ?test hook to hit each result variant, screenshots to snapshots/.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

(async () => {
  const srv = spawn('npx', ['--yes', 'serve', 'dist', '-l', '8080'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 6000));
  fs.mkdirSync('snapshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const shot = (n) => page.screenshot({ path: `snapshots/${n}.png` });
  const fresh = async () => { await page.goto('http://localhost:8080/?test=1', { waitUntil: 'load' }); await page.waitForTimeout(1800); };

  await fresh();
  await shot('01_home');

  // Play screen (click RUN IT BACK, wait past the 3-2-1 countdown)
  try { await page.getByText('RUN IT BACK').last().click({ timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(3200);
  await shot('02_play');

  const variants = [
    ['03_win',  { result: 'win',  myCorrect: true,  oppCorrect: false, myTime: 900 }],
    ['04_loss', { result: 'loss', myCorrect: false, oppCorrect: true,  oppTime: 1100 }],
    ['05_draw', { result: 'draw', myCorrect: false, oppCorrect: false }],
  ];
  for (const [n, s] of variants) {
    await fresh();
    await page.evaluate(sc => window.__sense(sc), s);
    await page.waitForTimeout(4400); // reveal(2800) -> explode -> banner(+180) -> card(+580) -> buttons(+980) all settled
    await shot(n);
  }

  // explosion-stagger proof: banner has sprung in but the card + buttons have NOT arrived yet
  await fresh();
  await page.evaluate(() => window.__sense({ result: 'win', myCorrect: true, oppCorrect: false, myTime: 900 }));
  await page.waitForTimeout(3150); // explode(2800)+~350ms: burst done, banner springing in, card(+580)/buttons(+980) still hidden
  await shot('09_explode_mid');

  // explosion SEQUENCE — rapid frames through the whole explosion for frame-by-frame motion comparison vs web
  await fresh();
  await page.evaluate(() => window.__sense({ result: 'win', myCorrect: true, oppCorrect: false, myTime: 900 }));
  await page.waitForTimeout(2800); // reveal -> explode start (flash t0)
  for (let k = 0; k < 16; k++) { await shot('11_exp_' + String(k).padStart(2, '0')); await page.waitForTimeout(70); }

  // both-correct time-race. Reveal hands off to the race at 2400ms, then the
  // race ticker runs 2000ms. Capture mid-fill (~1100ms in) and again once settled.
  await fresh();
  await page.evaluate(() => window.__sense({ result: 'win', myCorrect: true, oppCorrect: true, myTime: 800, oppTime: 1500 }));
  await page.waitForTimeout(3300); // ~900ms into the 2000ms race: bars filling, times counting, shake building
  await shot('06_race');
  // shake burst: rapid frames through the climax to verify the jitter walks on x/y/rotation and builds intensity
  for (let k = 0; k < 8; k++) { await shot('10_shake_' + String(k).padStart(2, '0')); await page.waitForTimeout(60); }
  await page.waitForTimeout(300); // ~4200ms: race just settled — winner bar/time green, gap locked (before the +700ms handoff to explode)
  await shot('08_race_end');

  // profile
  await fresh();
  try { await page.getByText('Profile').last().click({ timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(700);
  await shot('07_profile');

  // === NEW online-parity tab screens ===
  await fresh();
  try { await page.getByText('Challenge').last().click({ timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(700);
  await shot('12_challenge');

  await fresh();
  try { await page.getByText('Hosts').last().click({ timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(3000); // leaderboard fetches live /api/leaderboard
  await shot('13_leaderboard');

  await fresh();
  try { await page.getByText('History').last().click({ timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(700);
  await shot('14_history');

  await fresh();
  await shot('15_home_nav'); // confirms the 5-tab bottom nav

  await browser.close();
  try { srv.kill(); } catch (e) {}
  console.log('snapshots done');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
