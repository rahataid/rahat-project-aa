/* eslint-disable */
export default {
  // displayName: 'aa',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/aa',
  coverageReporters: ['lcov', 'text'], // Add 'lcov' for lcov.info and 'text' for console output

};
