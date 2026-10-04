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
