const nextJest = require('next/jest');
const path = require('path');

const createJestConfig = nextJest({ dir: __dirname });
const lexicalPackagePath = path.dirname(require.resolve('lexical/package.json', { paths: [__dirname] }));

module.exports = createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: '<rootDir>/../../scripts/jest/no-canvas-jsdom-environment.js',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@humanly/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@humanly/editor$': '<rootDir>/../../packages/editor/src/index.ts',
    '^lexical$': lexicalPackagePath,
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
});
