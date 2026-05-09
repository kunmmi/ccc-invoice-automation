# CCC Invoice Automation

Standalone Render Cron Job for creating monthly CCC invoice rows in Monday.com.

## What It Does

- Runs monthly on the 1st at 05:00 UTC, which is 06:00 in Lagos.
- Reads active contractors from the contractors board.
- Creates one invoice row per active contractor service.
- Skips invoice rows that already exist by invoice item name.
- Sets invoice status, due date, and service type during item creation.

## Deploy To Render

1. Rotate the Monday API token that appeared in the exported n8n JSON.
2. Push this folder to a new GitHub repo.
3. In Render, create a new Blueprint from that repo.
4. Set `MONDAY_API_TOKEN` to the rotated token when prompted.
5. Trigger a manual run once from Render before relying on the schedule.

## Local Checks

```bash
npm install
npm run typecheck
npm run invoice:monthly
```

The local run requires `MONDAY_API_TOKEN`.
