const rateLimit = require('express-rate-limit');
const { MAX_INTENTOS_LOGIN, VENTANA_BLOQUEO_MS } = require('../config/business-rules');

const loginLimiter = rateLimit({
  windowMs: VENTANA_BLOQUEO_MS,
  max: MAX_INTENTOS_LOGIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos.'
  },
  handler: (req, res, next, options) => {
    console.warn(`[SEGURIDAD] Rate limit alcanzado para IP: ${req.ip}`);
    res.status(429).json(options.message);
  }
});

module.exports = { loginLimiter };
