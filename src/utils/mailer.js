'use strict';

/**
 * mailer.js — Envío de correos con Nodemailer
 *
 * Variables de entorno requeridas en .env:
 *   MAIL_HOST     — servidor SMTP (ej: smtp.gmail.com)
 *   MAIL_PORT     — puerto SMTP (ej: 587)
 *   MAIL_SECURE   — true para puerto 465, false para 587 con STARTTLS
 *   MAIL_USER     — dirección de correo remitente
 *   MAIL_PASS     — contraseña o App Password del remitente
 *   MAIL_FROM     — nombre + dirección visible (ej: 'TEXPRO <no-reply@texpro.cl>')
 */

const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.MAIL_HOST,
    port:   Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });
}

/**
 * Envía el código OTP al correo del usuario.
 * @param {string} destinatario  — email del usuario
 * @param {string} codigo        — 6 dígitos OTP
 * @returns {Promise<void>}
 */
async function enviarOtp(destinatario, codigo) {
  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;
                  padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.1)">
        <img src="https://raw.githubusercontent.com/soportetexpro/RSProyecto/main/src/assets/logo-texpro.png"
             alt="TEXPRO" style="height:48px;margin-bottom:24px" onerror="this.style.display='none'">
        <h2 style="color:#1a1a2e;margin-bottom:8px">Recuperación de contraseña</h2>
        <p style="color:#555;margin-bottom:24px">
          Recibimos una solicitud para restablecer tu contraseña.<br>
          Usa el siguiente código. <strong>Expira en 15 minutos.</strong>
        </p>
        <div style="text-align:center;margin:32px 0">
          <span style="display:inline-block;letter-spacing:10px;font-size:40px;
                       font-weight:bold;color:#1a1a2e;background:#f0f4ff;
                       padding:16px 32px;border-radius:8px">${codigo}</span>
        </div>
        <p style="color:#888;font-size:13px">
          Si no solicitaste este código, ignora este correo.<br>
          Tu contraseña actual sigue siendo la misma.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#aaa;font-size:12px;text-align:center">
          TEXPRO Productos Químicos y Tratamiento de Aguas
        </p>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from:    process.env.MAIL_FROM || `"TEXPRO" <${process.env.MAIL_USER}>`,
    to:      destinatario,
    subject: `${codigo} — Tu código de recuperación TEXPRO`,
    html
  });
}

module.exports = { enviarOtp };
