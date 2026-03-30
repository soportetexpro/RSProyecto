'use strict';

const path      = require('path');
const express   = require('express');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/db');
const authRoutes         = require('./routes/auth');
const recuperarRoutes    = require('./routes/recuperar');
const ventasRoutes       = require('./routes/ventas');
const dashboardRoutes    = require('./routes/dashboard');
const adminRoutes        = require('./routes/admin');

const app  = express();
const PORT = Number(process.env.PORT || 3000);

// ── Seguridad HTTP headers ──────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   [
          "'self'",
          'https://cdn.jsdelivr.net',   // Chart.js y otras librerías CDN
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
        ],
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc:      ["'self'", 'data:', 'blob:'],
        connectSrc:  ["'self'"],
        objectSrc:   ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// ── CORS ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const allowed = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Rate limiting — Login ────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 10,                      // máximo 10 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos.'
  },
  handler: (req, res, next, options) => {
    console.warn(`[SEGURIDAD] Rate limit alcanzado — IP: ${req.ip} | ${new Date().toISOString()}`);
    res.status(429).json(options.message);
  }
});

// ── Archivos estáticos (frontend) ───────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── Middlewares globales ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Ruta raíz → redirige al login ──────────────────────────────────
app.get('/', (_req, res) => {
  res.redirect('/src/login/index.html');
});

// ── Healthcheck ─────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.status(200).json({ ok: true, app: 'RSProyecto', db: 'connected' });
  } catch {
    res.status(500).json({ ok: false, app: 'RSProyecto', db: 'disconnected' });
  }
});

// ── Rutas API ─────────────────────────────────────────────────────────
app.use('/api/auth/login',  loginLimiter);    // Rate limit aplicado solo al login
app.use('/api/auth',        authRoutes);
app.use('/api/auth',        recuperarRoutes);
app.use('/api/ventas',      ventasRoutes);
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/admin',       adminRoutes);

// ── 404 ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// ── 500 ──────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message || err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[RSProyecto] Servidor en http://localhost:${PORT}`);
  });
}

module.exports = app;
