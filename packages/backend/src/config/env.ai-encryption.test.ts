import assert from 'node:assert/strict';
import {
  getAIEncryptionConfigurationErrors,
  validateAIEncryptionConfiguration,
} from './env';

function run() {
  for (const aiEncryptionKey of ['', '0'.repeat(64)]) {
    assert.throws(
      () =>
        validateAIEncryptionConfiguration({
          nodeEnv: 'production',
          aiEncryptionKey,
        }),
      /AI_ENCRYPTION_KEY must be set to a non-zero 32-byte hex key in production/
    );
  }

  assert.deepEqual(
    getAIEncryptionConfigurationErrors({
      nodeEnv: 'production',
      aiEncryptionKey: '1'.repeat(64),
    }),
    []
  );

  assert.deepEqual(
    getAIEncryptionConfigurationErrors({
      nodeEnv: 'development',
      aiEncryptionKey: '0'.repeat(64),
    }),
    []
  );
}

run();
console.log('AI encryption configuration tests passed');
