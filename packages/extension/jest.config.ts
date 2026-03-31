import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@media-buying-governance/shared$': '<rootDir>/../shared/src/index.ts',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  collectCoverageFrom: [
    'src/adapters/**/*.ts',
    'src/instrumentation/**/*.ts',
    '!src/adapters/**/__tests__/**',
    '!src/instrumentation/**/__tests__/**',
    '!src/adapters/**/index.ts',
  ],
};

export default config;
