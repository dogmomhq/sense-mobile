// CI screenshots of the reskinned screens at the prototype's exact canvas
// (1024x2224, dsf 1) so they pixel-diff 1:1 against the locked renders.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

(async () => {
  const srv = spawn('npx', ['--yes', 'serve', 'dist', '-l', '8080'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 6000));
  fs.mkdirSync('reskin-shots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 2224 }, deviceScaleFactor: 1 });
  const shots = [
    ['home', 'http://localhost:8080/?reskin=home'],
    ['question_6s', 'http://localhost:8080/?reskin=question&t=6'],
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
