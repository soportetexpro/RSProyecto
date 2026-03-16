/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/src/config/db.test.js',          // integración MySQL — requiere BD activa
    '/src/config/db.softland.test.js'  // integración Softland — requiere SQL Server
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  clearMocks: true,
  verbose: true,
  forceExit: true
};
