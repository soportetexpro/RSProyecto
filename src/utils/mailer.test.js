'use strict';

/**
 * Basic tests for mailer exports (smoke tests only — network calls not executed)
 */

const mailer = require('./mailer');

test('exports enviarOtp function', () => {
  expect(mailer).toBeDefined();
  expect(typeof mailer.enviarOtp).toBe('function');
});
