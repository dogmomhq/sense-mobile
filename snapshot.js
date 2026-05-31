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
    await page.waitForTimeout(3800); // reveal -> explode
    await shot(n);
  }

  // both-correct time-race (capture mid-animation)
  await fresh();
  await page.evaluate(() => window.__sense({ result: 'win', myCorrect: true, oppCorrect: true, myTime: 800, oppTime: 1500 }));
  await page.waitForTimeout(2400);
  await shot('06_race');

  // profile
  await fresh();
  try { await page.getByText('Profile').last().click({ timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(700);
  await shot('07_profile');

  await browser.close();
  try { srv.kill(); } catch (e) {}
  console.log('snapshots done');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
