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


## Bounded approved retry

After a YOS AI revision has already been merged to main and Vercel has attempted that production release, ProjectY HQ may retry the same approved revision when the GitHub Vercel status proves a rate-limit failure. It waits 1h, then 6h, 12h, and 24h, and updates only the existing `.redeploy-trigger`. No retry is performed for code/build failures, credentials, billing, or a new revision.
