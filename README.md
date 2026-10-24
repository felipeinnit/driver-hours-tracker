# Driver Hours Tracker

A small, responsive, client-side web app for recording driving, other work, availability and break/rest activity. Designed for deployment on GitLab Pages.

## Files

- `index.html` — page structure
- `style.css` — responsive layout
- `app.js` — activity timer, history, threshold prompts and CSV export
- `.gitlab-ci.yml` — GitLab Pages deployment pipeline

## Deploy to GitLab Pages

1. Create a blank GitLab project named `driver-hours-tracker`.
2. Upload/commit these four files to the repository root (including the leading dot in `.gitlab-ci.yml`).
3. Ensure the default branch is the branch you commit to (commonly `main`).
4. Open **Build > Pipelines** and wait for the `pages` job to pass.
5. Open **Deploy > Pages** to find the published website URL.

GitLab Pages documentation: https://docs.gitlab.com/user/project/pages/

## Storage and privacy

Activity history is stored in `localStorage` in the current browser on the current device. It is not synced between devices and can be lost if browser site data is cleared. Use **Export CSV** for a backup. Do not enter sensitive personal information into notes.

## Important limitations

This is a prototype and a personal tracking aid, not a certified tachograph or legal compliance system. It does not determine exemptions, vehicle eligibility, working-time rules, split-break qualification, reduced/regular rest, compensation, ferry/train interruptions, multi-manning, AETR details, or every mixed-operation interaction. Some summary calculations are deliberately simple estimates based on the entries recorded. Never use the app to replace required tachograph records or official records, and independently verify all obligations before relying on any result.

Official references:
- Goods vehicle drivers' hours: https://www.gov.uk/guidance/drivers-hours-goods-vehicles
- GB domestic rules: https://www.gov.uk/drivers-hours/gb-domestic-rules
- Driving under both rule sets: https://www.gov.uk/drivers-hours/driving-under-both-assimilated-or-aetr-rules-and-gb-domestic-rules
