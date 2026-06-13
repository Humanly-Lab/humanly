const nextJest = require('next/jest');
const path = require('path');

const createJestConfig = nextJest({ dir: __dirname });
const sharedPackagePath = path.resolve(__dirname, '../../packages/shared');
const yamlPackagePath = require.resolve('yaml', { paths: [sharedPackagePath] });

module.exports = createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: '<rootDir>/../../scripts/jest/no-canvas-jsdom-environment.js',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@humanly/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^yaml$': yamlPackagePath,
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
});
