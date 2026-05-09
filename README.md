# CCC Invoice Automation

Standalone GitHub Actions scheduled job for creating monthly CCC invoice rows in Monday.com.

## What It Does

- Runs monthly on the 1st at 05:00 UTC, which is 06:00 in Lagos.
- Reads active contractors from the contractors board.
- Creates one invoice row per active contractor service.
- Skips invoice rows that already exist by invoice item name.
- Sets invoice status, due date, and service type during item creation.

## Deploy With GitHub Actions

1. Rotate the Monday API token that appeared in the exported n8n JSON.
2. In GitHub, open this repo's **Settings**.
3. Go to **Secrets and variables** -> **Actions**.
4. Under **Repository secrets**, add `MONDAY_API_TOKEN` with the rotated token.
5. Open the **Actions** tab.
6. Select **Monthly Invoice Row Creator**.
7. Click **Run workflow** once before relying on the schedule.

The workflow runs monthly at 05:00 UTC on the 1st of the month.

## Local Checks

```bash
npm install
npm run typecheck
npm run invoice:monthly
```

The local run requires `MONDAY_API_TOKEN`.
