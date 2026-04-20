module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './test',
  testRegex: '.*\\.int\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testTimeout: 60000,
};
