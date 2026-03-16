'use strict';

/**
 * requireAuth.test.js — Tests unitarios del middleware JWT
 */

const express    = require('express');
const request    = require('supertest');
const { generarToken } = require('../utils/jwt');
const { requireAuth, requireAdmin } = require('./requireAuth');

// App mínima para testear el middleware
function crearApp() {
  const app = express();
  app.use(express.json());
  app.get('/protegida',    requireAuth,              (req, res) => res.json({ ok: true, sub: req.usuario.sub }));
  app.get('/solo-admin',   requireAuth, requireAdmin, (req, res) => res.json({ ok: true }));
  return app;
}

describe('[requireAuth] Middleware JWT', () => {

  let app;
  const USUARIO_NORMAL = { id: 7, email: 'csoto@texpro.cl', is_admin: false };
  const USUARIO_ADMIN  = { id: 31, email: 'soporte.informatica@texpro.cl', is_admin: true };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test_secret_texpro_32chars_xyzabc';
    app = crearApp();
  });

  test('rechaza petición sin token (401)', async () => {
    const res = await request(app).get('/protegida');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('rechaza token malformado (401)', async () => {
    const res = await request(app)
      .get('/protegida')
      .set('Authorization', 'Bearer tokeninvalido');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('acepta token válido y expone req.usuario.sub', async () => {
    const token = generarToken(USUARIO_NORMAL);
    const res   = await request(app)
      .get('/protegida')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.sub).toBe(USUARIO_NORMAL.id);
  });

  test('rechaza token expirado (401)', async () => {
    const jwt   = require('jsonwebtoken');
    const token = jwt.sign(
      { sub: 1, email: 'test@texpro.cl', is_admin: false },
      process.env.JWT_SECRET,
      { expiresIn: '1ms' }
    );
    await new Promise(r => setTimeout(r, 10)); // esperar expiración
    const res = await request(app)
      .get('/protegida')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expirado/i);
  });

  test('requireAdmin bloquea usuario normal (403)', async () => {
    const token = generarToken(USUARIO_NORMAL);
    const res   = await request(app)
      .get('/solo-admin')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  test('requireAdmin permite usuario admin (200)', async () => {
    const token = generarToken(USUARIO_ADMIN);
    const res   = await request(app)
      .get('/solo-admin')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

});
