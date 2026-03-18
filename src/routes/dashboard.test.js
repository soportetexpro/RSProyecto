'use strict';

/**
 * Basic smoke test for dashboard router: ensures it exports an Express router
 */

const router = require('./dashboard');

test('exports an Express router', () => {
  expect(router).toBeDefined();
  expect(typeof router.use).toBe('function');
});
