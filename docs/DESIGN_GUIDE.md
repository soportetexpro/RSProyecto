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

## 🎨 Paleta de Colores

Basada en identidad corporativa Texpro (azul institucional + blanco + gris):

```css
/* ── Colores Primarios ── */
--color-primary:        #003F8A;   /* Azul corporativo principal */
--color-primary-dark:  #002A5E;   /* Azul oscuro (hover, bordes) */
--color-primary-light: #0056B3;   /* Azul claro (links, accents) */

/* ── Colores Secundarios ── */
--color-secondary:     #00AEEF;   /* Celeste (agua / tratamiento) */
--color-accent:        #F5A623;   /* Naranja (alertas, CTAs) */

/* ── Neutros ── */
--color-white:         #FFFFFF;
--color-gray-light:    #F4F6F9;   /* Fondo de paneles */
--color-gray-mid:      #BDC3C7;   /* Bordes, separadores */
--color-gray-dark:     #4A4A4A;   /* Texto secundario */
--color-black:         #1A1A1A;   /* Texto principal */

/* ── Estados ── */
--color-success:       #27AE60;
--color-warning:       #F39C12;
--color-danger:        #E74C3C;
--color-info:          #2980B9;
```

---

## 🔤 Tipografía

```css
/* Fuente principal — usar Google Fonts o self-hosted */
--font-primary:   'Montserrat', 'Segoe UI', Arial, sans-serif;
--font-secondary: 'Open Sans', 'Roboto', sans-serif;

/* Tamaños base */
--text-xs:    0.75rem;   /* 12px */
--text-sm:    0.875rem;  /* 14px */
--text-base:  1rem;      /* 16px */
--text-lg:    1.125rem;  /* 18px */
--text-xl:    1.25rem;   /* 20px */
--text-2xl:   1.5rem;    /* 24px */
--text-3xl:   1.875rem;  /* 30px */
--text-4xl:   2.25rem;   /* 36px */

/* Pesos */
--font-regular:   400;
--font-medium:    500;
--font-semibold:  600;
--font-bold:      700;
```

---

## 📐 Espaciado y Layout

```css
/* Sistema de espaciado (base 4px) */
--space-1:   0.25rem;   /*  4px */
--space-2:   0.5rem;    /*  8px */
--space-3:   0.75rem;   /* 12px */
--space-4:   1rem;      /* 16px */
--space-6:   1.5rem;    /* 24px */
--space-8:   2rem;      /* 32px */
--space-12:  3rem;      /* 48px */
--space-16:  4rem;      /* 64px */

/* Bordes */
--radius-sm:   4px;
--radius-md:   8px;
--radius-lg:   12px;
--radius-full: 9999px;

/* Sombras */
--shadow-sm:  0 1px 3px rgba(0,0,0,0.08);
--shadow-md:  0 4px 12px rgba(0,0,0,0.12);
--shadow-lg:  0 8px 24px rgba(0,0,0,0.16);
```

---

## 🧩 Componentes Globales

Todos los módulos (Ventas, Bodega, etc.) deben usar estos componentes base:

### Sidebar / Navegación lateral
- Fondo: `--color-primary` (`#003F8A`)
- Texto: `--color-white`
- Item activo: `--color-secondary` (`#00AEEF`) con borde izquierdo de 3px
- Logo Texpro en la parte superior del sidebar

### Header / Topbar
- Fondo: `--color-white` con `--shadow-sm`
- Título del módulo activo en `--color-primary`
- Iconos de usuario y notificaciones a la derecha

### Cards / Paneles
- Fondo: `--color-white`
- Borde: `1px solid --color-gray-mid`
- Border-radius: `--radius-md`
- Sombra: `--shadow-sm`

### Botones
```
Primario:    bg --color-primary    | texto blanco
Secundario:  bg --color-secondary  | texto blanco
Peligro:     bg --color-danger     | texto blanco
Outline:     border --color-primary| texto --color-primary
```

### Tablas de datos
- Header: `--color-primary` con texto blanco
- Filas alternas: `--color-gray-light`
- Hover fila: `rgba(0, 86, 179, 0.06)`

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

1. **Nunca** usar colores hardcodeados — siempre usar variables CSS (`--color-*`)
2. **Nunca** modificar el logo (proporciones, colores, efectos)
3. Todos los módulos comparten el mismo **sidebar** y **header**
4. Las fuentes deben cargarse desde `assets/` (no CDN externo en producción)
5. Los iconos de módulos usarán la librería **Lucide Icons** o equivalente SVG

---

*Última actualización: 2026-03-13 — Cualquier cambio debe ser aprobado antes de aplicarse a producción.*
