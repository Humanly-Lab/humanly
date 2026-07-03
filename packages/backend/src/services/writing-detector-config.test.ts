import assert from 'node:assert/strict';
import {
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  formatWritingDetectorConfig,
  normalizeWritingDetectorConfig,
  writingEnvironmentConfigSchema,
} from '@humanly/shared';

function run() {
  const legacyConfig = {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    detectors: undefined,
  };

  const parsedLegacy = writingEnvironmentConfigSchema.parse(legacyConfig);
  assert.equal(parsedLegacy.detectors.anomalyPattern.enabled, true);
  assert.equal(parsedLegacy.detectors.humanTyping.enabled, true);

  const parsedCustom = writingEnvironmentConfigSchema.parse({
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    detectors: {
      anomalyPattern: { enabled: true },
      humanTyping: { enabled: false },
    },
  });
  assert.equal(parsedCustom.detectors.anomalyPattern.enabled, true);
  assert.equal(parsedCustom.detectors.humanTyping.enabled, false);

  const normalized = normalizeWritingDetectorConfig({
    anomalyPattern: { enabled: false },
  });
  assert.equal(normalized.anomalyPattern.enabled, false);
  assert.equal(normalized.humanTyping.enabled, true);
  assert.equal(formatWritingDetectorConfig(normalized), 'Humanly Typing Detector');
}

run();
console.log('writing-detector-config tests passed');
