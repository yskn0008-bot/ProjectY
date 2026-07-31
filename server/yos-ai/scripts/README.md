# Operational scripts

## Production preflight

```bash
npm run preflight
```

Checks required production environment variables and strict loaders without printing secret values.

## Deployed health smoke

```bash
YOS_API_BASE_URL=https://example.vercel.app \
YOS_SMOKE_ORIGIN=https://yos.example \
npm run smoke:health
```

Checks that the deployed health endpoint returns the expected YOS AI service response.
