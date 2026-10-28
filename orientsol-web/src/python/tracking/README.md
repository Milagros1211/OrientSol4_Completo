# Módulo de Seguimiento Solar (`tracking/`)

Este módulo implementa las formulaciones geométricas y cinemáticas para sistemas fotovoltaicos con seguidores solares de 1 y 2 ejes, calculando la radiación incidente desglosada y las ganancias energéticas comparativas.

---

## Archivos y Equivalencias con MATLAB

| Archivo Python | Scripts MATLAB Originales | Descripción del Seguidor |
| :--- | :--- | :--- |
| `dual_axis.py` | `Bd_2Ejes.m`, `Dd_2Ejes.m`, `Gd_2Ejes.m`, `Rd_2Ejes.m`, `Calulo_Beta_2Ejes.m`, `Bh_2Ejes.m`, `Dh_2Ejes.m`, `Gh_2Ejes.m`, `Rh_2Ejes.m` | **Seguidor de 2 Ejes:** Normal a la superficie siempre alineada con el vector solar ($\theta = 0^\circ, \cos\theta = 1$). Modula la inclinación y el azimut en tiempo real. |
| `polar_axis.py` | `Bd_EjePolar.m`, `Dd_EjePolar.m`, `Gd_EjePolar.m`, `Rd_EjePolar.m`, `Bh_EjePolar.m`, `Dh_EjePolar.m`, `Gh_EjePolar.m`, `Rh_EjePolar.m` | **Seguidor de 1 Eje Polar:** Eje de rotación orientado Norte-Sur e inclinado con un ángulo igual a la latitud del lugar ($\beta_{eje} = \phi$). |
| `azimuthal_axis.py` | `Bd_EjeAzimutal.m`, `Dd_EjeAzimutal.m`, `Gd_EjeAzimutal.m`, `Rd_EjeAzimutal.m`, `Bh_EjeAzimutal.m`, `Dh_EjeAzimutal.m`, `Gh_EjeAzimutal.m`, `Rh_EjeAzimutal.m` | **Seguidor de 1 Eje Azimutal:** Eje vertical con inclinación fija en el plano del panel ($\beta_{fijo}$) y rotación de azimut que sigue el azimut del sol. |
| `horizontal_axis.py` | `Bd_EjeHorizontal.m`, `Dd_EjeHorizontal.m`, `Gd_EjeHorizontal.m`, `Rd_EjeHorizontal.m`, `Bh_EjeHorizontal.m`, `Dh_EjeHorizontal.m`, `Gh_EjeHorizontal.m`, `Rh_EjeHorizontal.m` | **Seguidor de 1 Eje Horizontal:** Eje horizontal Norte-Sur orientado hacia el ecuador con rotación Este-Oeste ($\beta_{eje} = 0^\circ$). |
| `gains.py` | 25 archivos `Ganancias_*.m` (`Ganancias_Bd_*.m`, `Ganancias_Dd_*.m`, `Ganancias_Gd_*.m`, `Ganancias_Rd_*.m` para todas las configuraciones) | **Matriz de Ganancias Relativas:** Unifica los 25 scripts de MATLAB en una función vectorizada que calcula el porcentaje de ganancia (\%) y factor de incremento respecto a la superficie horizontal de referencia ($0^\circ$) y superficie fija óptima anual ($\beta_{opt}$). |

---

## Estado de Validación
- Verificado y probado con éxito en [`test_tracking_seasonal.py`](../test_tracking_seasonal.py). Ganancias anuales típicas calculadas en Madrid:
  - Seguimiento 2 ejes: $\approx +44.5\%$ sobre plano horizontal.
  - Seguimiento eje polar: $\approx +40.8\%$ sobre plano horizontal.
  - Seguimiento eje azimutal: $\approx +37.9\%$ sobre plano horizontal.
  - Seguimiento eje horizontal: $\approx +30.3\%$ sobre plano horizontal.
