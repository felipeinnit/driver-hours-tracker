# Driver Hours Tracker

A small, responsive, client-side web app for recording driving, other work, availability and break/rest activity. Designed for deployment on GitLab Pages.

## Files

- `index.html` — page structure
- `style.css` — responsive layout
- `app.js` — activity timer, history, threshold prompts and CSV export
- `manifest.json`, `sw.js` and app icons — installable app metadata and notification support
- `.gitlab-ci.yml` — GitLab Pages deployment pipeline

## Deploy to GitLab Pages

1. Create a blank GitLab project named `driver-hours-tracker`.
2. Upload/commit the app files, manifest, service worker, icons and `.gitlab-ci.yml` to the repository root.
3. Ensure the default branch is the branch you commit to (commonly `main`).
4. Open **Build > Pipelines** and wait for the `pages` job to pass.
5. Open **Deploy > Pages** to find the published website URL.

GitLab Pages documentation: https://docs.gitlab.com/user/project/pages/

GitLab Pages serves only the static tracker. Background push notifications require the Node server below; open the app from that server's HTTPS URL to use them.

## Background push notifications

The push server must stay running and the app must be served from the same HTTPS origin. A generic VPS can run the included Docker image:

1. Run `npm ci`, then generate VAPID keys with `npm run generate-vapid-keys`. Generate them once and keep the same keys for future deployments.
2. Copy `.env.example` to `.env`, add the generated public and private keys, and set `VAPID_SUBJECT` to a contact email.
3. Build and run the image with a persistent data volume:

   ```sh
   docker build -t driver-hours-tracker .
   docker run -d --restart unless-stopped --name driver-hours-tracker \
     -p 8080:8080 --env-file .env \
     -v driver-hours-data:/app/data driver-hours-tracker
   ```

4. Put the server behind an HTTPS reverse proxy and use that HTTPS address on the phone. Keep `.env` private and preserve the data volume; it contains push subscriptions and test state. The VAPID private key must never be committed or shared.

Selecting **Start background notification test** sends a push immediately and then every 15 seconds until stopped. Push services and mobile operating systems may delay or throttle delivery. The VPS must remain online; a local development server cannot deliver while the computer is off.

## Storage and privacy

Activity history is stored in `localStorage` in the current browser on the current device. It is not synced between devices and can be lost if browser site data is cleared. Use **Export CSV** for a backup. Do not enter sensitive personal information into notes.

## Mobile installation and notification test

On iPhone or iPad, open the HTTPS app in Safari, use **Share > Add to Home Screen**, then open the installed app and allow notifications. Background delivery depends on the always-on push server and can still be delayed by the browser or phone.

## Important limitations

This is a prototype and a personal tracking aid, not a certified tachograph or legal compliance system. It does not determine exemptions, vehicle eligibility, working-time rules, split-break qualification, reduced/regular rest, compensation, ferry/train interruptions, multi-manning, AETR details, or every mixed-operation interaction. Some summary calculations are deliberately simple estimates based on the entries recorded. Never use the app to replace required tachograph records or official records, and independently verify all obligations before relying on any result.

Official references:
- Goods vehicle drivers' hours: https://www.gov.uk/guidance/drivers-hours-goods-vehicles
- GB domestic rules: https://www.gov.uk/drivers-hours/gb-domestic-rules
- Driving under both rule sets: https://www.gov.uk/drivers-hours/driving-under-both-assimilated-or-aetr-rules-and-gb-domestic-rules
