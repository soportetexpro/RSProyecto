'use strict';

/**
 * Basic tests for otpStore exports
 */

const otp = require('./otpStore');

test('exports crearOtp and verificarOtp functions', () => {
  expect(otp).toBeDefined();
  expect(typeof otp.crearOtp).toBe('function');
  expect(typeof otp.verificarOtp).toBe('function');
});
