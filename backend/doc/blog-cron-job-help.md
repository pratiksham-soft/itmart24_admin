# Blog Cron Job Help

## Purpose

The Blog Cron Job feature lets admin users:

- create reusable blog generation jobs
- assign one or more blog categories
- add manual topics for each category
- define how many blogs to generate per category
- save preferred research source links
- select a reusable blog template
- run jobs manually for testing
- activate jobs for automatic scheduled execution

Blog Manager data uses Postgres only.

## Main Pages

- `Marketing > Blog Manager > Jobs`
- `Marketing > Blog Manager > Blogs`

## How It Works

Each job contains:

- job name
- cron schedule
- status: `Active` or `Inactive`
- category configuration
- topics per category
- preferred source URLs
- template/settings

Automatic execution only applies to jobs with status `Active`.

Inactive jobs:

- are saved in Postgres
- are visible in the Jobs page
- are not scheduled automatically
- cannot be run with `Run Once` until activated

## Create a Blog Job

1. Open `Marketing > Blog Manager > Jobs`.
2. Click `Create Job`.
3. Enter `Job Name`.
4. Enter a valid cron expression.
5. Select one or more blog categories.
6. For each category:
   - set `Blogs Count`
   - add one or more topics
7. Add preferred source links if needed.
8. Select or save a blog template.
9. Choose job status.

Recommended:

- keep new jobs as `Inactive` until configuration is fully reviewed
- add enough pending topics for each selected category
- confirm category names match the intended Shopify blog/category names

## Status Rules

### Inactive

- default safe state
- not auto-scheduled
- not auto-run on backend startup
- blocked from `Run Once`

### Active

- loaded by backend scheduler
- eligible for cron-based automatic execution
- can be tested manually with `Run Once`

## Run Once

Use `Run Once` to test a job manually.

Current safety behavior:

- `Run Once` is blocked if the job is `Inactive`
- activate the job first, then run it
- the same job cannot overlap with another still-running execution

After a run finishes, the page shows a summary like:

- total topics processed
- success count
- failure count
- skipped count
- rate-limit count
- quota/billing-related error count when detectable

Example:

`Processed 2 topic(s). Success: 0. Failure: 2.`

That means the job started, selected two topics, and both failed during processing.

## Automatic Cron Execution

When backend starts:

1. Postgres connection is initialized.
2. Blog Manager tables are verified/created if missing.
3. Scheduler loads only jobs where status = `Active`.
4. Inactive jobs are skipped.

The scheduler does not auto-run a job immediately after creation.

The scheduler does not auto-run inactive jobs.

## Topic Workflow

Topics are managed per category.

Expected flow:

1. Add topics with `pending` status.
2. Activate the job.
3. Run manually or wait for cron trigger.
4. On successful generation, topic is marked as `used`.

OpenAI requests are processed one topic at a time.

Between content-generation requests, the backend waits using:

- `BLOG_OPENAI_REQUEST_DELAY_MS`

If OpenAI returns a temporary error such as `429`, `500`, `502`, `503`, `504`, or a timeout/network failure:

- the backend retries with exponential backoff
- `retry-after` is respected when provided
- logs include safe error details without exposing secrets

If a category has no pending topics:

- that category is skipped

If all categories have no pending topics:

- nothing is generated

## Blog Output

Generated blog records are saved in Postgres in `blog_posts`.

The Blogs page lets you:

- filter by category
- filter by date range
- view blog details
- edit saved blog records
- delete saved blog records

## Required Services

For successful generation, the backend must be able to reach:

- Postgres
- OpenAI API
- Shopify Admin API

If Postgres is unreachable, Blog Manager list APIs will fail.

If OpenAI fails, runs may process topics but still end with failures.

If Shopify blog lookup fails, category mapping may fail.

## Common Troubleshooting

### 1. Jobs / Blogs / Templates page shows 500

Check backend logs for:

- `PostgreSQL connection failed`
- `timeout expired`
- host / port / db startup logs

If Postgres host is not reachable, the Blog Manager APIs cannot return data.

### 2. Run Once says success `0` and failure `2`

Possible causes:

- OpenAI request failed
- OpenAI rate limit or quota/billing restriction
- Shopify blog/category could not be matched
- selected category has invalid mapping
- required template/settings are incomplete
- topic/content validation failed

Check backend logs and `blog_job_run_logs`.

If logs show `OpenAI returned 429`, possible causes include:

- burst requests
- rate limit reached
- insufficient quota
- billing not active
- usage cap reached

### 3. Job does not run automatically

Verify:

- job status is `Active`
- cron expression is valid
- backend is running
- scheduler loaded active jobs on startup

### 4. Job should not run yet

Set status to `Inactive`.

Inactive jobs are skipped by the scheduler.

## Recommended Admin Workflow

1. Create job as `Inactive`.
2. Add categories and pending topics.
3. Save template/settings.
4. Review cron expression carefully.
5. Change status to `Active`.
6. Use `Run Once` to verify behavior.
7. Review generated blogs in `Marketing > Blog Manager > Blogs`.
8. Keep job active only when ready for automatic scheduling.

## Cron Example

Example:

`0 9 * * *`

Meaning:

- every day
- at 9:00

## Data Tables Used

The feature uses these Postgres tables:

- `blog_jobs`
- `blog_job_categories`
- `blog_job_topics`
- `blog_job_source_links`
- `blog_templates`
- `blog_posts`
- `blog_job_runs`
- `blog_job_run_logs`

## Environment Variables

Blog automation pacing and retry controls:

- `BLOG_OPENAI_REQUEST_DELAY_MS=300000`
- `BLOG_OPENAI_MAX_RETRIES=3`
- `BLOG_OPENAI_INITIAL_RETRY_DELAY_MS=30000`
- `BLOG_OPENAI_MAX_RETRY_DELAY_MS=120000`
- `BLOG_MAX_TOPICS_PER_RUN=3`

## Notes

- Blog Manager does not use Firestore.
- Backend handles OpenAI and Shopify calls.
- Secrets must stay in environment files.
- Do not expose API keys or DB passwords in logs.
