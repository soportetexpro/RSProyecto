# Guía Comentada del Código - RSProyecto

Esta guía explica qué hace cada parte del sistema y de dónde obtiene la información.

## 1) Visión general de arquitectura

El proyecto está dividido en:

- Backend Node.js con Express en src/server.js.
- Frontend estático (HTML/CSS/JS) en src/login, src/dashboard, src/ventas, src/recuperar-password.
- Acceso a datos:
  - MySQL (bdtexpro): usuarios, metas, notificaciones, OTP.
  - SQL Server Softland: ventas, folios, detalle comercial.

Flujo principal:

1. El frontend hace login contra /api/auth/login.
2. Backend valida contraseña (formato Django PBKDF2) y emite JWT.
3. Frontend usa JWT para consumir endpoints protegidos.
4. Endpoints consultan MySQL o Softland según la funcionalidad.

## 2) Entrypoint del backend

### src/server.js

Responsabilidad:

- Crear aplicación Express.
- Configurar seguridad HTTP (helmet + CSP).
- Configurar CORS.
- Servir archivos estáticos.
- Montar rutas API.

Datos que consume:

- Variables de entorno (puerto, frontend permitido, secretos).
- testConnection de src/config/db para healthcheck.

Datos que expone:

- Endpoints /api/\*.
- /api/health para verificar estado de DB.

## 3) Configuración y conexiones

### src/config/db.js

Responsabilidad:

- Crear pool MySQL con mysql2/promise.
- Exponer función testConnection.

Fuente de datos:

- Variables DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.

### src/config/db.softland.js

Responsabilidad:

- Crear/reutilizar conexión mssql a Softland.
- Exponer getSoftlandPool y closeSoftlandPool.

Fuente de datos:

- Variables SOFTLAND*DB*\*.

## 4) Autenticación y autorización

### src/routes/auth.js

Responsabilidad:

- Login, endpoint de sesión actual, logout.

Fuentes de datos:

- findByEmail, findById y otros desde src/models/usuario.
- verifyPasswordDjango desde src/utils/pbkdf2Django.
- generarToken desde src/utils/jwt.

Flujo login:

1. Recibe email/password.
2. Busca usuario en MySQL.
3. Verifica hash Django.
4. Carga vendedores y metas del usuario.
5. Emite JWT y retorna perfil resumido.

### src/middlewares/requireAuth.js

Responsabilidad:

- Leer Authorization Bearer token.
- Verificar JWT.
- Volver a consultar vendedores en MySQL para tener permisos actualizados.

Salida:

- Inyecta req.usuario para uso de rutas.

## 5) Módulo de recuperación de contraseña

### src/routes/recuperar.js

Responsabilidad:

- Flujo de 3 pasos: enviar OTP, validar OTP, cambiar contraseña.

Fuentes de datos:

- src/models/usuario para buscar usuario y actualizar password.
- src/utils/otpStore para crear/verificar OTP.
- src/utils/mailer para envío de correo.
- jsonwebtoken para token temporal de reset.

## 6) Módulo de ventas

### src/routes/ventas.js

Responsabilidad:

- Endpoints de ventas, totales, evolución, clientes, folio y detalle.

Fuentes de datos:

- src/models/venta (consultas a Softland).
- src/config/db (meta anual en MySQL vendedor_meta).

Regla de acceso:

- requireAuth y filtro por codigos de vendedor del usuario autenticado.

### src/models/venta.js

Responsabilidad:

- Ejecutar consultas SQL Server (Softland).
- Devolver datos listos para endpoints.

Fuente de datos:

- Tablas [PRODIN].[softland].iw_gsaen, iw_gmovi, cwtauxi, cwtvend, iw_tprod.

## 7) Módulo dashboard

### src/routes/dashboard.js

Responsabilidad:

- KPIs, evolución, vendedores, ventas mes, detalle y gestión de folios compartidos.

Fuentes de datos:

- Softland para ventas y descuentos.
- MySQL para metas y factura_compartida.
- src/models/notificacion para disparar notificaciones de meta.

## 8) Módulo de notificaciones

### src/routes/notificaciones.js

Responsabilidad:

- Listar notificaciones.
- Contar no leídas.
- Marcar una o todas como leídas.

Fuente de datos:

- src/models/notificacion.

### src/models/notificacion.js

Responsabilidad:

- CRUD sobre notificaciones.
- Mensajes de meta cumplida/superada.
- Resolución de usuario por código vendedor.

Fuente de datos:

- MySQL: tabla notificaciones y usuario_vendedor.

## 9) Modelos de usuario

### src/models/usuario.js

Responsabilidad:

- Consultar y actualizar usuario.
- Leer vendedores, permisos y metas asociadas.

Fuente de datos:

- MySQL: usuario, usuario_vendedor, usuario_permisos, vendedor_meta.

## 10) Utilidades transversales

### src/utils/jwt.js

- Genera y valida tokens JWT.

### src/utils/pbkdf2Django.js

- Verifica/genera hashes compatibles con Django PBKDF2 SHA256.

### src/utils/otpStore.js

- Persiste OTP en MySQL, invalida anteriores y marca uso único.

### src/utils/mailer.js

- Envía correos mediante Microsoft Graph API.

### src/utils/stringHelpers.js

- Validaciones de mes/año y helper de trim.

## 11) Frontend

### src/login/login.js

- Maneja formulario de login.
- Llama a /api/auth/login.
- Guarda token y usuario en storage.

### src/dashboard/dashboard.js

- Carga KPIs, gráfico, tablas y modal de detalle.
- Llama endpoints de /api/dashboard.

### src/dashboard/notificaciones-ui.js

- Campana de notificaciones con polling cada 30s.
- Llama endpoints de /api/notificaciones.

### src/ventas/ventas.js

- KPIs de ventas, tabla paginada, gráfico y detalle de folio.
- Llama endpoints de /api/ventas.

### src/recuperar-password/recuperar.js

- Flujo visual de recuperación por pasos.
- Llama endpoints /api/auth/recuperar, /verificar-otp, /nueva-password.

### src/assets/js/inactividad.js

- Control global de inactividad por localStorage.
- Cierra sesión automáticamente al vencer temporizador.

## 12) Pruebas

- Existe configuración de Jest y ESLint.
- Parte importante de tests está vacía o mínima.
- Tests activos relevantes: tests/dashboard.test.js y tests/models/venta.test.js.

## 13) Recomendaciones para legibilidad futura

1. Mantener comentario de cabecera en cada archivo con: responsabilidad, entradas y fuentes de datos.
2. Documentar en cada endpoint qué middleware lo protege.
3. En modelos, comentar siempre tabla origen y columnas críticas.
4. Mantener contrato de respuesta JSON consistente: { ok, data/error }.
