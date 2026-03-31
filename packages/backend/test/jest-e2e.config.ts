import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./setup.ts'],
  moduleNameMapper: {
    '^@media-buying-governance/shared$': '<rootDir>/../../../shared/src/index.ts',
  },
};

export default config;
