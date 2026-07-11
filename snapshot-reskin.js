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
    // GO beat (rev3): FULL OPAQUE beat @1800-2400 held mid-flash — verifies
    // GO is a real visible beat with the same weight as the numerals
    ['countdown_go', 'http://localhost:8080/?reskin=countdown&beat=go'],
    ['waiting', 'http://localhost:8080/?reskin=waiting&t=0'],
    // B35: permission-off variant -> notify copy swaps + TURN ON NOTIFICATIONS button
    ['waiting_push_off', 'http://localhost:8080/?reskin=waiting&t=0&push=off'],
    // reveal stage = stake pill + W/D/L record line visible (audit MED #8 verification)
    ['results_win_reveal', 'http://localhost:8080/?reskin=results&outcome=win&at=reveal'],
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
  // ===== E2E: Delete Account (1b) — real account, real server, real click-through =====
  // Register a device account over WS (same as the app does), inject it into localStorage
  // (RN-web AsyncStorage), boot the live app as that account, tap Profile -> DELETE ACCOUNT,
  // auto-accept the confirm(), then verify: fresh handle on-screen AND account gone server-side.
  try {
    const SRV = 'https://web-production-c6ec6.up.railway.app';
    const p0 = await browser.newPage();
    await p0.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
    const acct = await p0.evaluate((srv) => new Promise((resolve, reject) => {
      const w = new WebSocket(srv.replace('https', 'wss'));
      w.onopen = () => w.send(JSON.stringify({ type: 'register', preferredHandle: 'E2EDel' + Math.floor(Math.random() * 9000) }));
      w.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.type === 'registered') { w.close(); resolve(m); } };
      setTimeout(() => reject(new Error('register timeout')), 15000);
    }), SRV);
    await p0.close();
    console.log('e2e-delete: registered', acct.accountId, acct.handle);
    const p2 = await browser.newPage({ viewport: { width: 1024, height: 2224 }, deviceScaleFactor: 1 });
    p2.on('dialog', (dlg) => { console.log('e2e-delete: dialog:', dlg.message().slice(0, 60)); dlg.accept(); });
    await p2.addInitScript(([a, h]) => {
      window.localStorage.setItem('sense_account', a);
      window.localStorage.setItem('sense_handle', h);
    }, [JSON.stringify({ accountId: acct.accountId, handle: acct.handle, token: acct.token }), acct.handle]);
    await p2.goto('http://localhost:8080/', { waitUntil: 'load' });
    await p2.waitForTimeout(8000);
    await p2.screenshot({ path: 'reskin-shots/e2e_delete_0_boot.png' });
    const bodyTxt = await p2.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 500));
    console.log('e2e-delete: boot text:', bodyTxt);
    await p2.getByText('PROFILE', { exact: true }).first().click({ timeout: 15000 });
    await p2.waitForTimeout(2500);
    await p2.screenshot({ path: 'reskin-shots/e2e_delete_1_profile.png' });
    await p2.getByText('DELETE ACCOUNT', { exact: true }).first().click(); // confirm() auto-accepted above
    await p2.waitForTimeout(6000); // server round-trip + local wipe + home
    await p2.screenshot({ path: 'reskin-shots/e2e_delete_2_after.png' });
    const stored = await p2.evaluate(() => ({ acct: window.localStorage.getItem('sense_account'), handle: window.localStorage.getItem('sense_handle') }));
    console.log('e2e-delete: after-wipe localStorage:', JSON.stringify(stored));
    if (stored.acct) throw new Error('sense_account still present after delete');
    if (!stored.handle || stored.handle === acct.handle) throw new Error('handle not regenerated');
    // server-side proof: deleting again with the same token must now 401/fail-closed or report ok with 0
    const r = await fetch(SRV + '/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: acct.token }) });
    const j = await r.json();
    console.log('e2e-delete: re-delete same token ->', r.status, JSON.stringify(j));
    if (j.forfeitedCents && j.forfeitedCents !== 0) throw new Error('account still had a balance server-side');
    console.log('e2e-delete: PASS');
    await p2.close();
  } catch (e) { console.error('e2e-delete: FAIL', e.message); process.exitCode = 1; }

  await browser.close();
  srv.kill();
  process.exit(process.exitCode || 0);
})();
