import katex from 'katex';
import { formatNum } from '@/utils/formatters';

function renderTex(expr: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
    });
  } catch (err) {
    return `<code>${expr}</code>`;
  }
}

/**
 * Parses inline math like \( \beta \) into rendered KaTeX
 */
function renderInlineMath(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\\\\((.*?)\\\\\)/g, (_, expr) => renderTex(expr, false))
    .replace(/\\\((.*?)\\\)/g, (_, expr) => renderTex(expr, false));
}

export type SolarOperationType =
  | 'annual'
  | 'monthly'
  | 'seasonal'
  | 'polar'
  | 'azimuthal'
  | 'horizontal'
  | 'dual'
  | 'comparative';

interface OperationData {
  badge: string;
  title: string;
  summary: string;
  inputDescription: string;
  mathProcessTitle: string;
  mathSteps: { label: string; formula: string; note?: string }[];
  outputSummary: string;
}

function getOperationData(op: SolarOperationType, isEn: boolean, latitude: number, locationName: string): OperationData {
  const latStr = `${formatNum(latitude, 2)}°`;

  switch (op) {
    case 'annual':
      return {
        badge: isEn ? 'Operation 1 • Annual Optimum' : 'Operación 1 • Óptimo Anual',
        title: isEn
          ? 'Annual Optimal Tilt Search (Fixed Slope)'
          : 'Búsqueda del Ángulo Fijo Óptimo Anual',
        summary: isEn
          ? `Calculates the single, optimal fixed inclination angle β_optimal that maximizes total solar energy captured over the entire 365-day year at ${locationName} (φ = ${latStr}).`
          : `Calcula el ángulo de inclinación fijo único β_óptimo que maximiza la captación total de radiación solar acumulada a lo largo de los 365 días del año en ${locationName} (φ = ${latStr}).`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Solar Radiation:</strong> Global horizontal vector ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·day].</div>
              <div><strong>Site Coordinates:</strong> Local latitude ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Ground & Solar Day:</strong> Albedo ${renderTex('\\rho_{\\text{albedo}} = 0{,}20')} and Klein characteristic day ${renderTex('n_m')}.</div>
              <div><strong>Search Space:</strong> Discrete sweeping across 91 tilt angles ${renderTex('\\beta \\in [0^\\circ, 90^\\circ]')} (${renderTex('\\Delta\\beta = 1^\\circ')}).</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Radiación de Entrada:</strong> Vector mensual sobre horizontal ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·día].</div>
              <div><strong>Emplazamiento:</strong> Latitud geográfica local ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Entorno y Geometría:</strong> Albedo del suelo ${renderTex('\\rho_{\\text{albedo}} = 0{,}20')} y día medio de Klein ${renderTex('n_m')}.</div>
              <div><strong>Espacio de Búsqueda:</strong> Barrido discreto de 91 inclinaciones fijas ${renderTex('\\beta \\in [0^\\circ, 90^\\circ]')} (${renderTex('\\Delta\\beta = 1^\\circ')}).</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Horizontal Liu-Jordan Decomposition:' : '1. Descomposición Horizontal de Liu-Jordan:',
            formula: '\\begin{aligned} K_{\\text{claridad}, m} &= \\frac{G_{dm}(0)_m}{G_{0d}(\\phi_{\\text{lat}}, n_m)}, \\quad K_{\\text{difusa}, m} = 1{,}0 - 1{,}13\\, K_{\\text{claridad}, m} \\\\[2pt] D_{dm}(0)_m &= K_{\\text{difusa}, m} \\cdot G_{dm}(0)_m, \\quad B_{dm}(0)_m = G_{dm}(0)_m - D_{dm}(0)_m \\end{aligned}',
            note: isEn
              ? 'Splits global horizontal input radiation into direct beam and diffuse fractions.'
              : 'Separa la radiación horizontal de entrada en componente directa B_dm(0) y difusa D_dm(0).'
          },
          {
            label: isEn ? '2. Isotropic Transposition to 91 Tilt Angles:' : '2. Transposición Isotrópica a 91 Inclinaciones:',
            formula: '\\begin{aligned} G_{dm}(\\beta)_m &= B_{dm}(0)_m \\cdot R_b(\\phi_{\\text{lat}}, \\delta_m, \\beta) + D_{dm}(0)_m \\left( \\frac{1 + \\cos\\beta}{2} \\right) \\\\[2pt] &\\quad + G_{dm}(0)_m \\cdot \\rho_{\\text{albedo}} \\left( \\frac{1 - \\cos\\beta}{2} \\right) \\end{aligned}',
            note: isEn
              ? 'Applies Klein geometric direct beam factor R_b and isotropic sky vault diffuse transposition for β in [0°..90°].'
              : 'Aplica el factor geométrico R_b y la bóveda celeste isotrópica para cada inclinación fija β en [0°..90°].'
          },
          {
            label: isEn ? '3. Annual Energy Summation & Optimum Tilt:' : '3. Integración Anual y Búsqueda de Óptimo:',
            formula: '\\beta_{\\text{óptimo}} = \\arg\\max_{\\beta \\in [0^\\circ, 90^\\circ]} \\sum_{m=1}^{12} G_{dm}(\\beta)_m \\cdot N_{\\text{días}, m}',
            note: isEn
              ? '<div style="margin-top: 0.25rem; line-height: 1.45;"><strong>Why arg max and not max?</strong><br/>• <strong>max</strong> answers <em>"How much?"</em>: returns peak annual collected energy (kWh/m²).<br/>• <strong>arg max</strong> answers <em>"Which angle?"</em>: evaluates all 91 angles \\(\\beta \\in [0^\\circ, 90^\\circ]\\) and returns the <strong>optimal tilt angle in degrees (e.g., 38°)</strong> that achieves that peak, telling the solar installer exactly how to fix the structure.</div>'
              : '<div style="margin-top: 0.25rem; line-height: 1.45;"><strong>¿Por qué arg max y no max?</strong><br/>• <strong>max</strong> responde a <em>«¿Cuánto?»</em>: devuelve la energía anual máxima en kWh/m².<br/>• <strong>arg max</strong> responde a <em>«¿Cuál?»</em>: prueba los 91 ángulos \\(\\beta \\in [0^\\circ, 90^\\circ]\\) y devuelve el <strong>ángulo óptimo en grados (ej: 38°)</strong> que logra ese récord, indicando al instalador a cuántos grados fijar la estructura física.</div>'
          },
          {
            label: isEn ? '4. Annual Energy Gain vs Horizontal:' : '4. Balance de Ganancia Relativa vs Horizontal:',
            formula: '\\text{Ganancia (\\%)} = \\left[ \\frac{\\sum_{m=1}^{12} G_{dm}(\\beta_{\\text{óptimo}})_m \\cdot N_{\\text{días}, m} - \\sum_{m=1}^{12} G_{dm}(0)_m \\cdot N_{\\text{días}, m}}{\\sum_{m=1}^{12} G_{dm}(0)_m \\cdot N_{\\text{días}, m}} \\right] \\times 100',
            note: isEn ? 'Yield increase obtained by tilting the surface to the optimal angle.' : 'Incremento energético obtenido al inclinar la superficie al ángulo óptimo respecto al plano horizontal.'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Optimal Inclination:</strong> Single fixed annual angle ${renderTex('\\beta_{\\text{opt}}')} for physical installation.</div>
              <div><strong>Transposed Radiation:</strong> 12 monthly values ${renderTex('G_{dm}(\\beta)_m')} [kWh/m²·day].</div>
              <div><strong>Energy Gain Balance:</strong> Relative percentage improvement over horizontal ground.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Inclinación Óptima:</strong> Ángulo fijo único ${renderTex('\\beta_{\\text{óptimo}}')} para la fijación física de la estructura.</div>
              <div><strong>Irradiación Transpuesta:</strong> Vector de 12 meses ${renderTex('G_{dm}(\\beta)_m')} [kWh/m²·día].</div>
              <div><strong>Balance de Ganancia:</strong> Mejora porcentual relativa obtenida frente al plano horizontal.</div>
            </div>`
      };

    case 'monthly':
      return {
        badge: isEn ? 'Operation 2 • Monthly Optimum' : 'Operación 2 • Optimización Mensual',
        title: isEn
          ? 'Independent Monthly Tilt Optimization (12 Positions)'
          : 'Optimización Mensual Independiente (12 Ajustes al Año)',
        summary: isEn
          ? `Determines 12 distinct optimal tilt angles β_optimal(m), one for each individual month, adapting to seasonal solar elevation changes.`
          : `Determina 12 ángulos de inclinación óptimos independientes β_óptimo(m), uno para cada mes individual, adaptándose a la altura solar estacional.`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Solar Radiation:</strong> Monthly horizontal vector ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·day].</div>
              <div><strong>Site Coordinates:</strong> Geographic latitude ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Astronomical Declination:</strong> 12 monthly solar declination values ${renderTex('\\delta_m')}.</div>
              <div><strong>Search Process:</strong> 12 independent discrete sweeps across ${renderTex('\\beta \\in [0^\\circ, 90^\\circ]')}.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Radiación de Entrada:</strong> Vector mensual sobre horizontal ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·día].</div>
              <div><strong>Coordenadas del Sitio:</strong> Latitud geográfica local ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Declinación Astronómica:</strong> 12 valores de declinación solar mensual ${renderTex('\\delta_m')}.</div>
              <div><strong>Búsqueda Desacoplada:</strong> 12 barridos independientes de inclinación en ${renderTex('\\beta \\in [0^\\circ, 90^\\circ]')}.</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Month-by-Month Maximum Search:' : '1. Búsqueda Desacoplada del Máximo Mensual:',
            formula: '\\beta_{\\text{óptimo}, m} = \\arg\\max_{\\beta \\in [0^\\circ, 90^\\circ]} G_{dm}(\\beta)_m \\qquad (m = 1, \\dots, 12)',
            note: isEn
              ? '<strong>arg max per month:</strong> Evaluates all 91 angles for each individual month m, returning the 12 specific optimal angles \\(\\beta_{\\text{opt}, m}\\) that maximize daily irradiance in that exact month.'
              : '<strong>arg max mensual:</strong> Resuelve independientemente para cada mes m ∈ [1..12] cuál es el ángulo específico \\(\\beta_{\\text{óptimo}, m}\\) que maximiza la irradiación captada en ese mes concreto.'
          },
          {
            label: isEn ? '2. Solar Declination Coupling:' : '2. Relación Física con la Declinación Solar:',
            formula: '\\beta_{\\text{óptimo}, m} \\approx \\phi_{\\text{lat}} - \\delta_m',
            note: isEn
              ? 'In winter (low sun, negative declination), optimal tilt increases; in summer (high sun), optimal tilt decreases.'
              : 'En invierno (sol bajo, declinación negativa) la inclinación óptima aumenta; en verano (sol alto) disminuye.'
          },
          {
            label: isEn ? '3. Cumulative Monthly Optimized Annual Energy:' : '3. Energía Anual Acumulada con Ajuste Mensual:',
            formula: 'E_{\\text{anual, mensual}} = \\sum_{m=1}^{12} G_{dm}(\\beta_{\\text{óptimo}, m})_m \\cdot N_{\\text{días}, m}',
            note: isEn
              ? 'Annual total achieved with 12 monthly manual adjustments, reaching ~99% of single-axis tracking performance.'
              : 'Total anual alcanzado con 12 correcciones manuales al año, logrando ~99% del potencial de un seguidor en un eje.'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Monthly Optimal Tilt Vector:</strong> 12 independent angles ${renderTex('\\beta_{\\text{opt}, m}')} for seasonal structural readjustment.</div>
              <div><strong>Maximized Monthly Insolation:</strong> Profile yielding peak daily energy in each month.</div>
              <div><strong>Comparative Gain:</strong> Extra +3% to +6% energy yield over fixed annual tilt.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Vector de Inclinaciones Óptimas:</strong> 12 ángulos independientes ${renderTex('\\beta_{\\text{óptimo}, m}')} para ajuste periódico.</div>
              <div><strong>Máxima Captación Estacional:</strong> Perfil optimizado de energía diaria para cada mes del año.</div>
              <div><strong>Ganancia Adicional:</strong> Entre +3% y +6% de irradiación extra respecto al ángulo fijo anual.</div>
            </div>`
      };

    case 'seasonal':
      return {
        badge: isEn ? 'Operation 3 • Seasonal Tilt' : 'Operación 3 • Óptimo Estacional',
        title: isEn
          ? 'Seasonal Tilt Optimization (2 and 4 Changes per Year)'
          : 'Inclinación Óptima Estacional (2 y 4 Posiciones Anuales)',
        summary: isEn
          ? `Groups the 12 input months into seasonal periods S_k and computes the compromise optimal angle for each season.`
          : `Agrupa los 12 meses de entrada en bloques estacionales S_k y calcula la inclinación fija de compromiso óptima para cada periodo.`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Solar Radiation:</strong> Monthly horizontal vector ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·day].</div>
              <div><strong>Site Coordinates:</strong> Geographic latitude ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Calendar Grouping:</strong> 2 periods (Winter/Summer) or 4 periods (Winter, Spring/Autumn, Summer).</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Radiación de Entrada:</strong> Vector mensual sobre horizontal ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·día].</div>
              <div><strong>Coordenadas:</strong> Latitud geográfica local ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Partición de Calendario:</strong> 2 periodos (Invierno/Verano) o 4 periodos (Invierno, Equinoccios, Verano).</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Seasonal Energy Maximization per Block:' : '1. Maximización de Energía por Bloque Estacional:',
            formula: '\\beta_{\\text{estación}, k} = \\arg\\max_{\\beta \\in [0^\\circ, 90^\\circ]} \\sum_{m \\in S_k} G_{dm}(\\beta)_m \\cdot N_{\\text{días}, m}',
            note: isEn
              ? '<strong>arg max seasonal:</strong> Returns the single compromise tilt angle for seasonal group S_k that maximizes sum of energy captured across all months in that period.'
              : '<strong>arg max estacional:</strong> Devuelve la inclinación de compromiso óptima que maximiza la captación acumulada de todos los meses que integran el bloque estacional S_k.'
          },
          {
            label: isEn ? '2. Bi-Annual & Quad-Annual Rules:' : '2. Reglas Canónicas Semestrales y Trimestrales:',
            formula: '\\begin{aligned} \\text{2 Posiciones (Inv / Ver):} &\\quad \\beta_{\\text{ver}} \\approx \\phi_{\\text{lat}} - 15^\\circ, \\quad \\beta_{\\text{inv}} \\approx \\phi_{\\text{lat}} + 15^\\circ \\\\[2pt] \\text{4 Posiciones (Estacionales):} &\\quad \\beta_{\\text{ver}} \\approx \\phi_{\\text{lat}} - 23{,}4^\\circ, \\quad \\beta_{\\text{inv}} \\approx \\phi_{\\text{lat}} + 23{,}4^\\circ, \\quad \\beta_{\\text{equinoccios}} \\approx \\phi_{\\text{lat}} \\end{aligned}',
            note: isEn
              ? 'Provides physical rule-of-thumb comparison against exact numeric optimization.'
              : 'Permite contrastar la regla clásica empírica frente al óptimo numérico exacto.'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Compromise Angles:</strong> 2 or 4 seasonal tilt positions capturing ~95% of monthly potential.</div>
              <div><strong>Maintenance Efficiency:</strong> High yield gains without active motorization expenses.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Ángulos de Compromiso:</strong> 2 o 4 posiciones estacionales que capturan ~95% del potencial mensual.</div>
              <div><strong>Eficiencia Operativa:</strong> Incremento notable de generación sin incurrir en costes de motorización activa.</div>
            </div>`
      };

    case 'polar':
      return {
        badge: isEn ? 'Operation 4 • Polar Tracking' : 'Operación 4 • Seguidor Eje Polar',
        title: isEn
          ? 'Single-Axis Polar Solar Tracking (Equatorial Axis)'
          : 'Seguidor Solar en 1 Eje Polar (Eje Paralelo al de la Tierra)',
        summary: isEn
          ? `Tracks the sun around an axis tilted at an angle equal to the local latitude φ, following the solar hour angle ω from East to West.`
          : `Sigue al sol girando sobre un eje orientado Norte-Sur e inclinado un ángulo igual a la latitud φ, rotando de Este a Oeste con el ángulo horario solar ω.`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Direct Beam & Diffuse:</strong> Separated horizontal components ${renderTex('B_{dm}(0)_m')} and ${renderTex('D_{dm}(0)_m')}.</div>
              <div><strong>Axis Geometry:</strong> Tilt aligned with latitude ${renderTex(`\\beta_{\\text{eje}} = \\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Rotation Law:</strong> Constant diurnal rate ${renderTex('\\omega(t) = 15^\\circ \\cdot (t - 12\\text{h})')}.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Directa y Difusa:</strong> Componentes separadas ${renderTex('B_{dm}(0)_m')} y ${renderTex('D_{dm}(0)_m')} [kWh/m²·día].</div>
              <div><strong>Geometría del Eje:</strong> Inclinación paralela al eje terrestre ${renderTex(`\\beta_{\\text{eje}} = \\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Cinemática de Giro:</strong> Velocidad angular solar ${renderTex('\\omega(t) = 15^\\circ \\cdot (t - 12\\text{h})')}.</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Axis Alignment & Rotation Law:' : '1. Alineación Estructural y Ley de Giro Horario:',
            formula: '\\beta_{\\text{eje}} = \\phi_{\\text{lat}}, \\qquad \\gamma_{\\text{eje}} = 0^\\circ \\text{ (Sur astronómico)}, \\qquad \\omega(t) = 15^\\circ \\cdot (t - 12\\text{h})'
          },
          {
            label: isEn ? '2. Direct Beam Incidence Angle:' : '2. Ángulo de Incidencia sobre Superficie Polar:',
            formula: '\\cos\\theta_{\\text{incidencia}} = \\cos\\delta_m',
            note: isEn
              ? 'Incidence angle depends only on seasonal declination; diurnal cosine losses are eliminated completely.'
              : 'El ángulo de incidencia depende únicamente de la declinación estacional; las pérdidas diurnas por desalineación horaria son nulas.'
          },
          {
            label: isEn ? '3. Daily Polar Transposed Radiation:' : '3. Irradiación Diaria Transpuesta Polar:',
            formula: 'G_{dm,\\text{polar}} = B_{dm}(0)_m \\cdot R_{b,\\text{polar}}(\\phi_{\\text{lat}}, \\delta_m) + D_{dm}(0)_m \\left( \\frac{1 + \\cos\\phi_{\\text{lat}}}{2} \\right) + G_{dm}(0)_m \\cdot \\rho_{\\text{albedo}} \\left( \\frac{1 - \\cos\\phi_{\\text{lat}}}{2} \\right)'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Transposed Solar Yield:</strong> Polar tracked daily and annual energy vectors.</div>
              <div><strong>Annual Gain:</strong> +25% to +35% boost over fixed horizontal surface with a single motor.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Captación Transpuesta:</strong> Vector de irradiación diaria y energía anual sobre seguidor polar.</div>
              <div><strong>Ganancia Anual:</strong> Incremento de +25% a +35% sobre plano horizontal con un solo motor.</div>
            </div>`
      };

    case 'azimuthal':
      return {
        badge: isEn ? 'Operation 5 • Azimuthal Tracking' : 'Operación 5 • Seguidor Azimutal',
        title: isEn
          ? 'Single-Axis Azimuthal Tracking (Vertical Axis)'
          : 'Seguidor Solar en 1 Eje Azimutal (Eje Vertical con Inclinación Fija)',
        summary: isEn
          ? `Rotates around a vertical axis to match the solar azimuth γ_s, maintaining a constant fixed panel slope β.`
          : `Gira alrededor de un eje vertical perpendicular al terreno siguiendo el azimut del sol γ_s, manteniendo el panel a una inclinación fija β.`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Solar Radiation:</strong> Global horizontal vector ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·day].</div>
              <div><strong>Coordinates & Tilt:</strong> Latitude ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)} and selected fixed slope ${renderTex('\\beta_{\\text{fijo}}')}.</div>
              <div><strong>Tracking Axis:</strong> Vertical normal to ground ${renderTex('\\gamma_{\\text{panel}}(t) = \\gamma_{\\text{sol}}(t)')}.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Radiación de Entrada:</strong> Vector mensual sobre horizontal ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·día].</div>
              <div><strong>Coordenadas e Inclinación:</strong> Latitud ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)} e inclinación seleccionada ${renderTex('\\beta_{\\text{fijo}}')}.</div>
              <div><strong>Eje de Giro:</strong> Vertical normal al suelo con ${renderTex('\\gamma_{\\text{panel}}(t) = \\gamma_{\\text{sol}}(t)')}.</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Azimuthal Tracking Condition:' : '1. Condición de Encaramiento Azimutal:',
            formula: '\\gamma_{\\text{panel}}(t) = \\gamma_{\\text{sol}}(t)'
          },
          {
            label: isEn ? '2. Beam Incidence Cosine with Elevation α_s:' : '2. Coseno de Incidencia con Altura Solar α_s:',
            formula: '\\cos\\theta_{\\text{incidencia}}(t) = \\sin\\alpha_s(t) \\cos\\beta_{\\text{panel}} + \\cos\\alpha_s(t) \\sin\\beta_{\\text{panel}}',
            note: isEn
              ? 'Ensures maximum projected area perpendicular to solar azimuth throughout daylight hours.'
              : 'Garantiza máxima superficie proyectada perpendicularmente al azimut solar a lo largo de todo el día.'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Diurnal Profile Flattening:</strong> Significantly boosted early morning and late afternoon generation.</div>
              <div><strong>Annual Gain:</strong> Substantial energy yield improvement over static south-facing arrays.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Curva de Generación Ensanchada:</strong> Fuerte incremento de captación en primeras y últimas horas solares.</div>
              <div><strong>Ganancia Anual:</strong> Incremento notable de energía frente a estructuras orientadas al Sur fijo.</div>
            </div>`
      };

    case 'horizontal':
      return {
        badge: isEn ? 'Operation 6 • Horizontal Tracking' : 'Operación 6 • Seguidor Eje Horizontal',
        title: isEn
          ? 'Single-Axis Horizontal Tracking (East-West Axis)'
          : 'Seguidor Solar en 1 Eje Horizontal Este-Oeste',
        summary: isEn
          ? `Rotates around a horizontal ground axis oriented East-West, tilting panels North-South to follow solar meridian altitude.`
          : `Rota sobre un eje tendido horizontalmente en dirección Este-Oeste, inclinando los módulos de Norte a Sur según la elevación meridiana.`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Solar Radiation:</strong> Input vector ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·day].</div>
              <div><strong>Coordinates & Altitude:</strong> Latitude ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)} and solar elevation ${renderTex('\\alpha_s(t)')}.</div>
              <div><strong>Axis Orientation:</strong> Axis ${renderTex('\\beta_{\\text{eje}} = 0^\\circ')} aligned along East-West ${renderTex('\\gamma_{\\text{eje}} = 90^\\circ/270^\\circ')}.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Radiación de Entrada:</strong> Vector mensual sobre horizontal ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} [kWh/m²·día].</div>
              <div><strong>Coordenadas y Elevación:</strong> Latitud ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)} y altura solar ${renderTex('\\alpha_s(t)')}.</div>
              <div><strong>Orientación del Eje:</strong> Eje horizontal ${renderTex('\\beta_{\\text{eje}} = 0^\\circ')} tendido Este-Oeste ${renderTex('\\gamma_{\\text{eje}} = 90^\\circ/270^\\circ')}.</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Horizontal E-W Axis Alignment:' : '1. Orientación Estructural del Eje:',
            formula: '\\beta_{\\text{eje}} = 0^\\circ, \\qquad \\gamma_{\\text{eje}} = 90^\\circ \\text{ / } 270^\\circ \\text{ (Este-Oeste)}'
          },
          {
            label: isEn ? '2. Instantaneous Tilt Tracking Law:' : '2. Ley de Basculación Instantánea según Altura Solar:',
            formula: '\\beta_{\\text{seguidor}}(t) = 90^\\circ - \\alpha_s(t)',
            note: isEn
              ? 'Adapts surface slope to solar meridian altitude; ideal for low latitude tropical sites (φ < 25°).'
              : 'Adapta la pendiente del panel a la elevación cenital del sol; idóneo para latitudes tropicales (φ < 25°).'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Low Structural Profile:</strong> High wind resistance and low inter-row self-shading.</div>
              <div><strong>Optimum Deployment:</strong> Highly cost-effective utility-scale solution in equatorial latitudes.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Bajo Perfil Mecánico:</strong> Elevada resistencia a vientos y menor sombreado entre filas contiguas.</div>
              <div><strong>Despliegue Ideal:</strong> Alta rentabilidad en plantas fotovoltaicas a gran escala en regiones intertropicales.</div>
            </div>`
      };

    case 'dual':
      return {
        badge: isEn ? 'Operation 7 • Two-Axis Tracking' : 'Operación 7 • Seguidor a Dos Ejes',
        title: isEn
          ? 'Two-Axis Full Solar Tracking (Continuous Normal Incidence)'
          : 'Seguidor Solar a Dos Ejes (Incidencia Normal Continua)',
        summary: isEn
          ? `Follows the sun continuously in both azimuth and elevation, ensuring rays strike perpendicular to the surface at every moment.`
          : `Sigue al sol de forma continua y simultánea en azimut y elevación, garantizando incidencia perpendicular exacta (θ = 0°) en todo momento.`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Direct Beam & Diffuse:</strong> Separate vectors ${renderTex('B_{dm}(0)_m')} and ${renderTex('D_{dm}(0)_m')} at latitude ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Degrees of Freedom:</strong> 2 continuous motorized axes (azimuth ${renderTex('\\gamma')} and zenith tilt ${renderTex('\\beta')}).</div>
              <div><strong>Geometric Condition:</strong> Constant normal incidence angle ${renderTex('\\theta_{\\text{incidencia}} = 0^\\circ')}.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Componentes Directa y Difusa:</strong> Vectores ${renderTex('B_{dm}(0)_m')} y ${renderTex('D_{dm}(0)_m')} a latitud ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Grados de Libertad:</strong> 2 ejes motorizados continuos (azimut ${renderTex('\\gamma')} y elevación cenital ${renderTex('\\beta')}).</div>
              <div><strong>Condición Geométrica:</strong> Ángulo de incidencia perpendicular permanente ${renderTex('\\theta_{\\text{incidencia}} = 0^\\circ')}.</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Bi-Axial Angular Tracking Law:' : '1. Ley de Seguimiento Biaxial Simultáneo:',
            formula: '\\gamma_{\\text{panel}}(t) = \\gamma_{\\text{sol}}(t), \\qquad \\beta_{\\text{panel}}(t) = 90^\\circ - \\alpha_s(t)'
          },
          {
            label: isEn ? '2. Exact Orthogonal Beam Incidence (Cosine Loss Zero):' : '2. Incidencia Ortogonal Perfecta (Pérdidas por Coseno Cero):',
            formula: '\\theta_{\\text{incidencia}} = 0^\\circ \\implies \\cos\\theta_{\\text{incidencia}} = 1{,}0',
            note: isEn
              ? 'Zero projection cosine losses; captures 100% of available direct beam irradiance at all times.'
              : 'Pérdidas geométricas por coseno nulas; aprovecha el 100% de la radiación directa disponible a cualquier hora.'
          },
          {
            label: isEn ? '3. Maximum Theoretical Physical Limit:' : '3. Límite Físico Superior de Captación Solar:',
            formula: 'G_{dm,\\text{dos ejes}} = B_{dm}(0)_m \\cdot R_{b,\\text{normal}} + D_{dm,\\text{dos ejes}} + G_{\\text{albedo}}'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Benchmark Upper Limit:</strong> Absolute maximum physical solar yield possible on Earth.</div>
              <div><strong>Annual Gain:</strong> +35% to +45% yield increase over fixed horizontal plane.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Techo Físico Superior:</strong> Máxima captación de energía solar teóricamente posible sobre la Tierra.</div>
              <div><strong>Ganancia Anual:</strong> Incremento de +35% a +45% de energía producida frente a superficie horizontal fija.</div>
            </div>`
      };

    case 'comparative':
    default:
      return {
        badge: isEn ? 'Operation 8 • Multi-Model Benchmark' : 'Operación 8 • Comparativa Global',
        title: isEn
          ? 'Comparative Multi-Topology Solar Benchmark (8 Models)'
          : 'Comparativa Global Multimodelo (8 Topologías de Captación)',
        summary: isEn
          ? `Evaluates all 8 solar orientation and tracking topologies under identical input climatology data and physics rules.`
          : `Evalúa y contrasta en paralelo las 8 configuraciones de captación bajo las mismas condiciones climatológicas y motor físico de OrientSol.`,
        inputDescription: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Input Climatology:</strong> Normalized vector ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} and latitude ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Standardized Baseline:</strong> Consistent albedo ${renderTex('\\rho = 0{,}20')} and ambient temperature ${renderTex('T_{\\text{amb}}')}.</div>
              <div><strong>Topologies Compared:</strong> 8 distinct solar mounting architectures (fixed, seasonal, polar, azimuthal, horizontal, two-axis).</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Datos Climatológicos Comunes:</strong> Vector ${renderTex('G_{dm}(0) \\in \\mathbb{R}^{12}')} y latitud ${renderTex(`\\phi_{\\text{lat}} = ${latStr}`)}.</div>
              <div><strong>Base Normalizada:</strong> Mismo albedo ${renderTex('\\rho = 0{,}20')} y régimen térmico ${renderTex('T_{\\text{amb}}')} inyectados por igual.</div>
              <div><strong>Topologías Evaluadas:</strong> Las 8 arquitecturas solares (fija, estacional, polar, azimutal, horizontal, dos ejes).</div>
            </div>`,
        mathProcessTitle: isEn ? 'Mathematical Algorithm & Formulations:' : 'Procedimiento y Algoritmo Matemático:',
        mathSteps: [
          {
            label: isEn ? '1. Annual Energy Yield for Each Topology k in [1..8]:' : '1. Energía Anual Captada para Cada Topología k en [1..8]:',
            formula: 'E_{\\text{anual}, k} = \\sum_{m=1}^{12} G_{dm, k, m} \\cdot N_{\\text{días}, m}'
          },
          {
            label: isEn ? '2. Normalized Relative Percentage Gain vs Horizontal (0°):' : '2. Ganancia Porcentual Normalizada respecto a Horizontal (0°):',
            formula: '\\text{Ganancia}_k (\\%) = \\left[ \\frac{E_{\\text{anual}, k} - E_{\\text{anual}}(0^\\circ)}{E_{\\text{anual}}(0^\\circ)} \\right] \\times 100'
          }
        ],
        outputSummary: isEn
          ? `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Complete Performance Ranking:</strong> All 8 surfaces sorted from highest to lowest energy capture.</div>
              <div><strong>Engineering Decision Matrix:</strong> Trade-off between structural complexity, maintenance, and energy gains.</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 0.35rem;">
              <div><strong>Clasificación Energética Completa:</strong> Las 8 superficies ordenadas de mayor a menor captación anual.</div>
              <div><strong>Matriz de Decisión de Ingeniería:</strong> Evaluación del compromiso entre complejidad mecánica y ganancia solar.</div>
            </div>`
      };
  }
}

/**
 * Renders the responsive methodology and input data card for the currently selected solar operation.
 * Eliminates all empty gaps with a balanced 2-column context bar and full-width mathematical formulations.
 */
export function renderOperationMethodologyCard(
  op: SolarOperationType,
  isEn: boolean,
  latitude: number,
  locationName: string
): HTMLElement {
  const data = getOperationData(op, isEn, latitude, locationName);
  // Operation 8 (comparative) displays clean context without individual math breakdown
  const showMath = op !== 'comparative';
  const container = document.createElement('div');
  container.className = 'op-methodology-card-root';

  container.innerHTML = `
    <div class="op-methodology-card">
      <!-- Header Row with badge and toggle -->
      <div class="op-methodology-header">
        <div class="op-methodology-title-wrap">
          <span class="op-methodology-badge">${data.badge}</span>
          <h4 class="op-methodology-title">${data.title}</h4>
        </div>
        ${showMath ? `<button type="button" class="btn-toggle-op-methodology" id="btn-toggle-op-methodology" title="${isEn ? 'Collapse / Expand details' : 'Plegar / Desplegar detalles'}">
          <span class="toggle-icon">−</span>
          <span class="toggle-text">${isEn ? 'Mathematical Foundation' : 'Fundamento Matemático'}</span>
        </button>` : ''}
      </div>

      <!-- Collapsible Body with auto-adjusting height -->
      <div class="op-methodology-body" id="op-methodology-body">
        <div class="op-methodology-summary">
          ${data.summary}
        </div>

        <!-- Row 1: Balanced Context & Objectives (2 equal cards on desktop, stacked on mobile - NO GAPS!) -->
        <div class="op-context-row">
          <!-- Card 1: Input Data Processing -->
          <div class="op-methodology-subcard op-subcard-input">
            <div class="op-col-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0284c7" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <strong>${isEn ? 'Input Climatology Data Treatment:' : 'Tratamiento de Data Input Climatológica:'}</strong>
            </div>
            <div class="op-input-content">
              ${data.inputDescription}
            </div>
          </div>

          <!-- Card 2: Objective & Target Output -->
          <div class="op-methodology-subcard op-subcard-output">
            <div class="op-col-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="12 8 8 12 12 16 12 8"></polygon>
                <line x1="12" y1="16" x2="16" y2="12"></line>
              </svg>
              <strong>${isEn ? 'Physical Objective & Output:' : 'Objetivo Físico y Salida Esperada:'}</strong>
            </div>
            <div class="op-output-content">
              ${data.outputSummary}
            </div>
          </div>
        </div>

        <!-- Row 2: Mathematical Formulations & Steps (Full Width, Zero Holes!) -->
        ${showMath ? `
        <div class="op-methodology-math-card">
          <div class="op-col-header">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <strong>${data.mathProcessTitle}</strong>
          </div>
          <div class="op-math-steps-grid">
            ${data.mathSteps
              .map(
                (step) => `
              <div class="op-math-step-item">
                <div class="op-math-step-label">
                  <span class="step-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #0284c7; margin-right: 0.35rem;"></span>
                  <span>${step.label}</span>
                </div>
                <div class="math-formula-box op-math-box">
                  <div style="color: var(--text-main); text-align: center; width: 100%; overflow-x: auto;">
                    ${renderTex(step.formula, true)}
                  </div>
                </div>
                ${step.note ? `<div class="op-math-step-note">${renderInlineMath(step.note)}</div>` : ''}
              </div>
            `
              )
              .join('')}
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // Wire interactive collapse/expand toggle
  const toggleBtn = container.querySelector<HTMLButtonElement>('#btn-toggle-op-methodology');
  const bodyEl = container.querySelector<HTMLDivElement>('#op-methodology-body');
  if (toggleBtn && bodyEl) {
    toggleBtn.addEventListener('click', () => {
      const isCollapsed = bodyEl.classList.toggle('collapsed');
      const icon = toggleBtn.querySelector('.toggle-icon');
      if (icon) {
        icon.textContent = isCollapsed ? '+' : '−';
      }
    });
  }

  return container;
}
