# 🎨 Guía de Identidad Visual — Texpro

> Referencia: [https://texpro.cl](https://texpro.cl)  
> Este documento centraliza los lineamientos de diseño que **todos los módulos deben respetar**.

---

## 🏷️ Marca

| Elemento       | Detalle                                                  |
|----------------|----------------------------------------------------------|
| **Nombre**     | Texpro Productos Químicos y Tratamiento de Aguas         |
| **Slogan**     | "Productos Químicos y Tratamiento de Aguas"              |
| **Cert.**      | ISO 9001:2015 — ISP — Asociado CITUC                     |

---

## 🖼️ Assets Oficiales de Marca

Todos los archivos de marca han sido provistos oficialmente. Deben colocarse en `src/assets/images/` **sin modificar** proporciones, colores ni efectos.

| Archivo original                                  | Ruta en proyecto                                      | Uso principal                                      |
|---------------------------------------------------|-------------------------------------------------------|----------------------------------------------------|
| `LOGO-2023.jpg`                                   | `src/assets/images/logo-texpro-full.jpg`              | Logo completo horizontal (isotipo + TEXPRO + bajada) — uso general |
| `Isotipo-TEXPRO.jpg`                              | `src/assets/images/isotipo-texpro.jpg`                | Isotipo circular oscuro — favicon, îcono de app   |
| `Isotipo-TEXPRO_fondo_blanco.jpg`                 | `src/assets/images/isotipo-texpro-white-bg.jpg`       | Isotipo circular sobre fondo blanco — documentos, reportes |
| `LOGO-TEXPRO-fondo-transparente-blanco.jpg`       | `src/assets/images/logo-texpro-isotipo-claro.jpg`     | Isotipo + bajada sobre fondo claro (sin texto TEXPRO) |
| `LOGO-TEXPRO-fondo-transparente-blancobajada.jpg` | `src/assets/images/logo-texpro-bajada-blanco.jpg`     | Logo versión blanca — uso sobre fondos oscuros / sidebar |

### 📌 Guía de uso por contexto

| Contexto                           | Asset a usar                            |
|------------------------------------|-----------------------------------------|
| **Sidebar** (fondo azul oscuro)    | `logo-texpro-bajada-blanco.jpg`         |
| **Header** (fondo blanco)          | `logo-texpro-full.jpg`                  |
| **Favicon / Tab del browser**      | `isotipo-texpro.jpg`                    |
| **Login / Pantalla de bienvenida** | `logo-texpro-full.jpg`                  |
| **Reportes / PDFs**                | `isotipo-texpro-white-bg.jpg`           |
| **Emails / notificaciones**        | `logo-texpro-full.jpg`                  |

### ⚠️ Reglas de uso del logo

1. **No** cambiar colores del logo bajo ningún contexto
2. **No** estirar, deformar ni recortar el isotipo
3. **No** aplicar efectos (sombras, filtros, opacidad) sobre el logo
4. Mantener siempre el **área de respiro** mínima alrededor del logo
5. Sobre fondos oscuros usar **siempre** la versión blanca (`logo-texpro-bajada-blanco.jpg`)

---

## 🎨 Paleta de Colores Corporativos

### Azules (identidad principal)

| Variable                  | Hex       | Uso                              |
|---------------------------|-----------|----------------------------------|
| `--color-primary`         | `#003F8A` | Azul corporativo principal       |
| `--color-primary-dark`    | `#002A5E` | Hover, bordes activos            |
| `--color-primary-light`   | `#0056B3` | Links, acentos                   |

### Celeste (agua / tratamiento)

| Variable                  | Hex       | Uso                              |
|---------------------------|-----------|----------------------------------|
| `--color-secondary`       | `#00AEEF` | Celeste institucional            |
| `--color-accent`          | `#F5A623` | Naranja — alertas, CTAs          |

### 🟢 Verdes corporativos Texpro

> Presentes directamente en el isotipo oficial. Color dominante de la marca.

| Variable                  | Hex       | Uso sugerido                                        |
|---------------------------|-----------|-----------------------------------------------------|
| `--color-green`           | `#00E2A7` | Verde vibrante — badges, highlights, CTAs principales |
| `--color-green-mid`       | `#19BF94` | Hover sobre elementos verdes                        |
| `--color-green-dark`      | `#00A885` | Estado activo / pressed                             |

### Gris corporativo

> Presente en el anillo del isotipo y en el texto "TEXPRO" del logo oficial.

| Variable                  | Hex       | Uso sugerido                                        |
|---------------------------|-----------|-----------------------------------------------------|
| `--color-corporate-gray`  | `#3A3A3A` | Textos de cuerpo, sidebar texto, nombre "TEXPRO"    |

### Neutros y estados

```css
--color-white:        #FFFFFF
--color-gray-light:   #F4F6F9   /* Fondo de paneles */
--color-gray-mid:     #BDC3C7   /* Bordes, separadores */
--color-gray-dark:    #4A4A4A   /* Texto secundario */
--color-black:        #1A1A1A   /* Texto principal */

--color-success:      #27AE60
--color-warning:      #F39C12
--color-danger:       #E74C3C
--color-info:         #2980B9
```

---

## 🔤 Tipografía

```css
--font-primary:   'Montserrat', 'Segoe UI', Arial, sans-serif;
--font-secondary: 'Open Sans', 'Roboto', sans-serif;
```

| Token           | rem      | px  | Uso                  |
|-----------------|----------|-----|----------------------|
| `--text-xs`     | 0.75rem  | 12  | Etiquetas, badges    |
| `--text-sm`     | 0.875rem | 14  | Texto secundario     |
| `--text-base`   | 1rem     | 16  | Cuerpo principal     |
| `--text-lg`     | 1.125rem | 18  | Subtítulos           |
| `--text-2xl`    | 1.5rem   | 24  | Títulos de sección   |
| `--text-4xl`    | 2.25rem  | 36  | Títulos de panel     |

---

## 📐 Espaciado y Layout

```css
--sidebar-width:           240px;
--sidebar-width-collapsed: 64px;
--header-height:           60px;
--content-max-width:       1400px;
```

---

## 🧩 Componentes Globales

### Sidebar / Navegación lateral
- Fondo: `--color-primary` (`#003F8A`)
- Texto: `--color-white`
- Item activo: borde izquierdo `3px` en `--color-green` (`#00E2A7`)
- Logo: `logo-texpro-bajada-blanco.jpg` en la parte superior

### Header / Topbar
- Fondo: `--color-white` con `--shadow-sm`
- Logo: `logo-texpro-full.jpg`
- Título del módulo en `--color-primary`
- Iconos de usuario/notificaciones a la derecha

### Cards / Paneles
- Fondo: `--color-white`
- Borde: `--border-thin`
- Border-radius: `--radius-md`
- Sombra: `--shadow-sm`

### Botones

| Tipo        | Background              | Texto  |
|-------------|-------------------------|--------|
| Primario    | `--color-primary`       | blanco |
| Verde       | `--color-green`         | blanco |
| Peligro     | `--color-danger`        | blanco |
| Outline     | transparente            | `--color-primary` con borde |

### Tablas de datos
- Header: `--color-primary` con texto blanco
- Filas alternas: `--color-gray-light`
- Hover fila: `rgba(0, 226, 167, 0.08)` (verde suave)

---

## 📁 Estructura de Assets

```
src/
└── assets/
    ├── images/
    │   ├── logo-texpro-full.jpg           ← Logo completo horizontal (uso general)
    │   ├── isotipo-texpro.jpg             ← Isotipo oscuro (favicon, îcono app)
    │   ├── isotipo-texpro-white-bg.jpg    ← Isotipo fondo blanco (reportes, PDF)
    │   ├── logo-texpro-isotipo-claro.jpg  ← Isotipo + bajada fondo claro
    │   ├── logo-texpro-bajada-blanco.jpg  ← Logo blanco (sidebar, fondos oscuros)
    │   └── favicon.ico                    ← Derivado del isotipo
    ├── icons/                             ← Iconos SVG por módulo (Lucide Icons)
    └── styles/
        ├── tokens.css                     ← Variables CSS (design tokens)
        ├── global.css                     ← Reset + estilos base
        └── components.css                 ← Componentes reutilizables
```

---

## 📌 Reglas Generales

1. **Nunca** usar colores hardcodeados — siempre `var(--color-*)`
2. **Nunca** modificar el logo (proporciones, colores, efectos)
3. Todos los módulos comparten el mismo **sidebar** y **header**
4. Las fuentes deben cargarse desde `assets/` en producción
5. Los iconos usarán **Lucide Icons** o equivalente SVG
6. En fondos oscuros usar **siempre** la versión blanca del logo

---

*Última actualización: 2026-03-13 — Cualquier cambio debe ser aprobado antes de aplicarse a producción.*
