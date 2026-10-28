import type {
  SolarBridgeSimulationResult,
  MonthlyCaptureLossMap,
  SeasonalCaptureLossMap,
} from '../../services/bridge/solarCalculationBridge';
import { formatNum, formatInt, formatPercent } from '../../utils/formatters';

const MONTH_NAMES_ES: string[] = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_NAMES_EN: string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export interface CaptureLossMapSectionProps {
  mode: 'annual' | 'monthly' | 'seasonal';
  simulationResult: SolarBridgeSimulationResult;
  isEn?: boolean;
  initialMonth?: number;
  initialSeason?: number;
  onMonthChange?: (monthIndex: number, optimalBeta: number) => void;
  onSeasonChange?: (seasonIndex: number, optimalBeta: number) => void;
}

/**
 * Bilinear interpolation for loss % and incident daily radiation
 * on a discrete grid of betas (19 rows) and alphas (25 cols).
 */
function interpolateLossAndRadiation(
  betas: number[],
  alphas: number[],
  lossMatrix: number[][],
  radMatrix: number[][],
  targetBeta: number,
  targetAlpha: number
): { loss: number; radiation: number } {
  const minB = betas[0];
  const maxB = betas[betas.length - 1];
  const minA = alphas[0];
  const maxA = alphas[alphas.length - 1];

  const bClamped = Math.max(minB, Math.min(maxB, targetBeta));
  const aClamped = Math.max(minA, Math.min(maxA, targetAlpha));

  let i = 0;
  for (let idx = 0; idx < betas.length - 1; idx++) {
    if (bClamped >= betas[idx] && bClamped <= betas[idx + 1]) {
      i = idx;
      break;
    }
  }

  let j = 0;
  for (let idx = 0; idx < alphas.length - 1; idx++) {
    if (aClamped >= alphas[idx] && aClamped <= alphas[idx + 1]) {
      j = idx;
      break;
    }
  }

  const b0 = betas[i];
  const b1 = betas[i + 1] ?? b0;
  const a0 = alphas[j];
  const a1 = alphas[j + 1] ?? a0;

  const tb = b1 === b0 ? 0 : (bClamped - b0) / (b1 - b0);
  const ta = a1 === a0 ? 0 : (aClamped - a0) / (a1 - a0);

  const l00 = lossMatrix[i][j];
  const l01 = lossMatrix[i][j + 1] ?? l00;
  const l10 = lossMatrix[i + 1]?.[j] ?? l00;
  const l11 = lossMatrix[i + 1]?.[j + 1] ?? l01;

  const interpLoss =
    (1 - tb) * (1 - ta) * l00 +
    (1 - tb) * ta * l01 +
    tb * (1 - ta) * l10 +
    tb * ta * l11;

  const r00 = radMatrix[i][j];
  const r01 = radMatrix[i][j + 1] ?? r00;
  const r10 = radMatrix[i + 1]?.[j] ?? r00;
  const r11 = radMatrix[i + 1]?.[j + 1] ?? r01;

  const interpRad =
    (1 - tb) * (1 - ta) * r00 +
    (1 - tb) * ta * r01 +
    tb * (1 - ta) * r10 +
    tb * ta * r11;

  return {
    loss: Math.max(0, Math.round(interpLoss * 10) / 10),
    radiation: Math.max(0, Math.round(interpRad * 100) / 100),
  };
}

/**
 * Returns RGB tuple based on CTE DB-HE4 loss thresholds:
 * - 0% to 10%: Deep emerald to bright green (Límite General)
 * - 10% to 20%: Amber/Yellow (Superposición)
 * - 20% to 40%: Warm Orange (Integración Arquitectónica)
 * - > 40%: Deep Crimson/Wine (No conforme)
 */
function getLossRgb(loss: number): [number, number, number] {
  if (loss <= 10.0) {
    const t = Math.max(0, Math.min(1, loss / 10.0));
    // [5, 150, 105] to [16, 185, 129]
    return [
      Math.round(5 + t * 11),
      Math.round(150 + t * 35),
      Math.round(105 + t * 24),
    ];
  } else if (loss <= 20.0) {
    const t = Math.max(0, Math.min(1, (loss - 10.0) / 10.0));
    // [180, 150, 15] to [245, 158, 11]
    return [
      Math.round(180 + t * 65),
      Math.round(150 + t * 8),
      Math.round(15 - t * 4),
    ];
  } else if (loss <= 40.0) {
    const t = Math.max(0, Math.min(1, (loss - 20.0) / 20.0));
    // [245, 158, 11] to [220, 38, 38]
    return [
      Math.round(245 - t * 25),
      Math.round(158 - t * 120),
      Math.round(11 + t * 27),
    ];
  } else {
    const t = Math.max(0, Math.min(1, (loss - 40.0) / 30.0));
    // [220, 38, 38] to [127, 29, 29]
    return [
      Math.round(220 - t * 93),
      Math.round(38 - t * 9),
      Math.round(38 - t * 9),
    ];
  }
}

export function renderCaptureLossMapSection(props: CaptureLossMapSectionProps): HTMLElement {
  const { mode, simulationResult: res, isEn = false, onMonthChange, onSeasonChange } = props;
  const container = document.createElement('div');
  container.className = 'capture-loss-map-section result-card wide-card';
  container.style.marginTop = '1.25rem';
  container.style.marginBottom = '1.25rem';

  let selectedMonthIdx = props.initialMonth ?? 0;
  let selectedSeasonIdx = props.initialSeason ?? 0;

  // Selected evaluation point with 1-degree resolution
  let evaluatedBeta = 35;
  let evaluatedAlpha = 0;
  let hasUserSelectedPoint = false;

  const getCteClass = (loss: number) => {
    if (loss <= 10.0) return 'loss-cell-green';
    if (loss <= 20.0) return 'loss-cell-yellow';
    if (loss <= 40.0) return 'loss-cell-orange';
    return 'loss-cell-red';
  };

  function renderContent() {
    const lossMap = res.captureLossMap;
    if (!lossMap || !lossMap.betasDeg || !lossMap.alphasDeg) {
      container.innerHTML = `<div class="alert alert-warning">${isEn ? 'Capture loss map data is not available.' : 'Datos del mapa de pérdidas de captación no disponibles.'}</div>`;
      return;
    }

    const currentBetas = lossMap.betasDeg;
    const currentAlphas = lossMap.alphasDeg;
    let currentLossMatrix = lossMap.lossPercentageMatrix;
    let currentRadMatrix = lossMap.radiationMatrixKwhM2Day;
    let currentOptPoint = lossMap.optimalPoint;
    let currentCteZones = lossMap.cteZones;

    if (mode === 'monthly' && lossMap.monthlyMaps && lossMap.monthlyMaps.length === 12) {
      const mMap: MonthlyCaptureLossMap = lossMap.monthlyMaps[selectedMonthIdx];
      currentLossMatrix = mMap.lossPercentageMatrix;
      currentRadMatrix = mMap.radiationMatrixKwhM2Day;
      currentOptPoint = {
        betaDeg: mMap.optimalPoint.betaDeg,
        alphaDeg: mMap.optimalPoint.alphaDeg,
        maxDailyRadiationKwh: mMap.optimalPoint.maxDailyRadiationKwh,
        maxAnnualRadiationKwhM2: mMap.optimalPoint.maxDailyRadiationKwh * 365,
      };
      currentCteZones = mMap.cteZones;
    } else if (mode === 'seasonal') {
      let sMap: SeasonalCaptureLossMap | undefined = lossMap.seasonalMaps?.[selectedSeasonIdx];

      // Defensive fallback if seasonalMaps is not directly present: calculate from monthlyMaps
      if (!sMap && lossMap.monthlyMaps && lossMap.monthlyMaps.length === 12) {
        const seasonMonthIndices = [
          [11, 0, 1], // winter
          [2, 3, 4],  // spring
          [5, 6, 7],  // summer
          [8, 9, 10], // autumn
        ][selectedSeasonIdx] || [11, 0, 1];

        const seasonNamesEs = ['Invierno', 'Primavera', 'Verano', 'Otoño'];
        const seasonNamesEn = ['Winter', 'Spring', 'Summer', 'Autumn'];
        const seasonMonthsLabelEs = ['Dic - Ene - Feb', 'Mar - Abr - May', 'Jun - Jul - Ago', 'Sep - Oct - Nov'];
        const seasonMonthsLabelEn = ['Dec - Jan - Feb', 'Mar - Apr - May', 'Jun - Jul - Aug', 'Sep - Oct - Nov'];

        const nRows = currentBetas.length;
        const nCols = currentAlphas.length;
        const sRad: number[][] = Array.from({ length: nRows }, () => new Array(nCols).fill(0));
        let maxRad = 0;
        let bestB = 0;
        let bestA = 0;

        for (let r = 0; r < nRows; r++) {
          for (let c = 0; c < nCols; c++) {
            let sum = 0;
            for (const mIdx of seasonMonthIndices) {
              sum += lossMap.monthlyMaps[mIdx].radiationMatrixKwhM2Day[r][c];
            }
            const avg = sum / seasonMonthIndices.length;
            sRad[r][c] = avg;
            if (avg > maxRad) {
              maxRad = avg;
              bestB = currentBetas[r];
              bestA = currentAlphas[c];
            }
          }
        }

        const totalCells = nRows * nCols;
        let count10 = 0;
        let count20 = 0;
        let count40 = 0;
        const sLoss: number[][] = Array.from({ length: nRows }, () => new Array(nCols).fill(0));
        for (let r = 0; r < nRows; r++) {
          for (let c = 0; c < nCols; c++) {
            const loss = maxRad > 0 ? ((maxRad - sRad[r][c]) / maxRad) * 100 : 0;
            sLoss[r][c] = loss;
            if (loss <= 10.0) count10++;
            if (loss <= 20.0) count20++;
            if (loss <= 40.0) count40++;
          }
        }

        sMap = {
          seasonIndex: selectedSeasonIdx,
          seasonKey: (['winter', 'spring', 'summer', 'autumn'][selectedSeasonIdx] || 'winter') as any,
          seasonName: seasonNamesEs[selectedSeasonIdx],
          seasonNameEn: seasonNamesEn[selectedSeasonIdx],
          monthsIncluded: seasonMonthsLabelEs[selectedSeasonIdx],
          monthsIncludedEn: seasonMonthsLabelEn[selectedSeasonIdx],
          optimalPoint: {
            betaDeg: bestB,
            alphaDeg: bestA,
            maxDailyRadiationKwh: Math.round(maxRad * 1000) / 1000,
          },
          radiationMatrixKwhM2Day: sRad,
          lossPercentageMatrix: sLoss,
          cteZones: {
            generalPctCompliant: Math.round((count10 / totalCells) * 1000) / 10,
            superpositionPctCompliant: Math.round((count20 / totalCells) * 1000) / 10,
            integrationPctCompliant: Math.round((count40 / totalCells) * 1000) / 10,
          },
        };
      }

      if (sMap) {
        currentLossMatrix = sMap.lossPercentageMatrix;
        currentRadMatrix = sMap.radiationMatrixKwhM2Day;
        currentOptPoint = {
          betaDeg: sMap.optimalPoint.betaDeg,
          alphaDeg: sMap.optimalPoint.alphaDeg,
          maxDailyRadiationKwh: sMap.optimalPoint.maxDailyRadiationKwh,
          maxAnnualRadiationKwhM2: sMap.optimalPoint.maxDailyRadiationKwh * 365,
        };
        currentCteZones = sMap.cteZones;
      }
    }

    // Default evaluated point to optimum on initial load or reset
    if (!hasUserSelectedPoint) {
      evaluatedBeta = Math.round(currentOptPoint.betaDeg);
      evaluatedAlpha = Math.round(currentOptPoint.alphaDeg);
    }

    const monthNames: string[] = isEn ? MONTH_NAMES_EN : MONTH_NAMES_ES;
    const seasonNamesEs = ['Invierno', 'Primavera', 'Verano', 'Otoño'];
    const seasonNamesEn = ['Winter', 'Spring', 'Summer', 'Autumn'];
    const activeSeasonName = isEn ? seasonNamesEn[selectedSeasonIdx] : seasonNamesEs[selectedSeasonIdx];

    const titleText = mode === 'annual'
      ? (isEn ? 'Capture Loss Map (CTE DB-HE4) — Annual Global Radiation' : 'Mapa de Pérdidas de Captación (CTE DB-HE4) — Inclinación Óptima Anual')
      : mode === 'monthly'
      ? (isEn ? 'Capture Loss Map (CTE DB-HE4) — Monthly Optimization' : 'Mapa de Pérdidas de Captación (CTE DB-HE4) — Optimizaciones Mensuales')
      : (isEn ? 'Capture Loss Map (CTE DB-HE4) — Seasonal Optimal Tilt' : 'Mapa de Pérdidas de Captación (CTE DB-HE4) — Inclinación Óptima Estacional');

    const optBadgeText = mode === 'annual'
      ? (isEn
          ? `Optimal: Inc = ${formatNum(Number(currentOptPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(currentOptPoint.alphaDeg), 1)}° | ${formatNum(currentOptPoint.maxDailyRadiationKwh, 2)} kWh/m²/day`
          : `Óptimo Anual: Inc = ${formatNum(Number(currentOptPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(currentOptPoint.alphaDeg), 1)}° | ${formatNum(currentOptPoint.maxDailyRadiationKwh, 2)} kWh/m²/día`)
      : mode === 'monthly'
      ? (isEn
          ? `Month Optimum (${monthNames[selectedMonthIdx]}): Inc = ${formatNum(Number(currentOptPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(currentOptPoint.alphaDeg), 1)}° | ${formatNum(currentOptPoint.maxDailyRadiationKwh, 2)} kWh/m²/day`
          : `Óptimo del mes (${monthNames[selectedMonthIdx]}): Inc = ${formatNum(Number(currentOptPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(currentOptPoint.alphaDeg), 1)}° | ${formatNum(currentOptPoint.maxDailyRadiationKwh, 2)} kWh/m²/día`)
      : (isEn
          ? `Season Optimum (${activeSeasonName}): Inc = ${formatNum(Number(currentOptPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(currentOptPoint.alphaDeg), 1)}° | ${formatNum(currentOptPoint.maxDailyRadiationKwh, 2)} kWh/m²/day`
          : `Óptimo Estacional (${activeSeasonName}): Inc = ${formatNum(Number(currentOptPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(currentOptPoint.alphaDeg), 1)}° | ${formatNum(currentOptPoint.maxDailyRadiationKwh, 2)} kWh/m²/día`);

    let selectorHtml = '';
    if (mode === 'monthly') {
      selectorHtml = `
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-top: 0.5rem; flex-wrap: wrap;">
          <label for="loss-map-month-select" style="font-size: 0.82rem; font-weight: 700; color: var(--text-main);">
            ${isEn ? 'Select Month for Capture Map:' : 'Seleccionar mes para el mapa de captación:'}
          </label>
          <select id="loss-map-month-select" class="form-select form-select-sm loss-map-month-dropdown" style="width: auto; min-width: 170px; font-weight: 600;">
            ${monthNames.map((name: string, i: number) => `
              <option value="${i}" ${i === selectedMonthIdx ? 'selected' : ''}>
                ${i + 1}. ${name} (Inc = ${lossMap.monthlyMaps ? formatNum(Number(lossMap.monthlyMaps[i].optimalPoint.betaDeg), 1) : '0,0'}°)
              </option>
            `).join('')}
          </select>
          <span style="font-size: 0.76rem; color: var(--text-dim);">
            ${isEn ? 'Displays CTE losses and highlights optimum for the selected month' : 'Muestra pérdidas CTE y ángulo óptimo del mes seleccionado'}
          </span>
        </div>
      `;
    } else if (mode === 'seasonal') {
      const seasonDefs = [
        { nameEs: 'Invierno', nameEn: 'Winter', monthsEs: 'Dic - Ene - Feb', monthsEn: 'Dec - Jan - Feb', fallbackBeta: res.seasonal?.winterTiltDeg ?? currentOptPoint.betaDeg },
        { nameEs: 'Primavera', nameEn: 'Spring', monthsEs: 'Mar - Abr - May', monthsEn: 'Mar - Apr - May', fallbackBeta: res.seasonal?.springTiltDeg ?? currentOptPoint.betaDeg },
        { nameEs: 'Verano', nameEn: 'Summer', monthsEs: 'Jun - Jul - Ago', monthsEn: 'Jun - Jul - Aug', fallbackBeta: res.seasonal?.summerTiltDeg ?? currentOptPoint.betaDeg },
        { nameEs: 'Otoño', nameEn: 'Autumn', monthsEs: 'Sep - Oct - Nov', monthsEn: 'Sep - Oct - Nov', fallbackBeta: res.seasonal?.autumnTiltDeg ?? currentOptPoint.betaDeg },
      ];

      selectorHtml = `
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-top: 0.5rem; flex-wrap: wrap;">
          <label for="loss-map-season-select" style="font-size: 0.82rem; font-weight: 700; color: var(--text-main);">
            ${isEn ? 'Select Season for Capture Map:' : 'Seleccionar estación para el mapa de captación:'}
          </label>
          <select id="loss-map-season-select" class="form-select form-select-sm loss-map-month-dropdown" style="width: auto; min-width: 260px; font-weight: 600;">
            ${seasonDefs.map((s, i) => {
              const sMap = lossMap.seasonalMaps?.[i];
              const optBeta = sMap ? sMap.optimalPoint.betaDeg : s.fallbackBeta;
              const optAlpha = sMap ? sMap.optimalPoint.alphaDeg : 0;
              const sName = isEn ? s.nameEn : s.nameEs;
              const sMonths = isEn ? s.monthsEn : s.monthsEs;
              return `
                <option value="${i}" ${i === selectedSeasonIdx ? 'selected' : ''}>
                  ${sName} (${sMonths}) — Ópt: Inc = ${formatNum(Number(optBeta), 1)}°, Ori = ${formatNum(Number(optAlpha), 1)}°
                </option>
              `;
            }).join('')}
          </select>
          <span style="font-size: 0.76rem; color: var(--text-dim);">
            ${isEn ? 'Displays CTE losses and highlights optimum for the selected season' : 'Muestra pérdidas CTE y ángulos óptimos de la estación seleccionada'}
          </span>
        </div>
      `;
    }

    const nonCompliantPct = Math.max(0, Math.round((100 - currentCteZones.integrationPctCompliant) * 10) / 10);

    container.innerHTML = `
      <div class="result-card-header" style="flex-wrap: wrap; gap: 0.5rem; align-items: center;">
        <div>
          <h4 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-cyan, #0284c7);">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            ${titleText}
          </h4>
          <p style="font-size: 0.78rem; color: var(--text-dim); margin: 0.25rem 0 0 0;">
            ${isEn
              ? 'Evaluated component: Global solar radiation (Gdm) on tilted and oriented surface, based on Liu-Jordan & Klein.'
              : 'Componente evaluada: Radiación solar Global (Gdm) sobre superficie inclinada y orientada, según Liu-Jordan & Klein.'}
          </p>
        </div>
        <span class="badge badge-success" style="font-size: 0.82rem; padding: 0.4rem 0.75rem;">${optBadgeText}</span>
      </div>

      ${selectorHtml}

      <!-- CTE Legend Bar -->
      <div class="cte-legend-bar" style="margin-top: 0.85rem; padding: 0.75rem 1rem; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
        <div class="cte-legend-item" title="${isEn ? 'Percentage of evaluated angular space (0° to 90° inc, -90° to +90° azim) with loss ≤ 10%' : 'Porcentaje del espacio angular evaluado (0° a 90° inc, -90° a +90° ori) con pérdidas ≤ 10%'}">
          <span class="cte-color-box box-green"></span>
          <span>${isEn ? 'General CTE (loss ≤ 10%):' : 'Límite General CTE (Pérdida ≤ 10%):'} <strong>${formatPercent(currentCteZones.generalPctCompliant, 1)}</strong> <small style="opacity:0.8;">${isEn ? 'of angular space' : 'del espacio angular'}</small></span>
        </div>
        <div class="cte-legend-item" title="${isEn ? 'Percentage of evaluated angular space with loss ≤ 20%' : 'Porcentaje del espacio angular evaluado con pérdidas ≤ 20%'}">
          <span class="cte-color-box box-yellow"></span>
          <span>${isEn ? 'Superposition CTE (loss ≤ 20%):' : 'Superposición CTE (Pérdida ≤ 20%):'} <strong>${formatPercent(currentCteZones.superpositionPctCompliant, 1)}</strong> <small style="opacity:0.8;">${isEn ? 'of angular space' : 'del espacio angular'}</small></span>
        </div>
        <div class="cte-legend-item" title="${isEn ? 'Percentage of evaluated angular space with loss ≤ 40%' : 'Porcentaje del espacio angular evaluado con pérdidas ≤ 40%'}">
          <span class="cte-color-box box-orange"></span>
          <span>${isEn ? 'Arch. Integration (loss ≤ 40%):' : 'Integración Arquitectónica (Pérdida ≤ 40%):'} <strong>${formatPercent(currentCteZones.integrationPctCompliant, 1)}</strong> <small style="opacity:0.8;">${isEn ? 'of angular space' : 'del espacio angular'}</small></span>
        </div>
        <div class="cte-legend-item" title="${isEn ? 'Percentage of evaluated angular space with loss > 40%' : 'Porcentaje del espacio angular evaluado con pérdidas > 40%'}">
          <span class="cte-color-box box-red"></span>
          <span>${isEn ? 'Non-compliant (> 40%):' : 'No conforme (> 40%):'} <strong>${formatPercent(nonCompliantPct, 1)}</strong> <small style="opacity:0.8;">${isEn ? 'outside limits' : 'fuera de norma'}</small></span>
        </div>
      </div>

      <!-- Interactive 2D Continuous Canvas Heatmap -->
      <div class="loss-map-visual-container" style="margin-top: 1rem; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; flex-wrap: wrap; gap: 0.5rem;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="color: #10b981;">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 8v8M8 12h8"></path>
            </svg>
            ${isEn ? 'Interactive Map (1° Resolution) — Click or drag anywhere to inspect' : 'Mapa Interactivo de Pérdidas (Resolución 1°) — Haz clic o arrastra para evaluar'}
          </div>
          <div style="font-size: 0.74rem; color: var(--text-dim); display: flex; align-items: center; gap: 0.6rem;">
            <span><strong style="color: var(--accent-cyan, #0284c7);">★</strong> ${isEn ? 'Optimal Point' : 'Punto Óptimo'}</span>
            <span><strong style="color: #38bdf8;">◎</strong> ${isEn ? 'Inspected Point (1°)' : 'Punto Inspeccionado (1°)'}</span>
          </div>
        </div>

        <div class="loss-map-canvas-wrapper" style="position: relative; width: 100%; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle); background: var(--bg-card); box-shadow: var(--shadow-sm);">
          <canvas id="loss-map-canvas" style="width: 100%; height: 380px; display: block; cursor: crosshair; touch-action: none;"></canvas>
        </div>
      </div>

      <!-- Fine-Tuning 1° Sliders and Presets -->
      <div class="loss-map-controls-panel" style="margin-top: 0.85rem; padding: 0.85rem 1rem; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; align-items: center;">
          <!-- Tilt Beta Slider -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
              <label for="loss-slider-beta" style="font-size: 0.8rem; font-weight: 700; color: var(--text-main);">
                ${isEn ? 'Tilt angle β (0° to 90°):' : 'Inclinación β (0° a 90°):'}
              </label>
              <div style="display: flex; align-items: center; gap: 0.35rem;">
                <input type="number" id="loss-input-beta" min="0" max="90" step="1" value="${evaluatedBeta}"
                  style="width: 54px; padding: 0.15rem 0.3rem; font-size: 0.82rem; font-weight: 700; text-align: right; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px;" />
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-cyan, #0284c7);">°</span>
              </div>
            </div>
            <input type="range" id="loss-slider-beta" min="0" max="90" step="1" value="${evaluatedBeta}" style="width: 100%; cursor: pointer;" />
            <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--text-dim); margin-top: 0.15rem;">
              <span>0° (Horizontal)</span>
              <span>30°</span>
              <span>45°</span>
              <span>60°</span>
              <span>90° (Vertical)</span>
            </div>
          </div>

          <!-- Azimuth Alpha Slider -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
              <label for="loss-slider-alpha" style="font-size: 0.8rem; font-weight: 700; color: var(--text-main);">
                ${isEn ? 'Azimuth angle α (-90° to +90°):' : 'Orientación / Azimut α (-90° a +90°):'}
              </label>
              <div style="display: flex; align-items: center; gap: 0.35rem;">
                <input type="number" id="loss-input-alpha" min="-90" max="90" step="1" value="${evaluatedAlpha}"
                  style="width: 58px; padding: 0.15rem 0.3rem; font-size: 0.82rem; font-weight: 700; text-align: right; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px;" />
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-cyan, #0284c7);">°</span>
              </div>
            </div>
            <input type="range" id="loss-slider-alpha" min="-90" max="90" step="1" value="${evaluatedAlpha}" style="width: 100%; cursor: pointer;" />
            <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--text-dim); margin-top: 0.15rem;">
              <span>-90° (Este)</span>
              <span>-45°</span>
              <span>0° (Sur)</span>
              <span>+45°</span>
              <span>+90° (Oeste)</span>
            </div>
          </div>
        </div>

        <!-- Quick preset buttons -->
        <div style="display: flex; align-items: center; gap: 0.4rem; margin-top: 0.75rem; flex-wrap: wrap;">
          <span style="font-size: 0.74rem; font-weight: 700; color: var(--text-dim); margin-right: 0.25rem;">
            ${isEn ? 'Presets:' : 'Atajos rápidos:'}
          </span>
          <button type="button" class="btn btn-xs loss-preset-btn" id="loss-preset-opt" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(2, 132, 199, 0.15); color: var(--accent-cyan, #0284c7); border: 1px solid rgba(2, 132, 199, 0.3); border-radius: 4px; font-weight: 600; cursor: pointer;">
            ★ ${isEn ? 'Optimal' : 'Óptimo'} (β=${Math.round(currentOptPoint.betaDeg)}°, α=${Math.round(currentOptPoint.alphaDeg)}°)
          </button>
          <button type="button" class="btn btn-xs loss-preset-btn" id="loss-preset-horiz" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px; font-weight: 600; cursor: pointer;">
            Horizontal (β=0°, α=0°)
          </button>
          <button type="button" class="btn btn-xs loss-preset-btn" id="loss-preset-roof" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px; font-weight: 600; cursor: pointer;">
            Tejado típico (β=30°, α=0°)
          </button>
          <button type="button" class="btn btn-xs loss-preset-btn" id="loss-preset-south-vert" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px; font-weight: 600; cursor: pointer;">
            Fachada Sur (β=90°, α=0°)
          </button>
          <button type="button" class="btn btn-xs loss-preset-btn" id="loss-preset-east" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px; font-weight: 600; cursor: pointer;">
            Este (β=45°, α=-90°)
          </button>
          <button type="button" class="btn btn-xs loss-preset-btn" id="loss-preset-west" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 4px; font-weight: 600; cursor: pointer;">
            Oeste (β=45°, α=+90°)
          </button>
        </div>
      </div>

      <!-- Point Inspector HUD (Evaluated Point with 1° Resolution) -->
      <div id="loss-inspector-hud" class="loss-inspector-hud" style="margin-top: 0.85rem; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: var(--bg-card); box-shadow: var(--shadow-sm);">
        <!-- Populated dynamically by updateInspectorHUD() -->
      </div>

      <!-- Optional Collapsed Accordion with the discrete 19x25 Table (Avoids the number conglomerate by default) -->
      <details class="loss-map-matrix-details" style="margin-top: 1.25rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--bg-card); padding: 0.4rem 0.75rem;">
        <summary style="cursor: pointer; font-size: 0.78rem; font-weight: 700; color: var(--text-dim); display: flex; align-items: center; justify-content: space-between; user-select: none;">
          <span>${isEn ? 'Show discrete matrix numbers (19 × 25 grid, steps of 5° / 7.5°)' : 'Ver matriz numérica discreta (19 × 25 combinaciones, pasos de 5° / 7.5°)'}</span>
          <span class="badge badge-secondary" style="font-size: 0.68rem; font-weight: 600; opacity: 0.85;">${isEn ? 'Optional / Audit view' : 'Opcional / Vista para auditoría'}</span>
        </summary>
        <div class="loss-map-container" style="margin-top: 0.6rem;">
          <table class="loss-map-matrix-table">
            <thead>
              <tr>
                <th class="corner-th">β \\ α</th>
                ${currentAlphas.map((a) => `<th>${a > 0 ? '+' : ''}${a}°</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${currentBetas
                .map((b, i_b) => {
                  const cells = currentAlphas
                    .map((a, i_a) => {
                      const loss = currentLossMatrix[i_b][i_a];
                      const rad = currentRadMatrix[i_b][i_a];
                      const cls = getCteClass(loss);
                      const isOptimalCell = Math.abs(b - currentOptPoint.betaDeg) < 0.01 && Math.abs(a - currentOptPoint.alphaDeg) < 0.01;
                      const optStyle = isOptimalCell
                        ? 'border: 2px solid var(--accent-cyan, #0284c7) !important; box-shadow: inset 0 0 8px rgba(2, 132, 199, 0.4); font-weight: 800; transform: scale(1.08);'
                        : '';
                      const starText = isOptimalCell ? ' ★' : '';
                      return `<td class="${cls}" style="${optStyle}" title="β=${b}°, α=${a}°: ${isEn ? 'Loss' : 'Pérdida'} ${formatPercent(loss, 1)} (${formatNum(rad, 2)} ${isEn ? 'kWh/m²/day' : 'kWh/m²/d'})">${formatPercent(loss, 1)}${starText}</td>`;
                    })
                    .join('');
                  return `<tr><td class="row-header-beta">${b}°</td>${cells}</tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;

    // Initialize Canvas and HUD
    setupInteractiveMap(
      currentBetas,
      currentAlphas,
      currentLossMatrix,
      currentRadMatrix,
      currentOptPoint
    );

    // Attach Month Selector listener if present
    if (mode === 'monthly') {
      const monthSelect = container.querySelector<HTMLSelectElement>('#loss-map-month-select');
      monthSelect?.addEventListener('change', () => {
        selectedMonthIdx = parseInt(monthSelect.value, 10) || 0;
        const newOptBeta = lossMap.monthlyMaps ? lossMap.monthlyMaps[selectedMonthIdx].optimalPoint.betaDeg : 0;
        hasUserSelectedPoint = false;
        if (onMonthChange) {
          onMonthChange(selectedMonthIdx, newOptBeta);
        }
        renderContent();
      });
    }

    // Attach Season Selector listener if present
    if (mode === 'seasonal') {
      const seasonSelect = container.querySelector<HTMLSelectElement>('#loss-map-season-select');
      seasonSelect?.addEventListener('change', () => {
        selectedSeasonIdx = parseInt(seasonSelect.value, 10) || 0;
        const newOptBeta = lossMap.seasonalMaps
          ? lossMap.seasonalMaps[selectedSeasonIdx].optimalPoint.betaDeg
          : 0;
        hasUserSelectedPoint = false;
        if (onSeasonChange) {
          onSeasonChange(selectedSeasonIdx, newOptBeta);
        }
        renderContent();
      });
    }
  }

  /**
   * Sets up the interactive 2D canvas, event listeners, sliders and inspector HUD.
   */
  function setupInteractiveMap(
    betas: number[],
    alphas: number[],
    lossMatrix: number[][],
    radMatrix: number[][],
    optPoint: { betaDeg: number; alphaDeg: number; maxDailyRadiationKwh: number }
  ) {
    const canvas = container.querySelector<HTMLCanvasElement>('#loss-map-canvas');
    const hud = container.querySelector<HTMLDivElement>('#loss-inspector-hud');
    const sliderBeta = container.querySelector<HTMLInputElement>('#loss-slider-beta');
    const inputBeta = container.querySelector<HTMLInputElement>('#loss-input-beta');
    const sliderAlpha = container.querySelector<HTMLInputElement>('#loss-slider-alpha');
    const inputAlpha = container.querySelector<HTMLInputElement>('#loss-input-alpha');

    if (!canvas || !hud) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cache pre-computed 181x91 offscreen texture (1° resolution)
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 181; // alphas from -90 to +90 (181 values)
    offscreenCanvas.height = 91; // betas from 0 to 90 (91 values)
    const offCtx = offscreenCanvas.getContext('2d');

    if (offCtx) {
      const imgData = offCtx.createImageData(181, 91);
      const data = imgData.data;

      // Fill pixel array: row 0 is beta=90 (top), row 90 is beta=0 (bottom)
      for (let r = 0; r < 91; r++) {
        const b = 90 - r; // 90 down to 0
        for (let c = 0; c < 181; c++) {
          const a = -90 + c; // -90 to +90
          const { loss } = interpolateLossAndRadiation(betas, alphas, lossMatrix, radMatrix, b, a);
          const [red, green, blue] = getLossRgb(loss);
          const idx = (r * 181 + c) * 4;
          data[idx] = red;
          data[idx + 1] = green;
          data[idx + 2] = blue;
          data[idx + 3] = 230; // opacity
        }
      }
      offCtx.putImageData(imgData, 0, 0);
    }

    // Geometry margins for canvas plotting
    const padLeft = 60;
    const padRight = 30;
    const padTop = 30;
    const padBottom = 48;

    let isDragging = false;

    function getPlotDimensions() {
      const rect = canvas!.getBoundingClientRect();
      const cssW = rect.width || 800;
      const cssH = rect.height || 380;
      return {
        cssW,
        cssH,
        plotW: cssW - padLeft - padRight,
        plotH: cssH - padTop - padBottom,
      };
    }

    // Coordinate conversion
    function coordsToXY(beta: number, alpha: number, plotW: number, plotH: number) {
      const x = padLeft + ((alpha - (-90)) / 180) * plotW;
      const y = padTop + ((90 - beta) / 90) * plotH;
      return { x, y };
    }

    function xyToCoords(x: number, y: number, plotW: number, plotH: number) {
      const a = -90 + ((x - padLeft) / plotW) * 180;
      const b = 90 - ((y - padTop) / plotH) * 90;
      const clampedA = Math.max(-90, Math.min(90, Math.round(a)));
      const clampedB = Math.max(0, Math.min(90, Math.round(b)));
      return { beta: clampedB, alpha: clampedA };
    }

    function renderCanvas() {
      const { cssW, cssH, plotW, plotH } = getPlotDimensions();
      const dpr = window.devicePixelRatio || 1;

      // Adjust buffer size to Retina DPR
      canvas!.width = Math.round(cssW * dpr);
      canvas!.height = Math.round(cssH * dpr);

      ctx!.save();
      ctx!.scale(dpr, dpr);

      // Determine theme colors
      const isDark = document.body.classList.contains('theme-dark') || document.documentElement.getAttribute('data-theme') === 'dark';
      const bgColor = isDark ? '#0b1329' : '#f8fafc';
      const textColor = isDark ? '#94a3b8' : '#475569';
      const textMain = isDark ? '#f1f5f9' : '#0f172a';
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.10)';
      const borderColor = isDark ? 'rgba(255, 255, 255, 0.20)' : '#cbd5e1';

      // Background
      ctx!.fillStyle = bgColor;
      ctx!.fillRect(0, 0, cssW, cssH);

      // Draw interpolated heat map from offscreen texture
      ctx!.imageSmoothingEnabled = true;
      ctx!.drawImage(offscreenCanvas, padLeft, padTop, plotW, plotH);

      // Draw grid lines and ticks
      ctx!.lineWidth = 1;
      ctx!.setLineDash([3, 3]);
      ctx!.strokeStyle = gridColor;
      ctx!.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'top';

      // Vertical grid lines (Alpha) every 15°
      for (let a = -90; a <= 90; a += 15) {
        const { x } = coordsToXY(0, a, plotW, plotH);
        ctx!.beginPath();
        ctx!.moveTo(x, padTop);
        ctx!.lineTo(x, padTop + plotH);
        ctx!.stroke();

        // Alpha labels on X-axis
        ctx!.fillStyle = a === 0 ? (isDark ? '#38bdf8' : '#0284c7') : textColor;
        let label = `${a > 0 ? '+' : ''}${a}°`;
        if (a === -90) label = '-90° (E)';
        if (a === 0) label = '0° (Sur)';
        if (a === 90) label = '+90° (O)';
        ctx!.fillText(label, x, padTop + plotH + 7);
      }

      // Horizontal grid lines (Beta) every 15°
      ctx!.textAlign = 'right';
      ctx!.textBaseline = 'middle';
      for (let b = 0; b <= 90; b += 15) {
        const { y } = coordsToXY(b, 0, plotW, plotH);
        ctx!.beginPath();
        ctx!.moveTo(padLeft, y);
        ctx!.lineTo(padLeft + plotW, y);
        ctx!.stroke();

        // Beta labels on Y-axis
        ctx!.fillStyle = b === Math.round(optPoint.betaDeg) ? (isDark ? '#38bdf8' : '#0284c7') : textColor;
        let label = `${b}°`;
        if (b === 0) label = '0° (H)';
        if (b === 90) label = '90° (V)';
        ctx!.fillText(label, padLeft - 7, y);
      }
      ctx!.setLineDash([]);

      // Axis borders
      ctx!.lineWidth = 1.5;
      ctx!.strokeStyle = borderColor;
      ctx!.strokeRect(padLeft, padTop, plotW, plotH);

      // Axis Titles
      ctx!.fillStyle = textMain;
      ctx!.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx!.textAlign = 'center';
      ctx!.fillText(
        isEn ? 'Azimuth / Orientation α (degrees)' : 'Orientación / Azimut α (grados respecto al Sur)',
        padLeft + plotW / 2,
        padTop + plotH + 28
      );

      ctx!.save();
      ctx!.translate(16, padTop + plotH / 2);
      ctx!.rotate(-Math.PI / 2);
      ctx!.textAlign = 'center';
      ctx!.fillText(
        isEn ? 'Tilt angle β (degrees)' : 'Inclinación β (grados respecto al suelo)',
        0,
        0
      );
      ctx!.restore();

      // Highlight Optimal Point (★)
      const optXY = coordsToXY(optPoint.betaDeg, optPoint.alphaDeg, plotW, plotH);

      // Glow behind optimal point
      ctx!.fillStyle = 'rgba(2, 132, 199, 0.35)';
      ctx!.beginPath();
      ctx!.arc(optXY.x, optXY.y, 14, 0, Math.PI * 2);
      ctx!.fill();

      // Outer ring
      ctx!.lineWidth = 2.5;
      ctx!.strokeStyle = '#38bdf8';
      ctx!.beginPath();
      ctx!.arc(optXY.x, optXY.y, 8, 0, Math.PI * 2);
      ctx!.stroke();

      // Inner dot
      ctx!.fillStyle = '#ffffff';
      ctx!.beginPath();
      ctx!.arc(optXY.x, optXY.y, 3, 0, Math.PI * 2);
      ctx!.fill();

      // Optimal Point badge
      const optLabel = isEn
        ? `★ OPTIMAL: β=${formatNum(Number(optPoint.betaDeg), 1)}°, α=${formatNum(Number(optPoint.alphaDeg), 1)}°`
        : `★ ÓPTIMO: β=${formatNum(Number(optPoint.betaDeg), 1)}°, α=${formatNum(Number(optPoint.alphaDeg), 1)}°`;
      ctx!.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const textMetrics = ctx!.measureText(optLabel);
      const bW = textMetrics.width + 12;
      const bH = 18;
      const bX = Math.min(padLeft + plotW - bW - 4, Math.max(padLeft + 4, optXY.x - bW / 2));
      const bY = optXY.y > padTop + 30 ? optXY.y - 22 : optXY.y + 12;

      ctx!.fillStyle = 'rgba(11, 19, 41, 0.90)';
      ctx!.strokeStyle = '#0284c7';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.roundRect(bX, bY, bW, bH, 4);
      ctx!.fill();
      ctx!.stroke();

      ctx!.fillStyle = '#38bdf8';
      ctx!.textAlign = 'left';
      ctx!.textBaseline = 'middle';
      ctx!.fillText(optLabel, bX + 6, bY + bH / 2);

      // Highlight Current Evaluated Point (Interactive Crosshair Reticle)
      const selXY = coordsToXY(evaluatedBeta, evaluatedAlpha, plotW, plotH);
      const { loss: evaluatedLoss, radiation: evaluatedRad } = interpolateLossAndRadiation(
        betas, alphas, lossMatrix, radMatrix, evaluatedBeta, evaluatedAlpha
      );

      // Crosshair lines
      ctx!.setLineDash([4, 4]);
      ctx!.lineWidth = 1.5;
      ctx!.strokeStyle = '#ffffff';

      // Vertical line
      ctx!.beginPath();
      ctx!.moveTo(selXY.x, padTop);
      ctx!.lineTo(selXY.x, padTop + plotH);
      ctx!.stroke();

      // Horizontal line
      ctx!.beginPath();
      ctx!.moveTo(padLeft, selXY.y);
      ctx!.lineTo(padLeft + plotW, selXY.y);
      ctx!.stroke();
      ctx!.setLineDash([]);

      // Concentric rings on selected point
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx!.beginPath();
      ctx!.arc(selXY.x, selXY.y, 12, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.lineWidth = 2.5;
      ctx!.strokeStyle = '#ffffff';
      ctx!.beginPath();
      ctx!.arc(selXY.x, selXY.y, 7, 0, Math.PI * 2);
      ctx!.stroke();

      ctx!.fillStyle = '#38bdf8';
      ctx!.beginPath();
      ctx!.arc(selXY.x, selXY.y, 3, 0, Math.PI * 2);
      ctx!.fill();

      // Floating reticle badge with exact values
      const reticleLabel = `β = ${evaluatedBeta}°, α = ${evaluatedAlpha > 0 ? '+' : ''}${evaluatedAlpha}° | ${isEn ? 'Loss' : 'Pérdida'}: ${formatPercent(evaluatedLoss, 1)} (${formatNum(evaluatedRad, 2)} ${isEn ? 'kWh/m²/day' : 'kWh/m²/d'})`;
      ctx!.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const reticleMetrics = ctx!.measureText(reticleLabel);
      const rW = reticleMetrics.width + 16;
      const rH = 22;
      let rX = selXY.x + 14;
      let rY = selXY.y - rH - 8;

      if (rX + rW > padLeft + plotW) rX = selXY.x - rW - 14;
      if (rY < padTop + 4) rY = selXY.y + 12;

      ctx!.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx!.strokeStyle = '#ffffff';
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.roundRect(rX, rY, rW, rH, 5);
      ctx!.fill();
      ctx!.stroke();

      ctx!.fillStyle = '#f8fafc';
      ctx!.textAlign = 'left';
      ctx!.textBaseline = 'middle';
      ctx!.fillText(reticleLabel, rX + 8, rY + rH / 2);

      ctx!.restore();
    }

    function updateInspectorHUD() {
      const { loss, radiation } = interpolateLossAndRadiation(
        betas, alphas, lossMatrix, radMatrix, evaluatedBeta, evaluatedAlpha
      );

      // CTE Compliance Status
      let cteBadge = '';
      let cteDesc = '';
      if (loss <= 10.0) {
        cteBadge = `<span class="badge badge-success" style="font-size: 0.82rem; padding: 0.35rem 0.65rem;">✓ ${isEn ? 'General CTE Limit (≤ 10% loss)' : 'Límite General CTE (Pérdida ≤ 10%)'}</span>`;
        cteDesc = isEn
          ? 'Complies with the strictest CTE DB-HE4 limit. Fully eligible for any building orientation and generic subsidies.'
          : 'Cumple con el límite general más exigente del CTE DB-HE4. Válido para cualquier instalación de energía solar.';
      } else if (loss <= 20.0) {
        cteBadge = `<span class="badge badge-warning" style="font-size: 0.82rem; padding: 0.35rem 0.65rem; background: #d97706; color: #fff;">${isEn ? 'Superposition CTE Limit (≤ 20% loss)' : 'Superposición CTE (Pérdida ≤ 20%)'}</span>`;
        cteDesc = isEn
          ? 'Complies with CTE DB-HE4 for superimposed roof or pergola installations.'
          : 'Cumple la exigencia del CTE DB-HE4 para instalaciones superpuestas sobre tejado o pérgola.';
      } else if (loss <= 40.0) {
        cteBadge = `<span class="badge" style="font-size: 0.82rem; padding: 0.35rem 0.65rem; background: #ea580c; color: #fff;">${isEn ? 'Arch. Integration CTE Limit (≤ 40% loss)' : 'Integración Arquitectónica (Pérdida ≤ 40%)'}</span>`;
        cteDesc = isEn
          ? 'Complies with CTE DB-HE4 for building architectural integration (facades, vertical envelopes, brise-soleil).'
          : 'Cumple la exigencia del CTE DB-HE4 para integración arquitectónica en fachadas o envolventes complejas.';
      } else {
        cteBadge = `<span class="badge badge-danger" style="font-size: 0.82rem; padding: 0.35rem 0.65rem; background: #dc2626; color: #fff;">✗ ${isEn ? 'Non-compliant (> 40% loss)' : 'No conforme CTE (Pérdida > 40%)'}</span>`;
        cteDesc = isEn
          ? 'Exceeds the maximum allowable loss under CTE DB-HE4. Installation not recommended without technical compensation.'
          : 'Supera el límite máximo permitido por el CTE DB-HE4. No admisible según normativa sin medidas técnicas correctoras.';
      }

      // Orientation textual description
      let oriText = isEn ? 'True South (0°)' : 'Sur estricto (0°)';
      if (evaluatedAlpha < 0) {
        oriText = isEn ? `${Math.abs(evaluatedAlpha)}° East (Mornings)` : `${Math.abs(evaluatedAlpha)}° al Este (Mañanas)`;
      } else if (evaluatedAlpha > 0) {
        oriText = isEn ? `${evaluatedAlpha}° West (Afternoons)` : `${evaluatedAlpha}° al Oeste (Tardes)`;
      }

      // Tilt textual description
      let tiltText = isEn ? `${evaluatedBeta}° (Moderate tilt)` : `${evaluatedBeta}° (Inclinación moderada)`;
      if (evaluatedBeta === 0) tiltText = isEn ? '0° (Horizontal / Ground plane)' : '0° (Horizontal / En plano de suelo)';
      else if (evaluatedBeta < 20) tiltText = isEn ? `${evaluatedBeta}° (Low tilt / Typical summer)` : `${evaluatedBeta}° (Inclinación baja / Típica de verano)`;
      else if (evaluatedBeta > 60 && evaluatedBeta < 90) tiltText = isEn ? `${evaluatedBeta}° (High tilt / Typical winter)` : `${evaluatedBeta}° (Inclinación alta / Típica de invierno)`;
      else if (evaluatedBeta === 90) tiltText = isEn ? '90° (Vertical / Building facade)' : '90° (Vertical / Fachada de edificio)';

      // "Cuándo ocurre" (When does it occur?) contextual solar physics explanation
      let whenTitle = '';
      let whenSolarPhysics = '';
      const lat = res.latitude ?? 37.0;

      if (mode === 'seasonal') {
        const seasonInfo = isEn ? [
          {
            name: 'Winter',
            months: 'December, January, and February',
            solstice: 'Winter Solstice (December 21)',
            declination: 'δ ≈ -23.45° to -12°',
            noonAlt: Math.round(90 - lat - 23.45),
            reason: `In winter the Sun travels at its lowest path above the horizon (solar noon elevation ~${Math.round(90 - lat - 23.45)}°). Therefore, a high tilt (~55°) intercepts direct solar beam perpendicularly.`,
          },
          {
            name: 'Spring',
            months: 'March, April, and May',
            solstice: 'Spring Equinox (March 20–21)',
            declination: 'δ ≈ -2° to +21°',
            noonAlt: Math.round(90 - lat),
            reason: `In spring solar elevation is intermediate (solar noon elevation ~${Math.round(90 - lat)}°). A tilt of ~25°–30° maximizes seasonal collection.`,
          },
          {
            name: 'Summer',
            months: 'June, July, and August',
            solstice: 'Summer Solstice (June 21)',
            declination: 'δ ≈ +15° to +23.45°',
            noonAlt: Math.round(90 - lat + 23.45),
            reason: `In summer the Sun reaches its maximum elevation (solar noon elevation ~${Math.round(90 - lat + 23.45)}°). A near-horizontal surface (~15°–20°) captures peak daily global irradiation.`,
          },
          {
            name: 'Autumn',
            months: 'September, October, and November',
            solstice: 'Autumn Equinox (September 22–23)',
            declination: 'δ ≈ +8° to -21°',
            noonAlt: Math.round(90 - lat),
            reason: `In autumn solar paths descend progressively. Optimal tilt is around ~40°–45° to compensate for shortening days.`,
          },
        ][selectedSeasonIdx] || {
          name: 'Season',
          months: 'Selected quarter',
          solstice: 'Seasonal period',
          declination: '',
          noonAlt: 50,
          reason: 'Calculated according to mean solar position across the season.',
        } : [
          {
            name: 'Invierno',
            months: 'Diciembre, Enero y Febrero',
            solstice: 'Solsticio de Invierno (21 de Diciembre)',
            declination: 'δ ≈ -23,45° a -12°',
            noonAlt: Math.round(90 - lat - 23.45),
            reason: `En invierno el Sol describe su trayectoria más baja sobre el horizonte (altura solar a mediodía de ~${Math.round(90 - lat - 23.45)}°). Por eso una inclinación alta (~55°) capta el haz perpendicularmente.`,
          },
          {
            name: 'Primavera',
            months: 'Marzo, Abril y Mayo',
            solstice: 'Equinoccio de Primavera (20-21 de Marzo)',
            declination: 'δ ≈ -2° a +21°',
            noonAlt: Math.round(90 - lat),
            reason: `En primavera la trayectoria solar es intermedia (altura solar a mediodía de ~${Math.round(90 - lat)}°). Una inclinación de ~25°–30° maximiza el rendimiento estacional.`,
          },
          {
            name: 'Verano',
            months: 'Junio, Julio y Agosto',
            solstice: 'Solsticio de Verano (21 de Junio)',
            declination: 'δ ≈ +15° a +23,45°',
            noonAlt: Math.round(90 - lat + 23.45),
            reason: `En verano el Sol alcanza su máxima elevación (altura solar a mediodía de ~${Math.round(90 - lat + 23.45)}°). Una superficie casi horizontal (~15°–20°) capta el máximo global diario.`,
          },
          {
            name: 'Otoño',
            months: 'Septiembre, Octubre y Noviembre',
            solstice: 'Equinoccio de Otoño (22-23 de Septiembre)',
            declination: 'δ ≈ +8° a -21°',
            noonAlt: Math.round(90 - lat),
            reason: `En otoño las trayectorias solares descienden progresivamente. La inclinación óptima ronda los ~40°–45° para compensar el acortamiento de los días.`,
          },
        ][selectedSeasonIdx] || {
          name: 'Estación',
          months: 'Trimestre seleccionado',
          solstice: 'Periodo estacional',
          declination: '',
          noonAlt: 50,
          reason: 'Calculado según la posición media del sol en el trimestre.',
        };

        whenTitle = `${seasonInfo.name} (${seasonInfo.months})`;
        whenSolarPhysics = isEn ? `
          <div style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.45; margin-top: 0.4rem;">
            <div>• <strong>Astronomical period:</strong> ${seasonInfo.months}. Includes ${seasonInfo.solstice} with declination ${seasonInfo.declination}.</div>
            <div>• <strong>Solar physics:</strong> ${seasonInfo.reason}</div>
            <div>• <strong>Cause of loss at evaluated point (β=${evaluatedBeta}°, α=${evaluatedAlpha}°):</strong>
              ${
                Math.abs(evaluatedBeta - optPoint.betaDeg) < 3 && Math.abs(evaluatedAlpha - optPoint.alphaDeg) < 3
                  ? 'Optimal frontal collection relative to solar rays in this season.'
                  : evaluatedBeta < optPoint.betaDeg - 8
                  ? `The collector is too flat (${evaluatedBeta}° vs ${formatNum(Number(optPoint.betaDeg), 1)}° optimal), losing collection against low solar paths in this season.`
                  : evaluatedBeta > optPoint.betaDeg + 8
                  ? `The collector is too steep (${evaluatedBeta}° vs ${formatNum(Number(optPoint.betaDeg), 1)}° optimal), suffering oblique incidence during midday hours.`
                  : ''
              }
              ${
                Math.abs(evaluatedAlpha) > 10
                  ? ` Azimuth deviation of ${evaluatedAlpha > 0 ? '+' : ''}${evaluatedAlpha}° penalizes collection around solar noon, favoring ${evaluatedAlpha < 0 ? 'mornings' : 'afternoons'}.`
                  : ''
              }
            </div>
          </div>
        ` : `
          <div style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.45; margin-top: 0.4rem;">
            <div>• <strong>Periodo astronómico:</strong> ${seasonInfo.months}. Incluye el ${seasonInfo.solstice} con declinación ${seasonInfo.declination}.</div>
            <div>• <strong>Mecánica solar:</strong> ${seasonInfo.reason}</div>
            <div>• <strong>Causa de la pérdida en el punto evaluado (β=${evaluatedBeta}°, α=${evaluatedAlpha}°):</strong>
              ${
                Math.abs(evaluatedBeta - optPoint.betaDeg) < 3 && Math.abs(evaluatedAlpha - optPoint.alphaDeg) < 3
                  ? 'Captación óptima frontal respecto a los rayos solares de esta estación.'
                  : evaluatedBeta < optPoint.betaDeg - 8
                  ? `El captador está demasiado plano (${evaluatedBeta}° frente a los ${formatNum(Number(optPoint.betaDeg), 1)}° óptimos), perdiendo captación frente a la trayectoria baja del sol en esta época.`
                  : evaluatedBeta > optPoint.betaDeg + 8
                  ? `El captador está demasiado inclinado (${evaluatedBeta}° frente a los ${formatNum(Number(optPoint.betaDeg), 1)}° óptimos), sufriendo incidencia oblicua en las horas centrales.`
                  : ''
              }
              ${
                Math.abs(evaluatedAlpha) > 10
                  ? ` El desvío azimutal de ${evaluatedAlpha > 0 ? '+' : ''}${evaluatedAlpha}° penaliza la captación en el mediodía solar, favoreciendo las ${evaluatedAlpha < 0 ? 'mañanas' : 'tardes'}.`
                  : ''
              }
            </div>
          </div>
        `;
      } else if (mode === 'monthly') {
        const mNamesList = isEn ? MONTH_NAMES_EN : MONTH_NAMES_ES;
        const mName = mNamesList[selectedMonthIdx];
        whenTitle = isEn ? `Month of ${mName} (Klein Mean Day)` : `Mes de ${mName} (Día medio de Klein)`;
        whenSolarPhysics = isEn ? `
          <div style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.45; margin-top: 0.4rem;">
            <div>• <strong>Evaluated period:</strong> Full month of ${mName}, evaluated via Klein characteristic day and Liu-Jordan & Klein radiation transposition.</div>
            <div>• <strong>Angular performance:</strong> Optimal tilt for this month is <strong>Inc = ${formatNum(Number(optPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(optPoint.alphaDeg), 1)}°</strong> (Maximum radiation: ${formatNum(optPoint.maxDailyRadiationKwh, 2)} kWh/m²/day).</div>
            <div>• <strong>Effect at selected point:</strong> With β=${evaluatedBeta}° and α=${evaluatedAlpha}°, daily collection is <strong>${formatNum(radiation, 2)} kWh/m²/day</strong>, representing a loss of <strong>${formatPercent(loss, 1)}</strong> vs monthly optimum.</div>
          </div>
        ` : `
          <div style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.45; margin-top: 0.4rem;">
            <div>• <strong>Periodo evaluado:</strong> Mes completo de ${mName}, evaluado mediante el día característico de Klein y el modelo de irradiación Liu-Jordan & Klein.</div>
            <div>• <strong>Rendimiento angular:</strong> El ángulo óptimo para este mes es <strong>Inc = ${formatNum(Number(optPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(optPoint.alphaDeg), 1)}°</strong> (Radiación máxima: ${formatNum(optPoint.maxDailyRadiationKwh, 2)} kWh/m²/día).</div>
            <div>• <strong>Efecto en el punto seleccionado:</strong> Con β=${evaluatedBeta}° y α=${evaluatedAlpha}°, se capta <strong>${formatNum(radiation, 2)} kWh/m²/día</strong>, lo que representa una pérdida de <strong>${formatPercent(loss, 1)}</strong> frente al óptimo mensual.</div>
          </div>
        `;
      } else {
        whenTitle = isEn ? 'Annual Global Balance (365 Days)' : 'Balance Global Anual (365 días)';
        whenSolarPhysics = isEn ? `
          <div style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.45; margin-top: 0.4rem;">
            <div>• <strong>Evaluated period:</strong> Full annual integration (365 days) combining solstices, equinoxes and site horizontal radiation distribution.</div>
            <div>• <strong>Global annual optimum:</strong> Located at <strong>Inc = ${formatNum(Number(optPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(optPoint.alphaDeg), 1)}°</strong> (${formatNum(optPoint.maxDailyRadiationKwh, 2)} kWh/m²/day annual mean).</div>
            <div>• <strong>Effect at selected point:</strong> A fixed installation with β=${evaluatedBeta}° and α=${evaluatedAlpha}° produces annually ~${formatInt(Math.round(radiation * 365))} kWh/m²/year vs ${formatInt(Math.round(optPoint.maxDailyRadiationKwh * 365))} kWh/m²/year of the optimum (cumulative annual loss of <strong>${formatPercent(loss, 1)}</strong>).</div>
          </div>
        ` : `
          <div style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.45; margin-top: 0.4rem;">
            <div>• <strong>Periodo evaluado:</strong> Integración anual completa (365 días) combinando solsticios y equinoccios con la distribución de radiación horizontal de la localidad.</div>
            <div>• <strong>Óptimo anual global:</strong> Situado en <strong>Inc = ${formatNum(Number(optPoint.betaDeg), 1)}°, Ori = ${formatNum(Number(optPoint.alphaDeg), 1)}°</strong> (${formatNum(optPoint.maxDailyRadiationKwh, 2)} kWh/m²/día de media anual).</div>
            <div>• <strong>Efecto en el punto seleccionado:</strong> Una instalación fija con β=${evaluatedBeta}° y α=${evaluatedAlpha}° produce anualmente ~${formatInt(Math.round(radiation * 365))} kWh/m²/año frente a los ${formatInt(Math.round(optPoint.maxDailyRadiationKwh * 365))} kWh/m²/año del óptimo (pérdida anual acumulada del <strong>${formatPercent(loss, 1)}</strong>).</div>
          </div>
        `;
      }

      if (!hud) return;
      hud.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1rem; font-weight: 800; color: var(--text-main);">
                ${isEn ? 'Evaluated Point Inspector (1° Granularity)' : 'Inspector de Punto Evaluado (Resolución 1°)'}
              </span>
              ${cteBadge}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 0.2rem;">
              ${cteDesc}
            </div>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
              ${isEn ? 'Loss vs Optimum' : 'Pérdida vs Óptimo'}
            </span>
            <div style="font-size: 1.6rem; font-weight: 900; color: ${loss <= 10 ? '#10b981' : loss <= 20 ? '#f59e0b' : loss <= 40 ? '#f97316' : '#ef4444'}; font-family: var(--font-mono); line-height: 1;">
              ${formatPercent(loss, 1)}
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.85rem;">
          <!-- Angular Position -->
          <div style="background: var(--bg-card-hover, rgba(0,0,0,0.03)); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">
              ${isEn ? 'Evaluated Angles' : 'Ángulos Evaluados'}
            </div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-main); margin-top: 0.15rem; font-family: var(--font-mono);">
              β = ${evaluatedBeta}° | α = ${evaluatedAlpha > 0 ? '+' : ''}${evaluatedAlpha}°
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
              Inc: ${tiltText}<br/>
              Ori: ${oriText}
            </div>
          </div>

          <!-- Captured Radiation -->
          <div style="background: var(--bg-card-hover, rgba(0,0,0,0.03)); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">
              ${isEn ? 'Captured Radiation' : 'Radiación Incidente'}
            </div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--accent-cyan, #0284c7); margin-top: 0.15rem; font-family: var(--font-mono);">
              ${formatNum(radiation, 2)} ${isEn ? 'kWh/m²/day' : 'kWh/m²/día'}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
              ${isEn ? 'Optimum:' : 'Óptimo:'} ${formatNum(optPoint.maxDailyRadiationKwh, 2)} ${isEn ? 'kWh/m²/day' : 'kWh/m²/día'}<br/>
              ${isEn ? 'Difference:' : 'Diferencia:'} ${Math.abs(optPoint.maxDailyRadiationKwh - radiation) < 0.005 ? `0,00 ${isEn ? 'kWh/m²/day' : 'kWh/m²/día'}` : `-${formatNum(optPoint.maxDailyRadiationKwh - radiation, 2)} ${isEn ? 'kWh/m²/day' : 'kWh/m²/día'}`}
            </div>
          </div>

          <!-- When does it occur -->
          <div style="background: var(--bg-card-hover, rgba(0,0,0,0.03)); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); grid-column: 1 / -1;">
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--solar-amber, #d97706);">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); text-transform: uppercase;">
                ${isEn ? 'When does it occur?' : '¿Cuándo ocurre? — Contexto Temporal y Físico'} (${whenTitle})
              </div>
            </div>
            ${whenSolarPhysics}
          </div>
        </div>
      `;
    }

    function setEvaluatedPoint(beta: number, alpha: number) {
      evaluatedBeta = Math.max(0, Math.min(90, Math.round(beta)));
      evaluatedAlpha = Math.max(-90, Math.min(90, Math.round(alpha)));
      hasUserSelectedPoint = true;

      // Update inputs and sliders
      if (sliderBeta) sliderBeta.value = String(evaluatedBeta);
      if (inputBeta) inputBeta.value = String(evaluatedBeta);
      if (sliderAlpha) sliderAlpha.value = String(evaluatedAlpha);
      if (inputAlpha) inputAlpha.value = String(evaluatedAlpha);

      renderCanvas();
      updateInspectorHUD();
    }

    // Pointer events on Canvas (click and drag)
    function handlePointer(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { plotW, plotH } = getPlotDimensions();
      const { beta, alpha } = xyToCoords(x, y, plotW, plotH);
      setEvaluatedPoint(beta, alpha);
    }

    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      canvas.setPointerCapture(e.pointerId);
      handlePointer(e);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (isDragging) {
        handlePointer(e);
      }
    });

    const stopDragging = (e: PointerEvent) => {
      if (isDragging) {
        isDragging = false;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };
    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);

    // Sliders and Inputs listeners
    sliderBeta?.addEventListener('input', () => {
      setEvaluatedPoint(parseInt(sliderBeta.value, 10) || 0, evaluatedAlpha);
    });
    inputBeta?.addEventListener('change', () => {
      setEvaluatedPoint(parseInt(inputBeta.value, 10) || 0, evaluatedAlpha);
    });

    sliderAlpha?.addEventListener('input', () => {
      setEvaluatedPoint(evaluatedBeta, parseInt(sliderAlpha.value, 10) || 0);
    });
    inputAlpha?.addEventListener('change', () => {
      setEvaluatedPoint(evaluatedBeta, parseInt(inputAlpha.value, 10) || 0);
    });

    // Preset button shortcuts
    container.querySelector('#loss-preset-opt')?.addEventListener('click', () => {
      setEvaluatedPoint(optPoint.betaDeg, optPoint.alphaDeg);
    });
    container.querySelector('#loss-preset-horiz')?.addEventListener('click', () => {
      setEvaluatedPoint(0, 0);
    });
    container.querySelector('#loss-preset-roof')?.addEventListener('click', () => {
      setEvaluatedPoint(30, 0);
    });
    container.querySelector('#loss-preset-south-vert')?.addEventListener('click', () => {
      setEvaluatedPoint(90, 0);
    });
    container.querySelector('#loss-preset-east')?.addEventListener('click', () => {
      setEvaluatedPoint(45, -90);
    });
    container.querySelector('#loss-preset-west')?.addEventListener('click', () => {
      setEvaluatedPoint(45, 90);
    });

    // Window resize observer to adapt canvas dimensions
    const resizeObserver = new ResizeObserver(() => {
      renderCanvas();
    });
    resizeObserver.observe(canvas);

    // Initial render
    renderCanvas();
    updateInspectorHUD();
  }

  renderContent();
  return container;
}
