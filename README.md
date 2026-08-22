# Claim Center · Global Operations V5

Clean production rewrite for Cloudflare Workers + D1. The business contract is derived from **Claim CCD.xlsm** and **Claim_Data_2026_Jul.xlsx**.

## Runtime
- `worker/v5-entry.js` — API, auth, claim logic, reference/claim numbering, masters, users, audit
- `site/index.html` — Global Operations UI
- `site/styles.css` — responsive light/dark design system
- `site/app.js` — client workflow
- `migrations/0007_global_ops_v5.sql` — clean D1 schema for empty/new database

## CCD contract
Exports exactly **43 columns A:AQ** using the Excel names/positions, including duplicated `Format Type` at X and AF. D1 uses distinct physical columns (`format_type` and `store_format`) while import/export preserves the Excel layout.

## Numbering
- Claim: `CM-YYYYMM######`
- DC Reference: `CCD#######`
- TP Reference: `TF#######`
- Reference is created only for `Accept` + `DC/TP`.

## Deployment
Cloudflare build command: `npm run check && npm test`
Cloudflare deploy command: `npm run deploy`

`npm run deploy` applies remote D1 migrations before deploying the Worker. `0007` intentionally rebuilds the runtime schema because the target D1 is empty.
