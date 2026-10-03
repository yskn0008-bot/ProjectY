# Next production deploy

Use exactly one Vercel deploy after the Hobby limit resets.

- Project name: project-y
- Application preset: Other
- Root Directory: server/yos-ai
- Build command: npm run vercel-build
- Output Directory: public
- Node.js: 22.x

Before deploying, register only the Taxi-first environment variables listed in `IPHONE_ACTIVATION.md`.
After deploying, open `/api/yos/taxi-health` and require `status: ready` before sending a real Taxi event.

2026-10-03 YOS Chat production retry: one build is intentionally requested to publish the verified gpt-5.6-sol compatibility fix after the previous build-rate-limit block. Do not create additional retry commits from this marker.
