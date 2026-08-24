import test from 'node:test';
import assert from 'node:assert/strict';

test('the production entrypoint reports only the fixed app-init stage', async () => {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousConsoleError = console.error;
  const logged = [];
  delete process.env.OPENAI_API_KEY;
  console.error = (...values) => logged.push(values.join(' '));

  try {
    const route = await import(`../api/yos/chat.mjs?observability=${Date.now()}`);
    const response = await route.default.fetch(new Request('https://api.example/api/yos/chat', {
      method: 'POST',
      headers: {
        origin: 'https://yskn0008-bot.github.io',
        authorization: 'Bearer private-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({userText: 'private-user-text'})
    }));
    const responseBody = await response.text();

    assert.equal(response.status, 503);
    assert.deepEqual(logged.map((line) => JSON.parse(line)), [{
      level: 'error',
      event: 'yos_chat_unavailable',
      route: '/api/yos/chat',
      stage: 'app-init'
    }]);
    assert.doesNotMatch(logged.join('\n'), /private-token|private-user-text|OPENAI_API_KEY/);
    assert.doesNotMatch(responseBody, /private-token|private-user-text|OPENAI_API_KEY/);
    assert.match(responseBody, /temporarily unavailable/);
  } finally {
    console.error = previousConsoleError;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
  }
});
