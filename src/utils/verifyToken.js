'use strict';

/**
 * verifyToken.js — DEPRECATED
 *
 * Este archivo está deprecado y no debe usarse.
 * Utiliza en su lugar: src/middlewares/requireAuth.js
 *
 * El middleware requireAuth exporta:
 *   - requireAuth   — verifica JWT, agrega req.usuario
 *   - requireAdmin  — verifica además is_admin === true
 *
 * Este archivo se mantiene temporalmente para no romper
 * imports externos durante la transición.
 *
 * @deprecated Usar requireAuth desde src/middlewares/requireAuth.js
 */

const { requireAuth } = require('../middlewares/requireAuth');

// Re-exporta como verifyToken para compatibilidad hacia atrás
module.exports = { verifyToken: requireAuth };
