-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 13-03-2026 a las 16:24:11
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12
--
-- Base de datos: `bdtexpro`
-- Fuente de verdad del esquema para RSProyecto
--
-- TABLAS:
--   usuario              - Usuarios del sistema (auth) [renombrada desde ventas_usuario]
--   usuario_vendedor     - Códigos de vendedor asociados a cada usuario (N:1)
--   vendedor_meta        - Metas anuales por usuario vendedor
--   usuario_permiso      - Permisos adicionales por usuario
--   factura_compartida   - Facturas compartidas entre vendedores
--   tasas_descuentos     - Tasas de descuento anuales
--
-- RELACIONES FK:
--   usuario_vendedor.usuario_id   -> usuario.id
--   vendedor_meta.usuario_id      -> usuario.id
--   usuario_permiso.usuario_id    -> usuario.id
--   factura_compartida.usuario_id -> usuario.id

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- --------------------------------------------------------
-- Estructura de tabla: `factura_compartida`
-- --------------------------------------------------------

CREATE TABLE `factura_compartida` (
  `id` bigint(20) NOT NULL,
  `folio` varchar(50) NOT NULL,
  `anio` int(11) NOT NULL,
  `mes` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `cliente` varchar(200) NOT NULL,
  `monto_neto` decimal(15,2) NOT NULL,
  `monto_asignado` decimal(15,2) NOT NULL,
  `porcentaje` decimal(5,2) NOT NULL,
  `rol` varchar(20) NOT NULL,
  `cod_vendedor_principal` varchar(20) NOT NULL,
  `cod_vendedor_compartido` varchar(20) NOT NULL,
  `nombre_vendedor_compartido` varchar(100) NOT NULL,
  `fecha_registro` datetime(6) NOT NULL,
  `usuario_id` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla: `tasas_descuentos`
-- --------------------------------------------------------

CREATE TABLE `tasas_descuentos` (
  `id` int(11) NOT NULL,
  `anio` int(11) DEFAULT NULL,
  `fecha_corte` date DEFAULT NULL,
  `porcentaje` decimal(5,2) DEFAULT NULL,
  `orden` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla: `usuario_permiso`
-- --------------------------------------------------------

CREATE TABLE `usuario_permiso` (
  `id` bigint(20) NOT NULL,
  `permiso` varchar(100) NOT NULL,
  `usuario_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla: `usuario_vendedor`
-- --------------------------------------------------------

CREATE TABLE `usuario_vendedor` (
  `id` bigint(20) NOT NULL,
  `cod_vendedor` varchar(20) NOT NULL,
  `tipo` varchar(1) NOT NULL,   -- 'P' = principal, 'C' = compartido
  `usuario_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla: `vendedor_meta`
-- --------------------------------------------------------

CREATE TABLE `vendedor_meta` (
  `id` bigint(20) NOT NULL,
  `fecha` date NOT NULL,
  `meta` decimal(15,2) NOT NULL,
  `usuario_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla: `usuario`  [renombrada desde ventas_usuario]
-- --------------------------------------------------------

CREATE TABLE `usuario` (
  `id` bigint(20) NOT NULL,
  `password` varchar(128) NOT NULL,
  `last_login` datetime(6) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(254) NOT NULL,
  `area` varchar(100) NOT NULL,
  `codigo` varchar(20) NOT NULL,
  `tema` varchar(20) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `is_admin` tinyint(1) NOT NULL,
  `fecha_creacion` datetime(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Índices
ALTER TABLE `factura_compartida`
  ADD PRIMARY KEY (`id`),
  ADD KEY `factura_compartida_usuario_id_fk` (`usuario_id`);

ALTER TABLE `tasas_descuentos`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `usuario_permiso`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `usuario_permiso_usuario_id_permiso_uniq` (`usuario_id`, `permiso`);

ALTER TABLE `usuario_vendedor`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `usuario_vendedor_usuario_id_cod_vendedor_uniq` (`usuario_id`, `cod_vendedor`);

ALTER TABLE `vendedor_meta`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `vendedor_meta_usuario_id_fecha_uniq` (`usuario_id`, `fecha`);

ALTER TABLE `usuario`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

-- AUTO_INCREMENT
ALTER TABLE `factura_compartida` MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;
ALTER TABLE `tasas_descuentos`   MODIFY `id` int(11)    NOT NULL AUTO_INCREMENT;
ALTER TABLE `usuario_permiso`    MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;
ALTER TABLE `usuario_vendedor`   MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;
ALTER TABLE `vendedor_meta`      MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;
ALTER TABLE `usuario`            MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

-- Foreign Keys
ALTER TABLE `factura_compartida`
  ADD CONSTRAINT `factura_compartida_usuario_id_fk`
  FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`);

ALTER TABLE `usuario_permiso`
  ADD CONSTRAINT `usuario_permiso_usuario_id_fk`
  FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`);

ALTER TABLE `usuario_vendedor`
  ADD CONSTRAINT `usuario_vendedor_usuario_id_fk`
  FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`);

ALTER TABLE `vendedor_meta`
  ADD CONSTRAINT `vendedor_meta_usuario_id_fk`
  FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`);

COMMIT;
