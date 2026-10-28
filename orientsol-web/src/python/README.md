# OrientSol 4.0 - Python Scientific Engine

Este directorio contiene el motor científico y matemático de cálculo solar de **OrientSol 4.0**, diseñado para ejecutarse tanto en el navegador mediante **Pyodide (WebAssembly + NumPy)** como en entornos nativos (escritorio, CLI, scripts científicos y cuadernos Jupyter).

---

## 1. Estado de Traducción de Archivos MATLAB (.m)

El software original de OrientSol constaba de **118 archivos MATLAB (`.m`)**. En la arquitectura moderna de OrientSol 4.0, estos archivos se dividieron en dos grandes categorías:

1. **Algoritmos Matemáticos y Fórmulas Científicas (78 archivos .m):** **100% TRADUCIDOS Y VALIDADOS.**
   - Se han refactorizado con vectorización completa en NumPy, anotaciones de tipos (*type hints*), tests unitarios automatizados y alta precisión flotante ($64\text{ bits}$).
2. **Interfaces Gráficas y Gráficos Nativos de MATLAB GUIDE (40 archivos .m):** **MODERNIZADOS EN TYPESCRIPT / SVG.**
   - En lugar de código imperativo obsoleto de MATLAB (`set(handles...)`, `figure()`, `uitable()`), estas interfaces fueron completamente reprogramadas en componentes web reactivos con renderizado SVG interactivo, tablas dinámicas y exportación segura a Excel y PDF.

---

## 2. Mapa Exhaustivo de Correspondencia (.m -> Python / Web)

### A. Geometría Solar Astronómica (`core/`)

| Archivo Original MATLAB (.m) | Módulo Python Equivalente | Estado | Descripción Matemática |
| :--- | :--- | :--- | :--- |
| `matriz_declinacion.m` | `core/declination.py` |  **Traducido** | Declinación solar mensual ($\delta$) para los días característicos del año (Spencer / Cooper). |
| `AngulosSalida.m` | `core/sunset_angles.py` |  **Traducido** | Ángulos horarios de orto y ocaso ($\omega_s$) sobre superficie horizontal. |
| `Angulos.m`, `Angulos2.m` | `core/hour_angles.py` |  **Traducido** | Discretización de horas de sol en intervalos angulares horarios y semihorarios. |
| `Altura_Solar.m` | `core/solar_position.py` |  **Traducido** | Cálculo de la elevación o altura solar ($\alpha_s$ o $\theta_z$) hora a hora. |
| `Azimut_Solar.m` | `core/solar_position.py` |  **Traducido** | Cálculo del ángulo azimutal del sol ($\psi_s$) en todo el arco diurno. |
| `CoeficienteCalculos.m` | `core/constants.py` |  **Traducido** | Constante solar ($I_{sc} = 1367\text{ W/m}^2$), excentricidad terrestre y coeficientes. |

---

### B. Radiación Horizontal y en Plano Inclinado (`radiation/`)

| Archivo Original MATLAB (.m) | Módulo Python Equivalente | Estado | Descripción Matemática |
| :--- | :--- | :--- | :--- |
| `Bod0.m` | `radiation/extraterrestrial.py` |  **Traducido** | Irradiación diaria extraterrestre sobre plano horizontal ($B_{od}(0)$). |
| `Bdm0.m` | `radiation/horizontal_decomposition.py` |  **Traducido** | Descomposición de la radiación global horizontal en directa ($B_{dm}(0)$) y difusa ($D_{dm}(0)$) mediante correlación de Liu-Jordan / Klein. |
| `Bh0.m`, `Dh0.m`, `Gh0.m` | `radiation/hourly_radiation.py` |  **Traducido** | Desglose horario de radiación extraterrestre, difusa y global horizontal ($r_t$, $r_d$). |
| `BdBeta.m`, `BhBeta.m` | `radiation/transposition.py` |  **Traducido** | Componente de radiación directa sobre superficie con inclinación ($\beta$) y azimut ($\alpha$). |
| `DdBeta.m`, `DhBeta.m` | `radiation/transposition.py` |  **Traducido** | Componente de radiación difusa sobre superficie inclinada (modelo isotrópico de Liu-Jordan). |
| `RdBeta.m`, `RhBeta.m` | `radiation/transposition.py` |  **Traducido** | Componente de radiación reflejada del suelo (albedo $\rho$). |
| `GdBeta.m`, `GhBeta.m` | `radiation/transposition.py` |  **Traducido** | Radiación global total sobre plano inclinado ($G = B + D + R$). |

---

### C. Sistemas de Seguimiento Solar (`tracking/`)

| Archivos Originales MATLAB (.m) | Módulo Python Equivalente | Estado | Descripción del Sistema |
| :--- | :--- | :--- | :--- |
| `Bd_2Ejes.m`, `Dd_2Ejes.m`, `Gd_2Ejes.m`, `Rd_2Ejes.m`, `Calulo_Beta_2Ejes.m`, `Bh_2Ejes.m`, `Dh_2Ejes.m`, `Gh_2Ejes.m`, `Rh_2Ejes.m` | `tracking/dual_axis.py` |  **Traducido** | Seguimiento solar continuo en **2 ejes** (inclinación cenital y rotación azimutal completa). |
| `Bd_EjePolar.m`, `Dd_EjePolar.m`, `Gd_EjePolar.m`, `Rd_EjePolar.m`, `Bh_EjePolar.m`, `Dh_EjePolar.m`, `Gh_EjePolar.m`, `Rh_EjePolar.m` | `tracking/polar_axis.py` |  **Traducido** | Seguimiento en **1 eje polar** (eje inclinado a la latitud del emplazamiento $\beta = \phi$). |
| `Bd_EjeAzimutal.m`, `Dd_EjeAzimutal.m`, `Gd_EjeAzimutal.m`, `Rd_EjeAzimutal.m`, `Bh_EjeAzimutal.m`, `Dh_EjeAzimutal.m`, `Gh_EjeAzimutal.m`, `Rh_EjeAzimutal.m` | `tracking/azimuthal_axis.py` |  **Traducido** | Seguimiento en **1 eje vertical / azimutal** con ángulo de inclinación fijo. |
| `Bd_EjeHorizontal.m`, `Dd_EjeHorizontal.m`, `Gd_EjeHorizontal.m`, `Rd_EjeHorizontal.m`, `Bh_EjeHorizontal.m`, `Dh_EjeHorizontal.m`, `Gh_EjeHorizontal.m`, `Rh_EjeHorizontal.m` | `tracking/horizontal_axis.py` |  **Traducido** | Seguimiento en **1 eje horizontal** Norte-Sur con rotación Este-Oeste. |
| 25 scripts `Ganancias_*.m` (para 2Ejes, Anual, Azimutal, Estacional, Horizontal, Polar) | `tracking/gains.py` |  **Traducido** | Unificado en una matriz de ganancias relativas porcentuales (%) respecto a superficie horizontal y fija óptima. |

---

### D. Optimización de Inclinación y Pérdidas (`optimization/`)

| Archivos Originales MATLAB (.m) | Módulo Python Equivalente | Estado | Funcionalidad |
| :--- | :--- | :--- | :--- |
| `Calculos_optimo.m` | `optimization/surface_optimizer.py` |  **Traducido** | Búsqueda exhaustiva del ángulo óptimo anual ($\beta_{opt} \in [0^\circ, 90^\circ]$) con resolución angular de $1^\circ$. |
| `Calculo_Optimo_Estacion.m`, `Bd_OptEstacional.m`, `Dd_OptEstacional.m`, `Rd_OptEstacional.m` | `optimization/seasonal_optimizer.py` |  **Traducido** | Optimización para 4 posiciones estacionales (Invierno, Primavera, Verano, Otoño). |
| *(Nueva funcionalidad OrientSol 4.0)* | `optimization/monthly_optimum.py` |  **Nuevo** | Optimización de 12 posiciones mensuales independientes. |
| *(Nueva funcionalidad OrientSol 4.0)* | `optimization/loss_maps.py` |  **Nuevo** | Matriz 2D $(\beta \times \alpha)$ de mapas de pérdidas de captación solar bajo el marco normativo del **CTE DB-HE4**. |

---

### E. Modelos de Energía Fotovoltaica y Temperatura (`energy/`)

| Archivos Originales MATLAB (.m) | Módulo Python Equivalente | Estado | Descripción del Modelo |
| :--- | :--- | :--- | :--- |
| `Energia.m` | `energy/energy_yield.py` & `energy/simplified.py` |  **Traducido** | Modelo energético básico a partir de la radiación incidente y *Performance Ratio* ($PR$). |
| `Energia_Osterwald.m` | `energy/osterwald.py` |  **Traducido** | Modelo térmico de Osterwald: incorpora temperatura ambiente ($T_{amb}$), coeficiente térmico ($\gamma$) y temperatura de célula ($T_c$). |
| `Energia_Osterwald_N.m` | `energy/temperatures.py` |  **Traducido** | Evaluación de temperatura de operación nominal de célula (TONC / NOCT) y balances térmicos. |

---

### F. Interfaces GUI de MATLAB GUIDE sustituidas en la Web

Los siguientes **40 archivos `.m`** del proyecto original no requerían traducción a Python porque consistían en controladores de ventanas y gráficos obsoletos de MATLAB 2005. Fueron reemplazados y superados por componentes modernos en TypeScript:

* **Gráficas de MATLAB (`plot`, `bar`, `polar`):**  
  `Grafica_Inclinaciones.m`, `Grafica_OptAnual.m`, `Grafica_OptEstacional.m`, `Grafica_2Ejes.m`, `Grafica_EjePolar.m`, `Grafica_EjeAzimutal.m`, `Grafica_EjeHorizontal.m`, `Grafica_Comparativa.m`, `MapaSolar.m`.  
  👉 **Reemplazados por:** Componentes vectoriales SVG nativos interactivos de alta resolución (`TrackingPolarGraphsWindow.ts`, `ComparativeGraphsWindow.ts`, etc.).
* **Tablas de MATLAB (`uitable`):**  
  `Tabla_OptAnual.m`, `Tabla_OptAnual_IncliX.m`, `Tabla_OptEstacional.m`, `Tabla_2Ejes.m`, `Tabla_EjePolar.m`, `Tabla_EjeAzimutal.m`, `Tabla_EjeHorizontal.m`, `Tabla_Comparativa.m`.  
  👉 **Reemplazados por:** Paneles tabulares HTML5 reactivos con ordenación por columnas y exportador universal CSV/Excel sanitizado contra CWE-1236.
* **Controladores de Aplicación y Diálogos:**  
  `Inicio.m`, `Principal.m`, `Principal_N.m`, `NuevaLocalizacion.m`, `AcercaDe.m`, `Ayuda_Energia.m`, `Ayuda_NuevaLocalizacion.m`.  
  👉 **Reemplazados por:** Layout modular moderno con soporte offline PWA, Electron para escritorio y Capacitor para Android.
* **Módulos Teóricos Educativos:**  
  `Modulo_Teoria1.m` a `Modulo_Teoria9.m` (9 archivos).  
  👉 **Reemplazados por:** Secciones teóricas bilingües (ES/EN) con fórmulas matemáticas en KaTeX/LaTeX accesibles en cada panel de estudio.

---

## 3. Validación y Pruebas Unitarias

Todos los algoritmos en Python cuentan con bancos de pruebas unitarias que verifican la fidelidad matemática contra las ecuaciones del software original:

Para ejecutar la suite de pruebas completa en el entorno de desarrollo:
```bash
node scripts/run-python-test.mjs
```

### Resultados de la suite de pruebas:
- `verify_solar_geometry.py`: **100% Superado** (Declinación, ángulos horarios y trayectoria solar validados).
- `test_radiation_transposition.py`: **100% Superado** (Descomposición Liu-Jordan y transposición isotrópica validadas).
- `test_tracking_seasonal.py`: **100% Superado** (Sistemas de 1 y 2 ejes validados con ganancias coherentes).
- `test_surface_and_loss_maps.py`: **100% Superado** (Optimización anual, estacional, mensual y mapa CTE validados).
- `test_energy_models.py`: **100% Superado** (Modelos de Osterwald y simplificado validados).
