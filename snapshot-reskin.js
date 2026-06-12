// CI screenshots of the reskinned screens at the prototype's exact canvas
// (1024x2224, dsf 1) so they pixel-diff 1:1 against the locked renders.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

(async () => {
  const srv = spawn('npx', ['--yes', 'serve', process.env.SNAP_DIST || 'dist', '-l', '8080'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 6000));
  fs.mkdirSync('reskin-shots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 2224 }, deviceScaleFactor: 1 });
  const shots = [
    ['home', 'http://localhost:8080/?reskin=home'],
    ['question_6s', 'http://localhost:8080/?reskin=question&t=6'],
    ['countdown', 'http://localhost:8080/?reskin=countdown&beat=3'],
    ['waiting', 'http://localhost:8080/?reskin=waiting&t=0'],
    ['results_nearmiss', 'http://localhost:8080/?reskin=results&outcome=nearmiss&at=race'],
    ['results_win_burst', 'http://localhost:8080/?reskin=results&outcome=win&at=burst'],
    ['history', 'http://localhost:8080/?reskin=history'],
    ['shell', 'http://localhost:8080/?reskin=shell'],
    ['profile_in', 'http://localhost:8080/?reskin=profile&auth=in'],
    // LIVE integration boot check: root URL (no ?reskin=) = ReskinApp wired to
    // the live server — verifies App.js's RESKIN swap renders home w/ real state
    // (balance/streak from device account; WS reachable from CI).
    ['live_root_home', 'http://localhost:8080/'],
  ];
  for (const [name, url] of shots) {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(5000); // fonts + images settle
    await page.screenshot({ path: `reskin-shots/${name}.png` });
    console.log('shot', name);
  }
  await browser.close();
  srv.kill();
  process.exit(0);
})();
