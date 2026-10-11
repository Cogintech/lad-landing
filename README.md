# ЛАД landing

Static landing page for `ladvdome.app`. No build or runtime package installation is needed.

## Early-access form

The form saves emails through a public Supabase Edge Function with server-side validation, a honeypot and database-backed rate limits. Set the **public** endpoint in `waitlist-config.js`:

- `endpoint`: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/waitlist-signup`

Deploy `index.html`, `waitlist-config.js`, `waitlist.js` and the existing assets. Missing configuration shows an explicit error; failed submissions retain the entered address. Repeated requests return the same success message without exposing whether an email is on the list.

Backend code lives in [`Cogintech/kukhnya-os`](https://github.com/Cogintech/kukhnya-os): migrations `020_early_access_waitlist.sql` and `021_waitlist_rate_limits.sql`, function `waitlist-signup`, and `scripts/invite-waitlist.mjs`. See `docs/waitlist/README.md` in that repository for deployment, sender verification and invitation instructions. Those files must be pushed/deployed before GitHub links to them will work.

Never add Supabase service-role or Resend keys to this repository. Only the public endpoint belongs in browser configuration. No email is sent on signup; the operator selects applicants and sends invitations later. Each invitation links to registration for the applicant's own home.

## Local preview and verification

```sh
python3 -m http.server 5190 --bind 127.0.0.1
```

Local form requests require localhost in the development backend's origin settings. For isolated browser tests, install Playwright outside this repo and run with system Chromium:

```sh
npm install --prefix /tmp/lad-waitlist-browser-tools --cache /workspace/.npm-cache --no-audit --no-fund playwright@1.58.2
NODE_PATH=/tmp/lad-waitlist-browser-tools/node_modules node scripts/test-waitlist-browser.cjs
```

The browser tests block external HTTPS requests and use a local API on a second origin. They verify real CORS preflights separately from signup POSTs, validation/failure/retry/success at 320px, 360px, 390px and 1280px, and submission with `AbortSignal.timeout` unavailable. They also check rate-limit messages, the honeypot, timeout recovery and that no Cloudflare challenge requests are attempted. No requests are sent to the real waitlist. Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`.

## Updating the existing deployment

Apply migration **021** to the existing Supabase project, then redeploy `waitlist-signup`, **then publish this landing version**. Do not rerun 020 if the table already exists. The old function requires a challenge token and will reject this new form. The updated function accepts submissions from both old and new clients during rollout.

No Turnstile site key, script, widget or server verification is used. The old `TURNSTILE_SECRET_KEY` can be removed after the function update. Retain `WAITLIST_ALLOWED_ORIGINS=https://ladvdome.app` and keep JWT verification disabled for this public endpoint.

The initial database limits are 30 submissions/minute and 500/day globally, plus 3/hour per normalized email, including duplicates. Rejected requests return 429 and preserve the entered email. These limits reduce simple abuse but a bot can exhaust shared quotas; tune them for campaigns. There is no automatic email send on this public endpoint.
