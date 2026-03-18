'use strict';

/**
 * Basic smoke test for ventas router: ensures it exports an Express router
 * and provide a mock for `requireAuth` so tests can override behavior.
 */

jest.mock('../middlewares/requireAuth', () => ({
  requireAuth: jest.fn(),
  requireAdmin: jest.fn()
}));

const { requireAuth } = require('../middlewares/requireAuth');
const router = require('./ventas');

test('exports an Express router', () => {
  expect(router).toBeDefined();
  expect(typeof router.use).toBe('function');
});

test('requireAuth mock is available', () => {
  expect(requireAuth).toBeDefined();
  expect(typeof requireAuth.mockImplementationOnce).toBe('function');
});
