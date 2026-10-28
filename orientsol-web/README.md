# OrientSol 4.0 - Plataforma Web y Multiplataforma

[![Version](https://img.shields.io/badge/Versi%C3%B3n-4.0.0-blue.svg)](package.json)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-Pyodide%20%2B%20NumPy-F7931E?logo=webassembly)](https://pyodide.org/)
[![Security Audit](https://img.shields.io/badge/Security%20Audit-Grade%20A%2B%20(100%25)-brightgreen)](supabase_schema.sql)

Aplicación web moderna y multiplataforma para el cálculo, optimización y simulación de sistemas solares fotovoltaicos en superficies fijas y con seguimiento solar.

---

## 1. Arquitectura del Sistema

```text
orientsol-web/
├── src/
│   ├── components/       # Componentes visuales y ventanas de cálculo
│   │   ├── charts/       # Visualizadores de gráficas solares y polares en SVG nativo
│   │   ├── climate/      # Paneles de estudio (Fija anual, estacional, seguimiento 1 y 2 ejes)
│   │   ├── console/      # Consola interactiva de cálculo Python en tiempo real
│   │   ├── export/       # Exportador universal a PDF, CSV y Excel sanitizado (Anti-CWE-1236)
│   │   └── supabase/     # Modales de sincronización colaborativa en la nube
│   ├── database/         # Base de datos local de localidades y albedos
│   ├── i18n/             # Sistema de internacionalización completo (Español / English)
│   ├── python/           # Motor científico matemático en Python vectorizado (Pyodide)
│   │   ├── core/         # Geometría solar astronómica
│   │   ├── radiation/    # Descomposición Liu-Jordan y transposición a plano inclinado
│   │   ├── tracking/     # Seguidores 2 ejes, polar, azimutal y horizontal
│   │   ├── optimization/ # Inclinación óptima anual, estacional, mensual y mapas CTE
│   │   └── energy/       # Modelos energéticos (Simplificado y Osterwald)
│   ├── services/         # Servicios de integración externa (PVGIS, NASA POWER, ERA5, Supabase)
│   └── utils/            # Utilidades de seguridad, escape HTML y sanitización
├── electron/             # Entorno de escritorio nativo Windows (.exe) con IPC securizado
├── android/              # Entorno móvil nativo Android con Capacitor (.apk)
├── supabase/             # Edge Functions (Deno) y migraciones SQL seguras
└── public/               # Binarios locales de Pyodide WebAssembly y NumPy para modo offline
```

---

## 2. Puntos Clave de Seguridad Auditados y Blindados

La versión 4.0 ha sido sometida a una auditoría exhaustiva de seguridad ofensiva (Red Team) y pentesting, logrando una **calificación A+**:

1. **Aislamiento en Supabase (Prioridad 1):** RLS con bloqueo total de `DELETE` y `UPDATE` para el rol público `anon`. Inserción comunitaria abierta para *crowdsourcing* científico, protegiendo las 114 ciudades oficiales contra suplantación.
2. **Anti-SSRF en Electron IPC (Prioridad 2):** Validación estricta de URLs con lista blanca oficial, bloqueo de direcciones IP locales (RFC1918), localhost y metadatos en la nube.
3. **Anti-XSS Almacenado y Reflejado (Prioridad 3):** Sanitización contextual con DOMPurify y escape HTML estricto en todos los modales de búsqueda, sugerencias y tarjetas climáticas.
4. **Hardening de Proxies CORS y PVGIS (Prioridad 4):** Eliminación total de proxies de terceros no confiables, sustituidos por Supabase Edge Functions seguras en Deno y fallback a ERA5 Reanalysis.
5. **Anti-Inyección en Exportación de Fórmulas (Prioridad 5 / CWE-1236):** Neutralización de caracteres ejecutables (`=`, `+`, `-`, `@`, `|`, `%`) en exportaciones a CSV y Excel.
6. **Integridad Física PostgreSQL y Clave Primaria UUID (Prioridad 6):** Restricciones `CHECK` matemáticas y físicas en la base de datos, anti-spam `UNIQUE` y migración a **UUID v4 criptográfico**.

---

## 3. Comandos de Desarrollo y Compilación Multiplataforma (100% Offline)

### Entorno de Desarrollo Web
```bash
# Iniciar servidor local de desarrollo
npm run dev

# Compilar versión web para distribución final
npm run build
```

### Windows Desktop (Electron)
```bash
# Ejecutar directamente en escritorio Windows en modo desarrollo
npm run app:desktop

# Empaquetar instalador NSIS (.exe) y versión portable (.exe)
npm run build:win
# Binarios generados en: release/OrientSol 4.0 Setup 4.0.0.exe y release/OrientSol 4.0 4.0.0.exe
```

### macOS Desktop (Electron)
```bash
# Empaquetar imagen de disco (.dmg) y paquete .app (.zip) para macOS
npm run build:mac
# Binario generado en: release/OrientSol 4.0-4.0.0.dmg
```

### Android Mobile & Tablet (Capacitor)
```bash
# Sincronizar el bundle web compilado y el motor Pyodide WASM con el proyecto Android nativo
npm run cap:sync

# Compilar el archivo instalador APK autónomo
npm run build:apk
# Binario generado en: android/app/build/outputs/apk/debug/app-debug.apk

# Abrir en Android Studio para emulación y firma de release (Google Play Bundle .aab)
npm run cap:open:android
```

### Automatización CI/CD (GitHub Actions)
El repositorio incluye el flujo automatizado `.github/workflows/build-offline-releases.yml` que:
1. Compila los instaladores de **Windows (`.exe`)** en un runner `windows-latest`.
2. Compila la imagen de **macOS (`.dmg`)** en un runner `macos-latest`.
3. Compila el paquete de **Android (`.apk`)** con Java JDK 21 y Android SDK en un runner `ubuntu-latest`.
4. Publica automáticamente un **GitHub Release** con todos los binarios descargables listos para su uso offline sin conexión.

