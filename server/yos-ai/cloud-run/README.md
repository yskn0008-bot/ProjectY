# YOS runtime provider: Google Cloud Run

This is a **second host for the same YOS runtime**, not a second YOS implementation or second SSOT.

## Quality rule

Cloud Run must not be enabled in `data/yos-runtime-providers.json` until live parity smoke proves:

- same YOS source code and response schemas
- same `OPENAI_MODEL`
- same Google source IDs
- same Upstash rate-limit and audit stores
- same allowed origins and end-user Google ID-token verification
- same representative YOS Chat outputs/contract
- no missing route that the client will fail over to

The client only fails over for certified routes and only for provider/network/rate-limit style failures. Authentication, validation and contract errors do not fail over.

## Why Cloud Run for the quality-critical secondary

The current YOS runtime reads Google Drive / Sheets. Cloud Run can use its assigned service identity through Application Default Credentials without a long-lived service-account key. Set:

```text
NODE_ENV=production
YOS_RUNTIME_PROVIDER=google_cloud_run
GOOGLE_AUTH_MODE=application_default
```

Do not set `GOOGLE_APPLICATION_CREDENTIALS` in production. Assign the existing least-privilege user-managed service account to the Cloud Run service.

## Current route boundary

Candidate parity routes:

- /api/yos/chat
- /api/yos/health
- /api/yos/public-config
- /api/yos/nav-model
- /api/yos/taxi-event
- /api/yos/taxi-health
- /api/yos/tasks
- /api/yos/tasks-health
- /api/yos/intake
- /api/yos/projecty-decision

Not yet parity-certified:

- /api/yos/widget
- /api/yos/slack-events

Those two currently use Vercel-specific background `waitUntil` behavior and remain on Vercel until an equivalent durable background execution path is verified.

## Deployment gate

The repository is container-ready through `cloud-run/Dockerfile`, but account/project/service-identity/secret configuration and the first public deployment are real external gates. Do not enable the secondary provider before the live smoke suite passes.


## GitHub Actions activation path

Use `.github/workflows/yos-ai-cloud-run.yml`.

It has two explicit modes:

- `check`: runs the YOS AI test suite and reports which Cloud Run activation values are still missing. It never deploys.
- `deploy`: reruns the same quality gate, authenticates to Google Cloud with GitHub OIDC Workload Identity Federation, deploys from `server/yos-ai`, attaches the runtime service account, and health-smokes the returned URL.

The workflow intentionally uses `google-github-actions/auth@v3` with Workload Identity Federation. Do not add a long-lived Google service-account key JSON.

### One-time GitHub repository variables

- `OPENAI_MODEL` — copy the current Vercel production model exactly; do not use a provider-specific default
- `GCP_CLOUD_RUN_PROJECT_ID`
- `GCP_CLOUD_RUN_REGION`
- `GCP_CLOUD_RUN_SERVICE`
- `GCP_GITHUB_WIF_PROVIDER`
- `GCP_GITHUB_DEPLOY_SERVICE_ACCOUNT`
- `GCP_CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`

### One-time GitHub repository secrets

These are deployment copies of the current runtime secrets, not a new product SSOT:

- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_ALLOWED_SUBJECT_HASH`
- `YOS_ALLOWED_ORIGINS`
- `YOS_LAW_DOCUMENT_ID`
- `YOS_MASTER_DOCUMENT_ID`
- `YOS_CHANGE_LOG_DOCUMENT_ID`
- `YOS_SYSTEM_MASTER_DOCUMENT_ID`
- `YOS_TAXI_MASTER_DOCUMENT_ID`
- `PROJECT75_SPREADSHEET_ID`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Optional route secrets may also be supplied for Taxi, Clarity, and Notion when those routes are intended to be parity-certified.

## Activation sequence

1. Complete the one-time Google Cloud account/project/IAM setup.
2. Add the GitHub variables/secrets above.
3. Run the workflow in `check` mode. It must report ready.
4. Run `deploy` mode.
5. Verify `/api/yos/health` succeeds.
6. Run live parity against Vercel for the certified route set.
7. Only after parity PASS, write the Cloud Run URL to `data/yos-runtime-providers.json` and set that provider `enabled=true`.

This means a Cloud Run setup or quota problem cannot silently lower YOS quality. Until step 7 the production router continues to use Vercel only.

### Container entrypoint

Before source deployment, the workflow copies the existing `cloud-run/Dockerfile` into the source root. This keeps one canonical Dockerfile and ensures Cloud Run uses its `cloud-run/server.mjs` entrypoint instead of inferring a buildpack start command.

### 2026-10-04 activation audit

Vercel production environment configuration was observed with `OPENAI_MODEL=gpt-5.6-terra`; the previous workflow hard-coded `gpt-5.6-sol`. Repository variable `OPENAI_MODEL` must be copied from the production setting and checked again during live parity. This observation alone does not certify either deployed runtime. Cloud Run remains disabled until live parity passes. No credentials are recorded here.
