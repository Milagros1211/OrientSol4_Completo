# 📁 Plantillas Oficiales de Climatología — OrientSol 4.0

Este directorio contiene las plantillas normalizadas listas para usar y cargar en la plataforma **OrientSol 4.0** (Pestaña 3: *Subida Digital CSV / JSON*).

---

## 📑 Índice de Archivos de Plantilla

| Archivo | Tipo de Carga | Formato | Descripción |
| :--- | :--- | :--- | :--- |
| [`plantilla_climatica_individual_vertical.csv`](./plantilla_climatica_individual_vertical.csv) | 1 Ciudad | CSV Vertical | **Recomendado**. Cabecera con `#` para localidad y coordenadas, y 12 filas mensuales con `mes;radiacion_media;temp_media`. |
| [`plantilla_climatica_individual_horizontal.csv`](./plantilla_climatica_individual_horizontal.csv) | 1 Ciudad | CSV Horizontal | Formato compacto en 3 filas: meses, `radiacion_media` y `temp_media`. |
| [`plantilla_climatica_lote_multi_orientsol.csv`](./plantilla_climatica_lote_multi_orientsol.csv) | Múltiples Ciudades | CSV Tabular (Batch) | Lote multi-estación: `emplazamiento;latitud;longitud;mes;radiacion_media;temp_media`. Compatible con ambos hemisferios. |
| [`plantilla_climatica_individual_orientsol.json`](./plantilla_climatica_individual_orientsol.json) | 1 Ciudad | JSON | Objeto JSON con vectores de 12 meses para $G_{dm}(0)$ y $T_{amb}$. |
| [`plantilla_climatica_lote_multi_orientsol.json`](./plantilla_climatica_lote_multi_orientsol.json) | Múltiples Ciudades | JSON Array (Batch) | Array de objetos JSON para simulación y procesamiento masivo. |

---

## ⚙️ Reglas de Uso y Detección Automática
- **Delimitadores admitidos:** Punto y coma `;` (oficial) o coma `,`.
- **Formato decimal:** Punto `.` (ej: `2.45`) o coma europea `,` (ej: `2,45`).
- **Unidades de Radiación:** Irradiancia diaria media $G_{dm}(0)$ en $\text{kWh/m}^2/\text{día}$. Si introduces radiación acumulada mensual en $\text{kWh/m}^2/\text{mes}$ (valores $> 25$), OrientSol la normaliza automáticamente dividiendo entre los días exactos del mes.
- **Unidades de Temperatura:** Temperatura media mensual ambiental $T_{amb}$ en $^{\circ}\text{C}$.
