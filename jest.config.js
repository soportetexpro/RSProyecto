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
    '/src/config/db.test.js'   // test de integración real — requiere BD activa, excluido del CI
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  clearMocks: true,
  verbose: true,
  forceExit: true             // cierra el proceso al terminar — resuelve open handles del pool MySQL
};
