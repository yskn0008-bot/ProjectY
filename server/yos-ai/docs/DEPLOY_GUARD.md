# Deploy guard

Do not press Deploy repeatedly.

1. Confirm `server/yos-ai`.
2. Confirm `public` output directory is present in `vercel.json`.
3. Confirm Taxi-first environment variables are registered.
4. Deploy once.
5. Read the last error line before any retry.

## Automatic deployment boundary

Ordinary development branches do not trigger automatic Git deployments. Keep local implementation and tests independent of Vercel. The existing production branch `main` remains enabled; `release/**` is reserved for approved completed candidates requiring an actual Vercel preview. A branch name is not authorization to publish. Do not push development checkpoints to release branches. For a necessary earlier live test, use an explicitly approved preview on a dedicated release branch. Existing production approval, current-commit ignore rule, active-build cancellation setting, authentication, and health checks remain unchanged. Do not create new projects or deploy unrelated Scriptable/Shortcut changes. Verify this policy against actual Git-triggered deployment records before claiming a live result. Rollback by reviewed revert of the policy addition.
