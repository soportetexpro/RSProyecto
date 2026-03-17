'use strict';

/**
 * mailer.js — Envío de correos via Microsoft Graph API
 *
 * NO usa SMTP. Funciona aunque SmtpClientAuthentication esté deshabilitado.
 *
 * Variables de entorno requeridas en .env:
 *   MAIL_TENANT_ID     — Directory (tenant) ID de Azure AD
 *   MAIL_CLIENT_ID     — Application (client) ID de la app registrada en Azure
 *   MAIL_CLIENT_SECRET — Client secret generado en Azure AD
 *   MAIL_FROM_ADDRESS  — Dirección del buzón desde el que se envía (ej: soporte@texpro.cl)
 *   MAIL_FROM_NAME     — Nombre visible del remitente (ej: TEXPRO)
 *
 * Permisos requeridos en Azure AD (Application permissions):
 *   Mail.Send
 */

const https = require('https');

/**
 * Obtiene un access token de Microsoft Identity Platform (OAuth2 client_credentials)
 * @returns {Promise<string>} access token
 */
async function getAccessToken() {
  const tenantId     = process.env.MAIL_TENANT_ID;
  const clientId     = process.env.MAIL_CLIENT_ID;
  const clientSecret = process.env.MAIL_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Faltan variables MAIL_TENANT_ID, MAIL_CLIENT_ID o MAIL_CLIENT_SECRET en .env');
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default'
  }).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'login.microsoftonline.com',
      path:     `/${tenantId}/oauth2/v2.0/token`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error(`Error obteniendo token: ${parsed.error_description || data}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Envía un correo usando Microsoft Graph API (POST /sendMail)
 * @param {string} accessToken
 * @param {string} fromAddress   — buzón remitente
 * @param {string} fromName      — nombre visible
 * @param {string} to            — destinatario
 * @param {string} subject       — asunto
 * @param {string} html          — cuerpo HTML
 */
async function sendViaGraph(accessToken, fromAddress, fromName, to, subject, html) {
  const payload = JSON.stringify({
    message: {
      subject,
      body:         { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      from:         { emailAddress: { address: fromAddress, name: fromName } }
    },
    saveToSentItems: false
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path:     `/v1.0/users/${fromAddress}/sendMail`,
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // Graph devuelve 202 Accepted al enviar correctamente
        if (res.statusCode === 202) {
          resolve();
        } else {
          reject(new Error(`Graph API error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Envía el código OTP al correo del usuario.
 * @param {string} destinatario  — email del usuario
 * @param {string} codigo        — 6 dígitos OTP
 * @returns {Promise<void>}
 */
async function enviarOtp(destinatario, codigo) {
  const fromAddress = process.env.MAIL_FROM_ADDRESS;
  const fromName    = process.env.MAIL_FROM_NAME || 'TEXPRO';

  if (!fromAddress) {
    throw new Error('Falta variable MAIL_FROM_ADDRESS en .env');
  }

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;
                  padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.1)">
        <h2 style="color:#1a1a2e;margin-bottom:8px">Recuperación de contraseña</h2>
        <p style="color:#555;margin-bottom:24px">
          Recibimos una solicitud para restablecer tu contraseña en el sistema TEXPRO.<br>
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

  const token = await getAccessToken();
  await sendViaGraph(token, fromAddress, fromName, destinatario, `${codigo} — Tu código de recuperación TEXPRO`, html);
}

module.exports = { enviarOtp };
