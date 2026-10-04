# Next production deploy

Do not block unrelated development while Vercel is rate-limited. A production release remains an external gate, while One Enter / ProjectY HQ continues independent work. Data-only GitHub sync commits must not retrigger an older YOS AI server diff; only a current commit that changes `server/yos-ai/**` (or an explicitly approved redeploy trigger) may request another build.

- Project name: project-y
- Application preset: Other
- Root Directory: server/yos-ai
- Build command: npm run vercel-build
- Output Directory: public
- Node.js: 22.x

Before deploying, register only the Taxi-first environment variables listed in `IPHONE_ACTIVATION.md`.
After deploying, open `/api/yos/taxi-health` and require `status: ready` before sending a real Taxi event.

2026-10-03 YOS Chat production retry: 2026-10-03T07:50Z one build is intentionally requested to publish the verified gpt-5.6-sol compatibility fix. Do not create additional retry commits from this marker.


## External wait

If Vercel reports a build-rate-limit or another proven transient provider failure, record the release as external wait rather than asking the user to keep retrying. Do not create repeated redeploy commits merely to probe the limit. Production publication/credential/plan changes remain explicit human gates.
