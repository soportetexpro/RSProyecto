'use strict';

/**
 * Basic smoke test for ventas router: ensures it exports an Express router
 */

const router = require('./ventas');

test('exports an Express router', () => {
  expect(router).toBeDefined();
  expect(typeof router.use).toBe('function');
});
