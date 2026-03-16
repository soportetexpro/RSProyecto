'use strict';



const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ── POST /api/auth/login ──────────────────────────────────────────
// Body: { email: string, password: string }
router.post('/login', async (req, res) => {
  try {
    if (!JWT_SECRET) {
      console.error('[auth/login] JWT_SECRET no definido en .env');
      return res.status(500).json({ ok: false, error: 'Error de configuracion del servidor' });
    }

    const email    = String(req.body.email    || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!email || !password) {
      return res.status(400).json({
        ok:    false,
        error: 'Email y contrasena son requeridos'
      });
    }

    const usuario = await getUsuarioCompletoByEmail(email);


    if (!usuario) {
      return res.status(401).json({ ok: false, error: 'Credenciales invalidas' });
    }

    if (!usuario.is_active) {
      return res.status(403).json({ ok: false, error: 'Cuenta inactiva. Contacta a soporte.' });
    }

    let isValid = false;
    try {
      isValid = verifyPasswordDjango(password, usuario.password);
    } catch {
      return res.status(401).json({ ok: false, error: 'Credenciales invalidas' });
    }

    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Credenciales invalidas' });
    }

    await updateLastLogin(usuario.id);



    });

    const responseUser = {
      id:                  usuario.id,
      nombre:              usuario.nombre,
      email:               usuario.email,
      area:                usuario.area,
      codigo:              usuario.codigo,
      tema:                usuario.tema,
      is_admin:            Boolean(usuario.is_admin),
      is_active:           Boolean(usuario.is_active),
      last_login:          usuario.last_login,
      fecha_creacion:      usuario.fecha_creacion,
      vendedores:          usuario.vendedores,
      permisos:            usuario.permisos,
      metas:               usuario.metas,
      facturasCompartidas: usuario.facturasCompartidas
    };

    return res.status(200).json({
      ok:      true,
      message: 'Login correcto',

      user:    responseUser
    });

  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar el login' });
  }
});


});

module.exports = router;
