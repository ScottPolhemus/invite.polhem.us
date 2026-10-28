# Configuration

| Variable              | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection (`yarn db:up` starts a local container)          |
| `CRON_SECRET`         | Bearer token required by `/api/cron/ingest`                          |
| `JETSTREAM_URL`       | Jetstream v2 host (default `https://jetstream.us-east.bsky.network`) |
| `JETSTREAM_API_TOKEN` | Optional. Enables replay from the archive                            |
