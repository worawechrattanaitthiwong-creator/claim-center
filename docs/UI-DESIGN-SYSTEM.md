# Claim Center — Production Connection v1

Claim Center now uses one production path only. Business rules and the Claim CCD data contract remain unchanged.

## Single source of truth

Production connection:

`main → wrangler.jsonc → worker/production.js → public assets + API → D1 claim-center`

There is no production `app-v2.js` wrapper anymore.

`run_worker_first` is enabled so every request reaches `worker/production.js` before Static Assets. This makes the live build deterministic and observable.

## Live verification

`GET /api/build` returns the production identity:

- build: `2026-08-21-main-reconnect-v1`
- branch: `main`
- entrypoint: `worker/production.js`
- database: `claim-center`

GitHub Actions calls this endpoint after deployment and fails the deployment if the live Worker does not return the expected build.

## Frontend loading

`worker/production.js` serves `/app.js` from `public/app.js` and loads the required frontend modules before the legacy application body executes:

- `pro-ui.js`
- `master-validation.js`
- `master-validation-hooks.js`
- `ccd-adapter.js`
- `ops-dashboard.js`
- Historical Import modules

The response uses `Cache-Control: no-store` and carries `X-Claim-Build`.

## Appearance

The application supports two user-selectable modes:

- Light
- Dark

The selected mode is persisted with `claim-center-theme` in browser local storage.

## Navigation

- Validation is a first-class workspace destination.
- Pivot Table is retired from the visible UI while its legacy DOM remains hidden temporarily so old event binding cannot break unrelated Claim logic.
- Master Article weekly replacement remains Admin-only under Master Data.

## Business logic retained

The reconnection does not change:

- Claim CCD A:AQ 43-column contract
- Claim / Reference running numbers
- duplicate protection
- status and WHO logic
- Dashboard rule: 1 Transport = 1 Case
- price from MasterArticle AJ `ITEM_VALUE`
- RunValidation source E = Article + O = Reference
- Historical Import
- user permissions and audit behavior

## CI protection

CI verifies the single production entrypoint, `run_worker_first`, `/api/build`, Validation shell, Pivot retirement, and Light/Dark theme contracts before deployment.
