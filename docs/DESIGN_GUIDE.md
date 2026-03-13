# 🎨 Guía de Identidad Visual — Texpro

> Referencia: [https://texpro.cl](https://texpro.cl)  
> Este documento centraliza los lineamientos de diseño que **todos los módulos deben respetar**.

---

## 🏷️ Marca

| Elemento       | Detalle                                                  |
|----------------|----------------------------------------------------------|
| **Nombre**     | Texpro Productos Químicos y Tratamiento de Aguas         |
| **Slogan**     | "Todo un equipo a su disposición"                        |
| **Cert.**      | ISO 9001:2015 — ISP — Asociado CITUC                     |
| **Logo**       | Extraer desde `/assets/images/logo-texpro.*` (ver nota)  |

> ⚠️ **Nota:** El logo oficial debe descargarse desde el sitio web y colocarse en `src/assets/images/logo-texpro.svg` (o `.png`). No reemplazar ni modificar proporciones.

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

| Variable                  | Hex       | Uso sugerido                          |
|---------------------------|-----------|---------------------------------------|
| `--color-green`           | `#00E2A7` | Verde vibrante — badges, highlights   |
| `--color-green-mid`       | `#19BF94` | Hover sobre elementos verdes          |
| `--color-green-dark`      | `#00A885` | Estado activo / pressed               |

### Gris corporativo

| Variable                  | Hex       | Uso sugerido                          |
|---------------------------|-----------|---------------------------------------|
| `--color-corporate-gray`  | `#3A3A3A` | Textos de cuerpo, sidebar texto       |

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
--sidebar-width:        240px;
--sidebar-width-collapsed: 64px;
--header-height:        60px;
--content-max-width:    1400px;
```

---

## 🧩 Componentes Globales

Todos los módulos deben usar estos componentes base:

### Sidebar / Navegación lateral
- Fondo: `--color-primary` (`#003F8A`)
- Texto: `--color-white`
- Item activo: borde izquierdo `3px` en `--color-green` (`#00E2A7`)
- Logo Texpro en la parte superior

### Header / Topbar
- Fondo: `--color-white` con `--shadow-sm`
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
    │   ├── logo-texpro.svg       ← Logo principal
    │   ├── logo-texpro-white.svg ← Versión blanca (para sidebar)
    │   └── favicon.ico
    ├── icons/                    ← Iconos SVG por módulo
    └── styles/
        ├── tokens.css            ← Variables CSS (design tokens)
        ├── global.css            ← Reset + estilos base
        └── components.css        ← Componentes reutilizables
```

---

## 📌 Reglas de Uso

1. **Nunca** usar colores hardcodeados — siempre `var(--color-*)`
2. **Nunca** modificar el logo (proporciones, colores, efectos)
3. Todos los módulos comparten el mismo **sidebar** y **header**
4. Las fuentes deben cargarse desde `assets/` en producción
5. Los iconos usarán **Lucide Icons** o equivalente SVG

---

*Última actualización: 2026-03-13 — Cualquier cambio debe ser aprobado antes de aplicarse a producción.*
