# Production security notes

- Do not store service account key JSON.
- Do not expose OpenAI or Upstash credentials to the browser.
- Do not commit Google document or spreadsheet IDs.
- Restrict Vercel OIDC federation by team, project, and environment claims.
- Use only readonly Google Drive and Sheets scopes.
- Keep audit records metadata-only.
- Fail closed when authentication, source loading, model output validation, or audit persistence fails.
- Re-run preflight after every production environment-variable change.
