# ЛАД landing

Static landing page for `ladvdome.app`. No build or runtime package installation is needed.

## Early-access form

The form saves emails through a public Supabase Edge Function with Cloudflare Turnstile verification. Set **public** values in `waitlist-config.js`:

- `endpoint`: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/waitlist-signup`
- `turnstileSiteKey`: the site's public Turnstile key

Deploy `index.html`, `waitlist-config.js`, `waitlist.js` and the existing assets. Missing configuration shows an explicit error; failed submissions retain the entered address. Repeated requests return the same success message without exposing whether an email is on the list.

Backend code lives in [`Cogintech/kukhnya-os`](https://github.com/Cogintech/kukhnya-os): migration `020_early_access_waitlist.sql`, function `waitlist-signup`, and `scripts/invite-waitlist.mjs`. See `docs/waitlist/README.md` in that repository for deployment, sender verification and invitation instructions. Those files must be pushed/deployed before GitHub links to them will work.

Never add Supabase service-role keys, Resend keys or Turnstile secrets to this repository. Only the public endpoint and site key belong in browser configuration. No email is sent on signup; the operator selects applicants and sends invitations later. Each invitation links to registration for the applicant's own home.

## Local preview and verification

```sh
python3 -m http.server 5190 --bind 127.0.0.1
```

Local form requests require localhost allowed in the test Turnstile widget and the backend's origin settings. Do not disable verification on the production function. For isolated browser tests, install Playwright outside this repo and run with system Chromium:

```sh
npm install --prefix /tmp/lad-waitlist-browser-tools --cache /workspace/.npm-cache --no-audit --no-fund playwright@1.58.2
NODE_PATH=/tmp/lad-waitlist-browser-tools/node_modules node scripts/test-waitlist-browser.cjs
```

The browser tests block external HTTPS requests and use a visible Turnstile fixture plus a local API on a second origin. They verify real CORS preflights separately from signup POSTs, validation/failure/retry/success at 320px, 360px, 390px and 1280px, compact widget sizing after resize, and submission with `AbortSignal.timeout` unavailable. A stalled request also checks timeout recovery. No requests are sent to the real waitlist. Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`.
