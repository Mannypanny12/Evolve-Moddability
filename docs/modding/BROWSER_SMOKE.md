# M0E4 Real-Browser Smoke Test

M0E4 adds one deliberately small real-browser tripwire on top of the Node characterization and simulation suites.

## What it verifies

After `npm run build`, the smoke test:

1. serves the checked-out game over a local HTTP server;
2. launches a fresh headless Chrome session through ChromeDriver;
3. proves uncaught JavaScript exceptions are visible to the harness with a deliberate throw-probe;
4. loads the real built `index.html` and generated game assets;
5. requires the main game surface and Evolution tab to render;
6. requires the fresh-game RNA action to be visible;
7. clicks RNA twice and requires the DNA action to unlock;
8. fails on severe browser/application errors.

It does **not** validate simulation math through the UI. The M0E1-M0E3 simulation/oracle work remains authoritative for that.

## External bootstrap dependencies

The inherited page loads several blocking runtime libraries from external CDNs. M0E4 keeps the production page unchanged, but avoids muddy CI diagnostics:

- blocking external scripts are preflighted before Chrome starts, with bounded retries;
- nonessential Google Fonts/analytics requests are blocked in the browser smoke session;
- failures tied to critical external bootstrap hosts are reported separately from application/browser failures.

This means a CDN outage cannot masquerade as an application regression, while a bad production CDN URL or integrity/bootstrap failure still causes the real-browser smoke to fail.

## Running locally

Build first:

```bash
npm ci
npm run build
```

Then make sure a compatible Chrome/Chromium and `chromedriver` are on `PATH`, and run:

```bash
npm run test:browser
```

GitHub Actions provisions a matching ChromeDriver automatically and runs the smoke test after the normal build verification.

## Boundaries

This is intentionally not a full end-to-end suite. Broader selector/view-model testing belongs in later milestones, and mobile lifecycle/viewport coverage remains deferred.
