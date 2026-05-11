/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['temporal-polyfill/global'],
  roots: ['<rootDir>/__tests__'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // The real `posthog-react-native` resolves to a CJS bundle that
  // top-level `import`s react-native (ESM syntax), which jest's node
  // runtime can't parse. Stub it for every test; the analytics test
  // overrides with its own `jest.mock(...)` to assert SDK calls.
  moduleNameMapper: {
    '^posthog-react-native$': '<rootDir>/__mocks__/posthog-react-native.ts',
  },
};
