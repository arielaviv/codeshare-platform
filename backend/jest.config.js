/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/routes/**/*.ts',
    'src/middleware/**/*.ts',
    'src/models/**/*.ts',
    'src/utils/**/*.ts',
    'src/services/ai.service.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/routes/': {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFiles: ['<rootDir>/tests/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }]
  }
};
