# Configuration

| Variable              | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection (`yarn db:up` starts a local container)          |
| `CRON_SECRET`         | Bearer token required by `/api/cron/ingest`                          |
| `JETSTREAM_URL`       | Jetstream v2 host (default `https://jetstream.us-east.bsky.network`) |
| `JETSTREAM_API_TOKEN` | Optional. Enables replay from the archive                            |

## After a deploy

`.github/workflows/ingest-after-deploy.yml` calls `/api/cron/ingest` once whenever Vercel reports a successful production deployment, so records that changed while the app was being replaced are picked up straight away instead of at the next scheduled run. It needs:

- a repository secret `CRON_SECRET`, with the same value as in Vercel (the workflow fails with a message if it's missing)
- optionally a repository variable `SITE_URL` if production isn't served from `https://invite.polhem.us`; the workflow calls the production domain rather than the deployment's own URL, which Vercel may protect

The Vercel project must be connected to the GitHub repository, which is what makes Vercel report deployments there. Preview deployments are skipped.
