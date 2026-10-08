# M0E4 Real-Browser Smoke Test

M0E4 adds one deliberately small real-browser tripwire on top of the Node characterization and simulation suites.

## What it verifies

After `npm run build`, the smoke test:

1. serves the checked-out game over a local HTTP server;
2. launches a fresh headless Chrome session through ChromeDriver;
3. proves uncaught JavaScript exceptions are visible to the harness with a deliberate throw-probe;
4. CI performs a negative-control run that injects `M0E4_INJECTED_STARTUP_FAILURE` into the served real `index.html` and requires the normal smoke command to exit nonzero;
5. loads the real built `index.html` and generated game assets;
6. requires the main game surface and Evolution tab to render;
7. requires the fresh-game RNA action to be visible;
8. clicks RNA twice and requires the DNA action to unlock;
9. fails on severe browser/application errors.

It does **not** validate simulation math through the UI. The M0E1-M0E3 simulation/oracle work remains authoritative for that.

## Browser-log and teardown hardening

Chrome's browser-log endpoint is asynchronous and drains entries when read. The harness therefore does not rely on a single sleep followed by a single log read:

- the deliberate uncaught-exception probe polls until its marker is observed, then keeps draining for a bounded settling window;
- the injected startup-failure negative control uses the same marker-aware polling and receives its full post-marker settling window even when the marker arrives near the initial observation deadline;
- the normal successful smoke drains browser logs repeatedly for a bounded observation window before declaring the page clean;
- failure diagnostics also perform a short bounded drain so late severe errors are less likely to disappear from the report.

All WebDriver, browser-log, child-process and HTTP-server waits remain explicitly bounded. Cleanup attempts session deletion, process-tree termination and HTTP-server shutdown in sequence even when an earlier phase fails, with forced cleanup and a final harness watchdog as backstops.

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

GitHub Actions provisions a matching ChromeDriver, first proves the smoke command rejects an injected exception in the actual served Evolve startup page, and then runs the normal passing smoke test after the normal build verification.

## Boundaries

This is intentionally not a full end-to-end suite. Broader selector/view-model testing belongs in later milestones, and mobile lifecycle/viewport coverage remains deferred.
