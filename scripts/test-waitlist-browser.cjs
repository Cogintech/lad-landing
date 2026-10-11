// Requires Playwright; all external requests are mocked. Serve the repo on port 5190.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [], submissions = [];
      let fail = true;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/waitlist-config.js') return route.fulfill({ contentType: 'application/javascript', body: "window.LAD_WAITLIST={endpoint:'https://waitlist.example.test/signup',turnstileSiteKey:'fixture'};" });
        if (url.hostname === 'challenges.cloudflare.com') return route.fulfill({ contentType: 'application/javascript', body: "window.turnstile={render:()=>0,getResponse:()=> 'test-challenge',reset:()=>{}}; window.ladTurnstileReady();" });
        if (url.hostname === 'waitlist.example.test') {
          submissions.push(route.request().postDataJSON());
          await new Promise(resolve => setTimeout(resolve,100));
          return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: fail ? '{"error":"SAVE_FAILED"}' : '{"ok":true}', headers: { 'access-control-allow-origin': '*' } });
        }
        if (url.origin !== 'http://127.0.0.1:5190') return route.abort();
        return route.continue();
      });
      await page.goto('http://127.0.0.1:5190');
      await page.locator('#email').fill('invalid');
      await page.getByRole('button', { name: 'Записаться', exact: true }).click();
      await page.locator('#signup-status[data-kind="error"]').waitFor();
      assert.equal(submissions.length, 0);
      await page.locator('#email').fill('applicant@example.test');
      await page.getByRole('button', { name: 'Записаться', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#signup-status').textContent.includes('Ваш адрес остался'));
      assert.equal(await page.locator('#email').inputValue(), 'applicant@example.test');
      fail = false;
      await page.getByRole('button', { name: 'Записаться', exact: true }).click();
      await page.locator('#signup-status[data-kind="success"]').waitFor();
      assert.equal(await page.locator('#email').inputValue(), '');
      assert.equal(submissions.length, 2);
      assert.equal(submissions[1].turnstileToken, 'test-challenge');
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`Landing waitlist browser checks passed at ${width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
