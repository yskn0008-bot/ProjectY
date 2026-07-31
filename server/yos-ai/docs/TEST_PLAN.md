# Production test plan

- Run repository CI.
- Run `npm run preflight` with production-equivalent environment variables.
- Deploy to Vercel Preview.
- Run health smoke test.
- Verify authenticated chat.
- Verify Drive and Sheets reads.
- Verify Upstash audit and rate limits.
- Promote to Production.
- Verify iPhone Safari and PWA.
