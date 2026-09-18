# Clarity server model route

The generated Clarity Shortcut must not contain an OpenAI API key and must not call `api.openai.com` directly.

Runtime path:

`Raw First -> https://project-y-yos-ai.vercel.app/api/yos/clarity-model -> OpenAI Responses API -> existing local policy/router/executors`

The Shortcut receives the existing Clarity bearer token through an import/setup question. Vercel stores only its SHA-256 hash (`YOS_CLARITY_INTAKE_TOKEN_SHA256`) and keeps `OPENAI_API_KEY` server-side. The model gateway returns the Clarity contract root directly to the existing Shortcut router.

Production completion still requires the physical iPhone E2E. A compiled/signed artifact is not sufficient evidence.
