const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: __dirname });

module.exports = createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: '<rootDir>/../../scripts/jest/no-canvas-jsdom-environment.js',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@humanly/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
});
