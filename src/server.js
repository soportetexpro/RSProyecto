'use strict';

const path    = require('path');
const express = require('express');
require('dotenv').config();

const { testConnection } = require('./config/db');
const authRoutes         = require('./routes/auth');
const recuperarRoutes    = require('./routes/recuperar');

const app  = express();
const PORT = Number(process.env.PORT || 3000);

// ── Archivos estáticos (frontend) ─────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── Middlewares globales ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Ruta raíz → redirige al login ──────────────────────────
app.get('/', (_req, res) => {
  res.redirect('/src/login/index.html');
});

// ── Healthcheck ────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.status(200).json({ ok: true, app: 'RSProyecto', db: 'connected' });
  } catch {
    res.status(500).json({ ok: false, app: 'RSProyecto', db: 'disconnected' });
  }
});

// ── Rutas API ──────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth', recuperarRoutes);

// ── 404 ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// ── 500 ─────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`[RSProyecto] Servidor en http://localhost:${PORT}`);
});

module.exports = app;
