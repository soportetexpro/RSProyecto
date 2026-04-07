'use strict';

/**
 * server.js
 *
 * Punto de entrada del backend Express.
 *
 * Responsabilidades:
 *   - Inicializar middlewares globales de seguridad y parsing
 *   - Servir frontend estático
 *   - Registrar rutas API por dominio funcional
 *   - Exponer healthcheck y manejo de errores 404/500
 *
 * Fuentes de configuración:
 *   - Variables de entorno (.env)
 *   - Módulos de rutas en src/routes/*
 *   - Conexión MySQL vía src/config/db.js (healthcheck)
 */

const path      = require('path');
const express   = require('express');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ── Validación de entorno obligatoria ────────────────────────────
// En producción, FRONTEND_URL es obligatoria para configurar CORS correctamente.
// Fallar rápido evita que el servidor arranque con CORS mal configurado.
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.error('[ERROR CRÍTICO] Variable de entorno FRONTEND_URL no definida.');
  console.error('  En producción esta variable es obligatoria para CORS.');
  console.error('  Agrega FRONTEND_URL=https://tu-dominio.cl en el archivo .env');
  process.exit(1);
}

const { testConnection }    = require('./config/db');
const authRoutes            = require('./routes/auth');
const recuperarRoutes       = require('./routes/recuperar');
const ventasRoutes          = require('./routes/ventas');
const dashboardRoutes       = require('./routes/dashboard');
const adminRoutes           = require('./routes/admin');
const notificacionesRoutes  = require('./routes/notificaciones');
const carteraRoutes         = require('./routes/cartera');

const app  = express();
const PORT = Number(process.env.PORT || 3000);

// ── Seguridad HTTP headers ────────────────────────────────────
const CDN_SCRIPTS = [
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://unpkg.com',
];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],

        // scriptSrc y scriptSrcElem declarados explícitamente para evitar
        // el warning "'script-src-elem' was not explicitly set"
        scriptSrc:      ["'self'", ...CDN_SCRIPTS],
        scriptSrcElem:  ["'self'", ...CDN_SCRIPTS],

        styleSrc:       ["'self'", "'unsafe-inline'",
                         'https://fonts.googleapis.com',
                         'https://cdnjs.cloudflare.com'],
        fontSrc:        ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc:         ["'self'", 'data:', 'blob:'],

        // cdn.jsdelivr.net agregado para que Chart.js pueda cargar
        // sourcemaps (.map) sin bloqueo
        connectSrc:     ["'self'", 'https://cdn.jsdelivr.net'],

        objectSrc:      ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  const allowed = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Rate limiting — Login ──────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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

// ── Rate limiting — API global ─────────────────────────────────
// Protege todos los endpoints /api/* de abuso masivo.
// Límite permisivo (300 req/min) para no afectar uso normal.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health', // healthcheck no necesita límite
  message: {
    ok: false,
    error: 'Demasiadas solicitudes. Intenta nuevamente en un momento.'
  },
});

// ── Archivos estáticos (frontend) ─────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── Middlewares globales ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Ruta raíz → redirige al login ────────────────────────────────
app.get('/', (_req, res) => {
  res.redirect('/src/login/index.html');
});

// ── Healthcheck ─────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.status(200).json({ ok: true, app: 'RSProyecto', db: 'connected' });
  } catch {
    res.status(500).json({ ok: false, app: 'RSProyecto', db: 'disconnected' });
  }
});

// ── Rutas API ────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth/login',      loginLimiter);
app.use('/api/auth',            authRoutes);
app.use('/api/auth',            recuperarRoutes);
app.use('/api/ventas',          ventasRoutes);
app.use('/api/dashboard',       dashboardRoutes);
app.use('/api/admin',           adminRoutes);
app.use('/api/notificaciones',  notificacionesRoutes);
app.use('/api/cartera',         carteraRoutes);

// ── 404 ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// ── 500 ───────────────────────────────────────────────────────────────
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
