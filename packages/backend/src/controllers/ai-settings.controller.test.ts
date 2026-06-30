import assert from 'node:assert/strict';
import { parseTrustedProviderBaseUrl } from './ai-settings.controller';

function expectTrustedProvider(
  input: string,
  expectedBaseUrl: string,
  expectedHost: string,
) {
  const result = parseTrustedProviderBaseUrl(input);
  assert.equal(result.ok, true, `${input}: expected trusted provider`);
  if (result.ok) {
    assert.equal(result.provider.baseUrl, expectedBaseUrl, `${input}: canonical base URL`);
    assert.equal(result.provider.host, expectedHost, `${input}: provider host`);
  }
}

function expectRejected(input: unknown, expectedMessage: string) {
  const result = parseTrustedProviderBaseUrl(input);
  assert.equal(result.ok, false, `${String(input)}: expected rejection`);
  if (!result.ok) {
    assert.match(result.message, new RegExp(expectedMessage, 'i'), `${String(input)}: rejection message`);
  }
}

function run() {
  expectTrustedProvider('https://api.openai.com/v1', 'https://api.openai.com/v1', 'api.openai.com');
  expectTrustedProvider('https://api.openai.com/v1/', 'https://api.openai.com/v1', 'api.openai.com');
  expectTrustedProvider('https://api.anthropic.com/v1', 'https://api.anthropic.com/v1', 'api.anthropic.com');
  expectTrustedProvider('https://api.together.xyz/v1', 'https://api.together.xyz/v1', 'api.together.xyz');
  expectTrustedProvider('https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1', 'openrouter.ai');

  expectRejected('', 'required');
  expectRejected(null, 'required');
  expectRejected('not a url', 'invalid');
  expectRejected('http://api.openai.com/v1', 'https');
  expectRejected('https://user:pass@api.openai.com/v1', 'credentials');
  expectRejected('https://api.openai.com:8443/v1', 'custom port');
  expectRejected('https://api.openai.com/v1?target=http://127.0.0.1', 'query');
  expectRejected('https://api.openai.com/v1#models', 'fragment');
  expectRejected('https://api.openai.com', 'include /v1');
  expectRejected('https://openai.com/v1', 'website URL');
  expectRejected('https://127.0.0.1:3000/v1', 'custom port');
  expectRejected('https://127.0.0.1/v1', 'unsupported');
  expectRejected('https://169.254.169.254/latest/meta-data', 'unsupported');
  expectRejected('https://api.openai.com.evil.example/v1', 'unsupported');
}

run();
console.log('ai-settings.controller tests passed');
