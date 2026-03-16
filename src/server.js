'use strict';

const express = require('express');
require('dotenv').config();

const { testConnection } = require('./config/db');
const authRoutes        = require('./routes/auth');

const app  = express();
const PORT = Number(process.env.PORT || 3000);

// ── Middlewares globales ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Healthcheck ───────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.status(200).json({ ok: true, app: 'RSProyecto', db: 'connected' });
  } catch {
    res.status(500).json({ ok: false, app: 'RSProyecto', db: 'disconnected' });
  }
});

// ── Rutas ─────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// ── 500 ───────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`[RSProyecto] Servidor en http://localhost:${PORT}`);
});

module.exports = app;
