import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow = await readFile(new URL('../../../.github/workflows/yos-ai-cloud-run.yml', import.meta.url), 'utf8');

test('Cloud Run deployment uses keyless GitHub OIDC and never a service account key JSON', () => {
  assert.match(workflow, /google-github-actions\/auth@v3/);
  assert.match(workflow, /workload_identity_provider:/);
  assert.match(workflow, /service_account:/);
  assert.doesNotMatch(workflow, /credentials_json/);
  assert.match(workflow, /id-token:\s*write/);
});

test('Cloud Run deploy is explicit and quality-gated', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /action:\s*\n[\s\S]*check[\s\S]*deploy/);
  assert.match(workflow, /needs:\s*quality/);
  assert.match(workflow, /if: inputs\.action == 'deploy'/);
  assert.match(workflow, /npm test/);
});

test('Cloud Run runtime receives same model and attached service identity contract', () => {
  assert.match(workflow, /YOS_RUNTIME_PROVIDER=google_cloud_run/);
  assert.match(workflow, /GOOGLE_AUTH_MODE=application_default/);
  assert.match(workflow, /OPENAI_MODEL=\$\{\{ vars\.OPENAI_MODEL \}\}/);
  assert.match(workflow, /--service-account=\$\{\{ vars\.GCP_CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /OPENAI_API_KEY=\$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /UPSTASH_REDIS_REST_TOKEN=\$\{\{ secrets\.UPSTASH_REDIS_REST_TOKEN \}\}/);
});

test('deployment never enables failover before live parity', () => {
  assert.doesNotMatch(workflow, /yos-runtime-providers\.json.*enabled=true/);
  assert.match(workflow, /Run live parity before enabling failover/);
});

test('Cloud Run source deployment stages the canonical container entrypoint', () => {
  const stage = workflow.indexOf('cp server/yos-ai/cloud-run/Dockerfile server/yos-ai/Dockerfile');
  const deploy = workflow.indexOf('uses: google-github-actions/deploy-cloudrun@v3');
  assert.ok(stage >= 0 && stage < deploy);
});

test('readiness requires an explicit production model with no provider-specific default', () => {
  assert.match(workflow, /OPENAI_MODEL: \$\{\{ vars\.OPENAI_MODEL \}\}/);
  assert.match(workflow, /required=\([\s\S]*\n\s+OPENAI_MODEL\n/);
  assert.doesNotMatch(workflow, /OPENAI_MODEL=gpt-/);
});
