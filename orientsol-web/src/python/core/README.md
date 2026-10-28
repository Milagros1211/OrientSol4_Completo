# Módulo de Geometría Solar (`core/`)

Este módulo implementa los cálculos astronómicos y de geometría solar para cualquier latitud y día del año. Ha sido traducido al 100% desde los scripts originales de MATLAB a Python vectorizado con NumPy.

---

## Archivos y Equivalencias con MATLAB

| Archivo Python | Script MATLAB Original | Descripción y Fórmulas |
| :--- | :--- | :--- |
| `constants.py` | `CoeficienteCalculos.m` | Constante solar ($I_{sc} = 1367\text{ W/m}^2$), días característicos de cada mes ($n = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344]$) y factores de corrección de distancia Tierra-Sol. |
| `conversions.py` | *(Auxiliar matemático)* | Funciones de conversión angular bidireccional de alta velocidad (`deg2rad`, `rad2deg`) compatibles con escalares y matrices NumPy. |
| `declination.py` | `matriz_declinacion.m` | Cálculo de la declinación solar mensual ($\delta$) mediante la fórmula de Spencer / Cooper: $\delta = 23.45^\circ \cdot \sin\left(\frac{360}{365}(284 + n)\right)$. |
| `sunset_angles.py` | `AngulosSalida.m` | Ángulo horario de salida y puesta de sol ($\omega_s$): $\cos(\omega_s) = -\tan(\phi)\tan(\delta)$, con gestión de sol de medianoche y noche polar. |
| `hour_angles.py` | `Angulos.m`, `Angulos2.m` | Discretización del arco diurno en intervalos horarios y semihorarios ($\omega \in [-\omega_s, \omega_s]$). |
| `solar_position.py` | `Altura_Solar.m`, `Azimut_Solar.m` | Elevación solar ($\sin\alpha_s = \sin\phi\sin\delta + \cos\phi\cos\delta\cos\omega$) y azimut solar ($\psi_s$) en grados sexagesimales. |

---

## Estado de Validación
- Verificado y probado con éxito en [`verify_solar_geometry.py`](../verify_solar_geometry.py) con desviaciones menores a $10^{-6}$ grados respecto a las salidas de MATLAB y tablas astronómicas de referencia.
