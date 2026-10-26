# Dugout Dad on your iPhone

## Why it needs a web address

To install as an app and open with no signal, the iPhone needs the app served over HTTPS once. After that first load, the service worker keeps the whole app on the phone.

## Where it lives

The app is published at **https://doc-jpg.github.io/dugout-dad/** from the repository https://github.com/Doc-jpg/dugout-dad. Every push to `main` redeploys it.

## Option A: GitHub Pages (already set up)

1. Create a GitHub repository (for example `dugout-dad`) and push this folder to its `main` branch. The repository can be private if the account's plan allows Pages on private repos; otherwise public is fine, the code contains no roster data (`data/private/` is ignored).
2. In the repository: Settings, Pages, Source: **GitHub Actions**. The included workflow (`.github/workflows/pages.yml`) builds, runs the tests and deploys on every push.
3. After the first run finishes, the app is at `https://<owner>.github.io/<repo>/`.

## Option B: any static host

Run `BASE_PATH=/ npm run build` (or just `npm run build`) and upload the `dist/` folder to Netlify, Cloudflare Pages, Vercel, or any web space. The folder is self-contained.

## Install on the phone

1. Open the address in **Safari** (not Chrome; iOS only installs web apps from Safari).
2. Tap the Share button, then **Add to Home Screen**, then Add.
3. Open Dugout Dad from the home screen once while online so it finishes caching.
4. Settings in the app should now say "Running as an installed app". Tap "Request persistent storage" if it is offered.

Test it: turn on Airplane Mode, open the app from the home screen, start a game. It should behave exactly the same.

## Day to day

- Score from the home-screen app. Each finished game is saved on the phone immediately.
- Sunday night: Transfer, **Export the weekend**. The iPhone share sheet opens; choose Files (iCloud Drive), AirDrop to the laptop, or Mail.
- The phone keeps every game until you delete it. Storage use is tiny (a game is a few hundred kilobytes at most).

## Updates

When a new version is published, the app updates itself the next time it is opened with a connection. Your data is untouched by updates (it lives in the browser database, not in the app files).

## If something looks wrong

- "Storage is not yet marked persistent": install to the home screen and keep exporting after each weekend.
- The app opens to a blank page offline: open it once online so the service worker can finish installing, then try again.
- Lost the phone, or Safari cleared data: import your latest weekend ZIPs on the laptop; nothing exported is lost.
