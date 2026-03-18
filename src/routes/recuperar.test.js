'use strict';

/**
 * Basic smoke test for recuperar router: ensures it exports an Express router
 */

const router = require('./recuperar');

test('exports an Express router', () => {
  expect(router).toBeDefined();
  expect(typeof router.use).toBe('function');
});
