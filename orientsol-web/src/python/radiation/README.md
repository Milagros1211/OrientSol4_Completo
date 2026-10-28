# Módulo de Radiación Solar (`radiation/`)

Este módulo implementa la descomposición de la radiación solar y su transposición sobre planos inclinados con cualquier ángulo de inclinación ($\beta$) y azimut ($\alpha$).

---

## Archivos y Equivalencias con MATLAB

| Archivo Python | Script MATLAB Original | Descripción y Modelo Físico |
| :--- | :--- | :--- |
| `extraterrestrial.py` | `Bod0.m` | Irradiación diaria extraterrestre horizontal ($B_{od}(0)$): integración analítica de la constante solar en función del ángulo de puesta de sol ($\omega_s$). |
| `horizontal_decomposition.py` | `Bdm0.m` | Descomposición de la radiación global horizontal diaria ($G_{dm}(0)$) en directa ($B_{dm}(0)$) y difusa ($D_{dm}(0)$) mediante el índice de claridad ($K_t$) y la correlación de Liu & Jordan / Klein. |
| `hourly_radiation.py` | `Bh0.m`, `Dh0.m`, `Gh0.m` | Factores de distribución horaria de radiación global ($r_t$) y difusa ($r_d$) de Collares-Pereira y Rabl para calcular perfiles horarios ($G_h, B_h, D_h$). |
| `transposition.py` | `BdBeta.m`, `BhBeta.m`, `DdBeta.m`, `DhBeta.m`, `RdBeta.m`, `RhBeta.m`, `GdBeta.m`, `GhBeta.m` | Transposición completa a plano inclinado ($\beta, \alpha$):<br>• Directa inclinada: $B(\beta) = B \cdot r_b$<br>• Difusa inclinada: modelo isotrópico de Liu-Jordan: $D(\beta) = D \cdot \frac{1 + \cos\beta}{2}$<br>• Reflejada / Albedo: $R(\beta) = G \cdot \rho \cdot \frac{1 - \cos\beta}{2}$<br>• Global: $G(\beta) = B(\beta) + D(\beta) + R(\beta)$. |

---

## Estado de Validación
- Verificado y probado con éxito en [`test_radiation_transposition.py`](../test_radiation_transposition.py) para múltiples inclinaciones fijas ($0^\circ, 15^\circ, 30^\circ, 45^\circ, 60^\circ, 75^\circ, 90^\circ$).
