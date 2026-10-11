// Requires Playwright and a static server on port 5190. No live service requests.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');

const origin = 'http://127.0.0.1:5190';
const turnstileMock = `
  window.turnstile = {
    render: (selector, options) => {
      const el = document.createElement('div');
      el.id = 'test-turnstile';
      el.dataset.size = options.size;
      el.style.cssText = options.size === 'compact'
        ? 'width:150px;height:140px'
        : 'width:100%;min-width:300px;height:65px';
      document.querySelector(selector).appendChild(el);
      return 0;
    },
    getResponse: () => 'test-challenge',
    reset: () => {},
    remove: () => document.getElementById('test-turnstile').remove(),
  };
  window.addEventListener('DOMContentLoaded', () => window.ladTurnstileReady());
`;

async function assertWidgetFits(page, expectedSize) {
  await page.waitForFunction(size => document.querySelector('#test-turnstile')?.dataset.size === size, expectedSize);
  const fits = await page.evaluate(() => {
    const widget = document.querySelector('#test-turnstile').getBoundingClientRect();
    const container = document.querySelector('#signup-verification').getBoundingClientRect();
    return widget.left >= container.left && widget.right <= container.right + 0.5;
  });
  assert.ok(fits, 'Turnstile must fit inside its container, not just the viewport');
}

(async () => {
  // A real, local second origin exercises the browser's CORS preflight.
  // OPTIONS never parses or records a signup; only POST can change submissions.
  let state;
  const api = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Max-Age', '0');
    if (req.method === 'OPTIONS') {
      state.preflights++;
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    try { state.submissions.push(JSON.parse(body)); }
    catch { res.writeHead(400).end(); return; }
    if (state.hang) return; // The browser must abort this request using its timer.
    res.writeHead(state.fail ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(state.fail ? '{"error":"SAVE_FAILED"}' : '{"ok":true}');
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${api.address().port}/signup`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    for (const withoutTimeout of [false, true]) {
      for (const width of [320, 360, 390, 1280]) {
        state = { fail: true, hang: false, preflights: 0, submissions: [] };
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (withoutTimeout) await page.addInitScript(() => { AbortSignal.timeout = undefined; });
        // Inject public fixture configuration before the page's configuration script.
        // No request routing: Playwright routing bypasses browser preflights.
        await page.addInitScript(`
          Object.defineProperty(window, 'LAD_WAITLIST', {
            value: ${JSON.stringify({ endpoint, turnstileSiteKey: 'fixture' })},
          });
          ${turnstileMock}
        `);
        // Block all external services without request interception. The visible
        // Turnstile fixture is initialized on DOMContentLoaded instead.
        const network = await page.context().newCDPSession(page);
        await network.send('Network.enable');
        await network.send('Network.setBlockedURLs', { urls: ['https://*'] });
        await page.goto(origin);
        await assertWidgetFits(page, width < 380 ? 'compact' : 'flexible');
        if (width === 1280) {
          await page.setViewportSize({ width: 320, height: 900 });
          await assertWidgetFits(page, 'compact');
          await page.setViewportSize({ width, height: 900 });
          await assertWidgetFits(page, 'flexible');
        }
        await page.locator('#email').fill('invalid');
        await page.getByRole('button', { name: 'Записаться', exact: true }).click();
        await page.locator('#signup-status[data-kind="error"]').waitFor();
        assert.equal(state.submissions.length, 0);
        await page.locator('#email').fill('applicant@example.test');
        await page.getByRole('button', { name: 'Записаться', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#signup-status').textContent.includes('Ваш адрес остался'));
        assert.equal(await page.locator('#email').inputValue(), 'applicant@example.test');
        state.fail = false;
        await page.getByRole('button', { name: 'Записаться', exact: true }).click();
        await page.locator('#signup-status[data-kind="success"]').waitFor();
        assert.equal(await page.locator('#email').inputValue(), '');
        assert.equal(state.submissions.length, 2);
        assert.equal(state.submissions[1].turnstileToken, 'test-challenge');
        assert.ok(state.preflights > 0, 'Expected a real CORS preflight before the POST');

        if (withoutTimeout && width === 320) {
          // Accelerate only the application's 15-second timer; no wall-clock wait.
          await page.evaluate(() => {
            const nativeTimeout = window.setTimeout;
            window.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay === 15000 ? 100 : delay, ...args);
          });
          state.hang = true;
          await page.locator('#email').fill('timeout@example.test');
          await page.getByRole('button', { name: 'Записаться', exact: true }).click();
          await page.locator('#signup-status[data-kind="error"]').waitFor();
          assert.equal(await page.locator('#email').inputValue(), 'timeout@example.test');
          assert.equal(await page.getByRole('button', { name: 'Записаться', exact: true }).isEnabled(), true);
          state.hang = false;
          await page.getByRole('button', { name: 'Записаться', exact: true }).click();
          await page.locator('#signup-status[data-kind="success"]').waitFor();
        }
        assert.deepEqual(errors, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        console.log(`Waitlist passed at ${width}px, AbortSignal.timeout ${withoutTimeout ? 'absent' : 'present'}, real CORS preflight verified`);
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    api.closeAllConnections();
    await new Promise(resolve => api.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
