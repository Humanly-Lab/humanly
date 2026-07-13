import assert from 'node:assert/strict';
import { hasFeature, normalizeEdition } from './edition';

assert.equal(normalizeEdition(undefined), 'community');
assert.equal(normalizeEdition(null), 'community');
assert.equal(normalizeEdition(''), 'community');
assert.equal(normalizeEdition('community'), 'community');
assert.equal(normalizeEdition('Cloud'), 'community');
assert.equal(normalizeEdition('unknown'), 'community');
assert.equal(normalizeEdition('cloud'), 'cloud');

assert.equal(hasFeature('community', 'billing'), false);
assert.equal(hasFeature('community', 'managedTypingDetector'), false);
assert.equal(hasFeature('cloud', 'billing'), true);
assert.equal(hasFeature('cloud', 'managedTypingDetector'), true);
