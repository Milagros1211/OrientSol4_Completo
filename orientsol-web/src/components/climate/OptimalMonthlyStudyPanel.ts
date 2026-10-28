import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { renderEnergyCalculationPanel } from '@/components/energy/EnergyCalculationPanel';
import {
  showPdfGenerationNoticeModal,
  generateOrientSolPDFReport,
  showExportComponentChoiceModal,
} from '@/components/export/pdfReportGenerator';
import { exportOrientSolMasterExcel } from '@/components/export/masterExportService';
import { solarSyncState } from '@/services/bridge/solarSyncState';
import { renderCaptureLossMapSection } from '@/components/climate/CaptureLossMapSection';
import { showAlbedoWarningModal } from '@/components/modals/AlbedoWarningModal';
import { formatNum, formatInt } from '@/utils/formatters';

export type MonthlyRadiationComponent = 'global' | 'beam' | 'diffuse' | 'albedo';

export interface OptimalMonthlyStudyProps {
  simulationResult: SolarBridgeSimulationResult;
  locationName: string;
  latitude: number;
  peakPowerKw?: number;
  onBack?: () => void;
  onExit?: () => void;
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Returns monthly radiation for a specific angle from simulation components
 */
function getMonthlyRadiationForAngle(
  res: SolarBridgeSimulationResult,
  comp: MonthlyRadiationComponent,
  angleDeg: number
): number[] {
  const comp91 = res.optimalAnnual?.components91;
  const horizComp = res.optimalAnnual?.horizontalComponents;
  const actualComp = comp;

  if (angleDeg === 0) {
    if (horizComp) {
      if (actualComp === 'global') return horizComp.global;
      if (actualComp === 'beam') return horizComp.beam;
      if (actualComp === 'diffuse') return horizComp.diffuse;
      if (actualComp === 'albedo') return horizComp.albedo;
    }
    if (actualComp === 'global') return res.horizontal.gdm0;
    if (actualComp === 'beam') return res.horizontal.bdm0;
    if (actualComp === 'diffuse') return res.horizontal.ddm0;
    return new Array(12).fill(0.0);
  }

  const angleIdx = Math.max(0, Math.min(90, Math.round(angleDeg) - 1));

  if (comp91) {
    const matrix =
      actualComp === 'global'
        ? comp91.global
        : actualComp === 'beam'
        ? comp91.beam
        : actualComp === 'diffuse'
        ? comp91.diffuse
        : comp91.albedo;

    if (matrix && matrix.length === 12) {
      return matrix.map((row: number[]) => (row && row[angleIdx] !== undefined ? row[angleIdx] : 0.0));
    }
  }

  const optAngle = res.optimalAnnual.optimalTiltDeg;
  if (Math.round(angleDeg) === optAngle && actualComp === 'global') {
    return res.optimalAnnual.monthlyDailyKwh;
  }
  const factor = Math.cos(((angleDeg - optAngle) * Math.PI) / 180);
  return res.optimalAnnual.monthlyDailyKwh.map((v: number) => Math.max(0, Number((v * factor).toFixed(2))));
}

/**
 * Renders the dedicated Optimal Monthly Study Panel (12 Independent Positions)
 */
export function renderOptimalMonthlyStudyPanel(props: OptimalMonthlyStudyProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'optimal-monthly-study-container';

  let stateComponent: MonthlyRadiationComponent = 'global';
  let stateShowCharts = false;
  let stateShowEnergy = false;
  let stateActiveChartTab: 'radiation' | 'tilts' = 'radiation';

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const months = isEn ? MONTHS_EN : MONTHS_ES;
    const res = props.simulationResult;
    const monthlyOpt = res.monthlyOptimum12;
    const optAnnual = res.optimalAnnual;

    const optTilts = monthlyOpt.optimalTiltsDeg;
    const meanTilt = optTilts.reduce((a: number, b: number) => a + b, 0) / 12;

    // Component labels & symbols
    let compLabel = 'Global';
    let compSymbol = 'Gdm';
    if (stateComponent === 'beam') {
      compLabel = isEn ? 'Direct (Beam)' : 'Directa';
      compSymbol = 'Bdm';
    } else if (stateComponent === 'diffuse') {
      compLabel = isEn ? 'Diffuse' : 'Difusa';
      compSymbol = 'Ddm';
    } else if (stateComponent === 'albedo') {
      compLabel = isEn ? 'Albedo' : 'Albedo';
      compSymbol = 'Rdm';
    }

    const isAlbedo = stateComponent === 'albedo';

    // Horizontal radiation
    const rad0 = getMonthlyRadiationForAngle(res, stateComponent, 0);

    // Annual optimal radiation
    const radAnnualOpt = getMonthlyRadiationForAngle(res, stateComponent, optAnnual.optimalTiltDeg);

    // Monthly optimal radiation (each month at its own tilt)
    const radMonthlyOpt: number[] = [];
    for (let m = 0; m < 12; m++) {
      if (stateComponent === 'global') {
        radMonthlyOpt.push(monthlyOpt.monthlyDailyKwh[m]);
      } else {
        const radMonth = getMonthlyRadiationForAngle(res, stateComponent, optTilts[m]);
        radMonthlyOpt.push(radMonth[m]);
      }
    }

    // Temperatures
    const tempVals = res.temperatures.ambient.monthlyMeanC;
    const meanTemp = tempVals.reduce((a: number, b: number) => a + b, 0) / 12;

    // Means
    const mean0 = rad0.reduce((a: number, b: number) => a + b, 0) / 12;
    const meanMonthlyOpt = radMonthlyOpt.reduce((a: number, b: number) => a + b, 0) / 12;
    const meanAnnualOpt = radAnnualOpt.reduce((a: number, b: number) => a + b, 0) / 12;

    // Gains vs Horiz
    const gainsHorizFactors: number[] = [];
    const gainsHorizPcts: number[] = [];
    for (let m = 0; m < 12; m++) {
      const b0 = rad0[m] || 0.0001;
      const opt = radMonthlyOpt[m] || 0.0;
      const factor = b0 > 0.001 ? opt / b0 : 1.0;
      gainsHorizFactors.push(factor);
      gainsHorizPcts.push((factor - 1.0) * 100);
    }
    const meanGainHorizPct = mean0 > 0.001 ? ((meanMonthlyOpt / mean0) - 1) * 100 : 0;

    // Gains vs Annual Optimum
    const gainsAnnualFactors: number[] = [];
    const gainsAnnualPcts: number[] = [];
    for (let m = 0; m < 12; m++) {
      const bAnn = radAnnualOpt[m] || 0.0001;
      const opt = radMonthlyOpt[m] || 0.0;
      const factor = bAnn > 0.001 ? opt / bAnn : 1.0;
      gainsAnnualFactors.push(factor);
      gainsAnnualPcts.push((factor - 1.0) * 100);
    }
    const meanGainAnnualPct = meanAnnualOpt > 0.001 ? ((meanMonthlyOpt / meanAnnualOpt) - 1) * 100 : 0;

    container.innerHTML = `
      <div class="result-card wide-card study-op-detail-card">
        <!-- 1. Header with Location and Title -->
        <div class="opt-study-header">
          <div class="opt-study-title-block">
            <div class="opt-study-badges">
              <span class="badge badge-primary">${props.locationName}</span>
              <span class="badge badge-neutral">Lat: ${formatNum(props.latitude, 2)}°</span>
              <span class="badge badge-success">12 ${isEn ? 'Independent Positions' : 'Posiciones Independientes'}</span>
            </div>
            <h3 class="opt-study-title">
              ${isEn ? 'Monthly Optimization (12 Independent Positions)' : 'Optimización Mensual (12 Posiciones Independientes)'}
            </h3>
            <p class="opt-study-subtitle">
              ${isEn
                ? 'Orientation and inclination calculated independently for each month to maximize total seasonal capture.'
                : 'Inclinación óptima calculada mes a mes de forma independiente para captar el máximo de radiación solar en cada periodo.'}
            </p>
          </div>
        </div>

        <!-- 2. Standardized Control Toolbar -->
        <div class="opt-study-controls-bar">
          <div class="control-group-comp">
            <label for="opt-monthly-comp-select" class="comp-select-label">
              ${isEn ? 'Select component:' : 'Seleccione una componente:'}
            </label>
            <select id="opt-monthly-comp-select" class="form-select select-opt-comp">
              <option value="global" ${stateComponent === 'global' ? 'selected' : ''}>${isEn ? 'Global (Gdm)' : 'Global (Gdm)'}</option>
              <option value="beam" ${stateComponent === 'beam' ? 'selected' : ''}>${isEn ? 'Direct (Bdm)' : 'Directa (Bdm)'}</option>
              <option value="diffuse" ${stateComponent === 'diffuse' ? 'selected' : ''}>${isEn ? 'Diffuse (Ddm)' : 'Difusa (Ddm)'}</option>
              <option value="albedo" ${stateComponent === 'albedo' ? 'selected' : ''}>${isEn ? 'Albedo (Rdm)' : 'Albedo (Rdm)'}</option>
            </select>
          </div>

          <div class="control-group-actions">
            <button id="btn-monthly-view-charts" class="btn-study-view-charts ${stateShowCharts ? 'active' : ''}" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>${stateShowCharts ? (isEn ? 'Hide Charts' : 'Ocultar gráficas') : (isEn ? 'View Charts' : 'Ver gráficas')}</span>
            </button>
          </div>
        </div>

        <!-- 3. 12 Monthly Badges Grid -->
        <div class="monthly-tilts-grid" style="margin-top: 1rem; margin-bottom: 1.25rem;">
          ${optTilts.map((deg: number, idx: number) => `
            <div class="monthly-tilt-badge">
              <span class="monthly-tilt-name">${months[idx]}</span>
              <span class="monthly-tilt-angle">${deg}°</span>
              <span class="monthly-tilt-rad">${formatNum(radMonthlyOpt[idx], 2)} <small>kWh/m²/d</small></span>
            </div>
          `).join('')}
        </div>

        <!-- 4. KPI Mini-Cards -->
        <div class="opt-kpis-summary-grid">
          <div class="kpi-mini-card kpi-optimal">
            <span class="kpi-mini-title">${isEn ? 'Annual Mean (12 Tilts)' : 'Media Anual (12 Inclinaciones)'}</span>
            <div class="kpi-mini-main">${formatNum(meanMonthlyOpt, 2)} <small>kWh/m²/d</small></div>
            <span class="kpi-mini-sub">${formatInt(meanMonthlyOpt * 365)} kWh/m²·${isEn ? 'yr' : 'año'}</span>
          </div>

          <div class="kpi-mini-card kpi-anglex">
            <span class="kpi-mini-title">${isEn ? 'Mean Optimal Tilt' : 'Inclinación Media'}</span>
            <div class="kpi-mini-main">${formatNum(meanTilt, 1)}°</div>
            <span class="kpi-mini-sub">Min: ${Math.min(...optTilts)}° | Max: ${Math.max(...optTilts)}°</span>
          </div>

          <div class="kpi-mini-card kpi-gain">
            <span class="kpi-mini-title">${isEn ? 'Gain vs Optimal Annual' : 'Ganancia s/ Óptimo Anual Fijo'}</span>
            <div class="kpi-mini-main text-gain">+${formatNum(meanGainAnnualPct, 2)}%</div>
            <span class="kpi-mini-sub">+${formatInt((meanMonthlyOpt - meanAnnualOpt) * 365)} kWh/m²·${isEn ? 'yr' : 'año'}</span>
          </div>

          <div class="kpi-mini-card kpi-horiz">
            <span class="kpi-mini-title">${isEn ? 'Gain over Horizontal (0°)' : 'Ganancia s/ Horizontal (0°)'}</span>
            <div class="kpi-mini-main" style="color: var(--accent-cyan);">${isAlbedo ? '-' : `+${formatNum(meanGainHorizPct, 2)}%`}</div>
            <span class="kpi-mini-sub">${isAlbedo ? 'Rdm(0°) = 0' : `+${formatInt(Math.round((meanMonthlyOpt - mean0) * 365))} kWh/m²·${isEn ? 'yr' : 'año'}`}</span>
          </div>
        </div>

        <!-- 5. Optional Graphical Visualizer -->
        ${stateShowCharts ? `
          <div class="opt-charts-panel">
            <div class="opt-charts-header">
              <div class="opt-charts-tabs">
                <button
                  type="button"
                  id="btn-monthly-tab-rad"
                  class="opt-chart-tab-btn ${stateActiveChartTab === 'radiation' ? 'active' : ''}"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="12" width="4" height="9"></rect>
                    <rect x="10" y="7" width="4" height="14"></rect>
                    <rect x="17" y="3" width="4" height="18"></rect>
                  </svg>
                  <span>${isEn ? 'Radiation Comparison' : 'Comparativa de Radiación'}</span>
                </button>
                <button
                  type="button"
                  id="btn-monthly-tab-tilts"
                  class="opt-chart-tab-btn ${stateActiveChartTab === 'tilts' ? 'active' : ''}"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7v5l3 3"></path>
                  </svg>
                  <span>${isEn ? 'Monthly Tilts (12 Angles)' : 'Inclinaciones Mensuales (12 Ángulos)'}</span>
                </button>
              </div>
            </div>

            <div class="opt-chart-view" style="padding: 1.25rem 0.5rem;">
              ${stateActiveChartTab === 'radiation' ? `
                <div style="font-weight: 700; margin-bottom: 0.75rem; text-align: center; color: var(--text-color);">
                  ${isEn ? 'Daily Monthly Radiation Comparison (kWh/m²/day)' : 'Comparativa de Radiación Diaria Mensual (kWh/m²/día)'}
                </div>
                <div style="overflow-x: auto;">
                  <svg viewBox="0 0 760 260" style="width: 100%; max-height: 280px; display: block; font-family: inherit;">
                    <!-- Legend -->
                    <g transform="translate(180, 15)">
                      <rect x="0" y="0" width="14" height="10" fill="#94a3b8" rx="2" />
                      <text x="20" y="10" font-size="11" fill="currentColor">${compSymbol} (0°)</text>
                      <rect x="110" y="0" width="14" height="10" fill="#0284c7" rx="2" />
                      <text x="130" y="10" font-size="11" fill="currentColor">${compSymbol} (${isEn ? 'Annual' : 'Anual'} ${optAnnual.optimalTiltDeg}°)</text>
                      <rect x="250" y="0" width="14" height="10" fill="#10b981" rx="2" />
                      <text x="270" y="10" font-size="11" fill="currentColor">${compSymbol} (${isEn ? '12 Tilts' : '12 Inclinaciones'})</text>
                    </g>
                    <!-- Y Axis Grid -->
                    ${[0, 2, 4, 6, 8].map((val) => {
                      const y = 220 - (val / 8) * 170;
                      return `
                        <line x1="45" y1="${y}" x2="740" y2="${y}" stroke="currentColor" stroke-opacity="0.15" stroke-dasharray="3 3"/>
                        <text x="35" y="${y + 4}" font-size="10" text-anchor="end" fill="currentColor" opacity="0.6">${val}</text>
                      `;
                    }).join('')}
                    <!-- Bars -->
                    ${months.map((m, i) => {
                      const xGroup = 60 + i * 56;
                      const h0 = Math.min(170, (rad0[i] / 8) * 170);
                      const hAnn = Math.min(170, (radAnnualOpt[i] / 8) * 170);
                      const hOpt = Math.min(170, (radMonthlyOpt[i] / 8) * 170);
                      return `
                        <g>
                          <rect x="${xGroup}" y="${220 - h0}" width="12" height="${h0}" fill="#94a3b8" opacity="0.8" rx="2"/>
                          <rect x="${xGroup + 14}" y="${220 - hAnn}" width="12" height="${hAnn}" fill="#0284c7" rx="2"/>
                          <rect x="${xGroup + 28}" y="${220 - hOpt}" width="12" height="${hOpt}" fill="#10b981" rx="2"/>
                          <text x="${xGroup + 20}" y="238" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.8">${m.slice(0, 3)}</text>
                          <text x="${xGroup + 34}" y="${215 - hOpt}" font-size="9" text-anchor="middle" font-weight="bold" fill="#10b981">${formatNum(radMonthlyOpt[i], 1)}</text>
                        </g>
                      `;
                    }).join('')}
                  </svg>
                </div>
              ` : `
                <div style="font-weight: 700; margin-bottom: 0.75rem; text-align: center; color: var(--text-color);">
                  ${isEn ? 'Optimal Tilt Angle per Month (12 Independent Positions)' : 'Ángulo de Inclinación Óptima por Mes (12 Posiciones)'}
                </div>
                <div style="overflow-x: auto;">
                  <svg viewBox="0 0 760 220" style="width: 100%; max-height: 240px; display: block; font-family: inherit;">
                    <!-- Y Axis Grid (0° to 70°) -->
                    ${[0, 15, 30, 45, 60].map((val) => {
                      const y = 180 - (val / 70) * 140;
                      return `
                        <line x1="45" y1="${y}" x2="740" y2="${y}" stroke="currentColor" stroke-opacity="0.15" stroke-dasharray="3 3"/>
                        <text x="35" y="${y + 4}" font-size="10" text-anchor="end" fill="currentColor" opacity="0.6">${val}°</text>
                      `;
                    }).join('')}
                    <!-- Bars & Line -->
                    ${months.map((m, i) => {
                      const x = 75 + i * 56;
                      const h = (optTilts[i] / 70) * 140;
                      const y = 180 - h;
                      return `
                        <g>
                          <rect x="${x - 14}" y="${y}" width="28" height="${h}" fill="#38bdf8" opacity="0.3" rx="3"/>
                          <circle cx="${x}" cy="${y}" r="5" fill="#0284c7" stroke="#ffffff" stroke-width="1.5"/>
                          <text x="${x}" y="${y - 8}" font-size="11" font-weight="bold" text-anchor="middle" fill="#0284c7">${optTilts[i]}°</text>
                          <text x="${x}" y="198" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.8">${m.slice(0, 3)}</text>
                        </g>
                      `;
                    }).join('')}
                  </svg>
                </div>
              `}
            </div>
          </div>
        ` : ''}

        <!-- 6. Main Matrix Table without fixed inclination columns (0°..90°) -->
        <div class="opt-study-table-caption" style="font-size: 0.86rem; font-weight: 600; color: var(--text-muted, #64748b); margin-top: 1.15rem; margin-bottom: 0.35rem;">
          ${isEn ? `Mean monthly daily ${compLabel} radiation (kWh/m²/day)` : `Radiación ${compLabel} media mensual (kWh/m²/día)`}
        </div>
        <div class="opt-table-responsive-wrapper">
          <table class="opt-matrix-table">
            <thead>
              <tr class="table-main-header-row">
                <th rowspan="2" class="th-month">${isEn ? 'Month' : 'Mes'}</th>
                <th rowspan="2" class="th-horiz">${compSymbol}<br/><span style="font-size: 0.72rem;">(0°)</span></th>
                <th rowspan="2" class="th-optimum">
                  <div class="th-opt-title">${isEn ? 'Opt. Tilt (β)' : 'Inclin. Ópt. (β)'}</div>
                  <div class="th-opt-angle-tag">${isEn ? '12 Tilts' : '12 Ángulos'}</div>
                </th>
                <th rowspan="2" class="th-optimum">
                  <div class="th-opt-title">${compSymbol}<br/>${isEn ? 'Monthly Opt.' : 'Ópt. Mensual'}</div>
                  <div class="th-opt-angle-tag">(kWh/m²/d)</div>
                </th>
                <th rowspan="2" class="th-temp">${isEn ? 'Mean Temp' : 'Tª media'}<br/><small>(°C)</small></th>
                <th colspan="2" class="th-gain-horiz">${isEn ? 'Gain vs Horiz' : 'Ganancia s/ Horiz'}<br/><small>(0°)</small></th>
                <th colspan="2" class="th-gain-anglex">
                  ${isEn ? 'Gain vs Annual Opt.' : 'Ganancia s/ Ópt. Anual'}<br/><small>(${optAnnual.optimalTiltDeg}°)</small>
                </th>
              </tr>
              <tr class="table-sub-header-row">
                <th class="th-sub-factor">${isEn ? 'Factor' : 'Factor'}</th>
                <th class="th-sub-pct">%</th>
                <th class="th-sub-factor-x">${isEn ? 'Factor' : 'Factor'}</th>
                <th class="th-sub-pct-x">%</th>
              </tr>
            </thead>
            <tbody>
              ${months.map((mName, idx) => {
                const g0 = rad0[idx];
                const deg = optTilts[idx];
                const gOpt = radMonthlyOpt[idx];
                const temp = tempVals[idx];
                const factH = gainsHorizFactors[idx];
                const pctH = gainsHorizPcts[idx];
                const factA = gainsAnnualFactors[idx];
                const pctA = gainsAnnualPcts[idx];

                const displayFactH = isAlbedo ? '-' : formatNum(factH, 2);
                const displayPctH = isAlbedo ? '-' : `${pctH >= 0 ? '+' : ''}${formatNum(pctH, 2)}`;

                return `
                  <tr>
                    <td class="td-month-name"><strong>${mName}</strong></td>
                    <td class="td-num">${formatNum(g0, 2)}</td>
                    <td class="td-num" style="font-weight: 700; color: #10b981;">${formatNum(deg, 1)}°</td>
                    <td class="td-num td-col-opt" style="font-weight: 800;">${formatNum(gOpt, 2)}</td>
                    <td class="td-num td-col-temp">${formatNum(temp, 1)}</td>
                    <td class="td-num td-gain-factor">${displayFactH}</td>
                    <td class="td-num td-gain-pct ${!isAlbedo && pctH >= 0 ? 'gain-pos' : !isAlbedo ? 'gain-neg' : ''}">${isAlbedo ? '-' : `${displayPctH}%`}</td>
                    <td class="td-num td-gain-factor">${formatNum(factA, 2)}</td>
                    <td class="td-num td-gain-pct ${pctA >= 0 ? 'gain-pos' : 'gain-neg'}">${pctA >= 0 ? '+' : ''}${formatNum(pctA, 2)}%</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="table-media-row">
                <td class="td-month-name"><strong>${isEn ? 'MEAN' : 'MEDIA'}</strong></td>
                <td class="td-num"><strong>${formatNum(mean0, 2)}</strong></td>
                <td class="td-num" style="font-weight: 700; color: #10b981;"><strong>${formatNum(meanTilt, 1)}°</strong></td>
                <td class="td-num td-col-opt"><strong>${formatNum(meanMonthlyOpt, 2)}</strong></td>
                <td class="td-num td-col-temp"><strong>${formatNum(meanTemp, 1)}</strong></td>
                <td class="td-num td-gain-factor"><strong>${isAlbedo ? '-' : (mean0 > 0.001 ? formatNum(meanMonthlyOpt / mean0, 2) : '1,00')}</strong></td>
                <td class="td-num td-gain-pct gain-pos"><strong>${isAlbedo ? '-' : `+${formatNum(meanGainHorizPct, 2)}%`}</strong></td>
                <td class="td-num td-gain-factor"><strong>${(meanAnnualOpt > 0.001 ? formatNum(meanMonthlyOpt / meanAnnualOpt, 2) : '1,00')}</strong></td>
                <td class="td-num td-gain-pct gain-pos"><strong>+${formatNum(meanGainAnnualPct, 2)}%</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- 6.5 Mapa de Pérdidas de Captación (CTE DB-HE4) para Optimizaciones Mensuales -->
        <div id="monthly-loss-map-mount-point"></div>

        <!-- 7. Standardized Action Button Footer -->
        <div class="opt-study-footer-actions">
          <div class="footer-btn-left-group">
            <button type="button" id="btn-monthly-volver" class="btn-study-foot btn-volver">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>${isEn ? 'Back' : 'Volver'}</span>
            </button>
            <button type="button" id="btn-monthly-salir" class="btn-study-foot btn-salir">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>${isEn ? 'Exit' : 'Salir'}</span>
            </button>
          </div>

          <div class="footer-btn-right-group">
            <button type="button" id="btn-monthly-goto-energy" class="btn-study-foot btn-energy ${stateShowEnergy ? 'active' : ''}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>${stateShowEnergy ? (isEn ? 'Hide Energy Calculation' : 'Ocultar cálculo de energía') : (isEn ? 'Energy Calculation' : 'Cálculo de energía')}</span>
            </button>

            <button type="button" id="btn-monthly-export-excel" class="btn-study-foot btn-excel">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>${isEn ? 'Export to Excel' : 'Exportar a Excel'}</span>
            </button>

            <button type="button" id="btn-monthly-export-report" class="btn-study-foot btn-report">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <span>${isEn ? 'Generate PDF report' : 'Generar un informe PDF'}</span>
            </button>
          </div>
        </div>

        <!-- 8. Mount point for Energy Calculation Panel -->
        <div id="monthly-energy-mount-point"></div>
      </div>
    `;

    // Hook CTE DB-HE4 Monthly Capture Loss Map
    const lossMapMountPoint = container.querySelector<HTMLDivElement>('#monthly-loss-map-mount-point');
    if (lossMapMountPoint) {
      lossMapMountPoint.innerHTML = '';
      const lossMapSection = renderCaptureLossMapSection({
        mode: 'monthly',
        simulationResult: res,
        isEn,
      });
      lossMapMountPoint.appendChild(lossMapSection);
    }

    // Hook Active Energy Panel
    const energyMountPoint = container.querySelector<HTMLDivElement>('#monthly-energy-mount-point');
    if (energyMountPoint && stateShowEnergy) {
      energyMountPoint.innerHTML = '';
      const energyWindow = renderEnergyCalculationPanel({
        simulationResult: res,
        locationName: props.locationName,
        latitude: props.latitude,
        studyType: 'monthly',
        initialPeakKw: props.peakPowerKw ?? 5.0,
        onClose: () => {
          stateShowEnergy = false;
          renderInternal();
          container.querySelector('.opt-study-footer-actions')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
      });
      energyMountPoint.appendChild(energyWindow);
    }

    // Attach listeners
    const compSelect = container.querySelector<HTMLSelectElement>('#opt-monthly-comp-select');
    compSelect?.addEventListener('change', () => {
      stateComponent = (compSelect.value || 'global') as MonthlyRadiationComponent;
      if (stateComponent === 'albedo') {
        showAlbedoWarningModal(isEn);
      }
      renderInternal();
    });

    const btnViewCharts = container.querySelector<HTMLButtonElement>('#btn-monthly-view-charts');
    btnViewCharts?.addEventListener('click', () => {
      stateShowCharts = !stateShowCharts;
      renderInternal();
    });

    const tabRad = container.querySelector<HTMLButtonElement>('#btn-monthly-tab-rad');
    tabRad?.addEventListener('click', () => {
      stateActiveChartTab = 'radiation';
      renderInternal();
    });

    const tabTilts = container.querySelector<HTMLButtonElement>('#btn-monthly-tab-tilts');
    tabTilts?.addEventListener('click', () => {
      stateActiveChartTab = 'tilts';
      renderInternal();
    });

    const btnVolver = container.querySelector<HTMLButtonElement>('#btn-monthly-volver');
    btnVolver?.addEventListener('click', () => {
      if (props.onBack) props.onBack();
    });

    const btnSalir = container.querySelector<HTMLButtonElement>('#btn-monthly-salir');
    btnSalir?.addEventListener('click', () => {
      if (props.onExit) props.onExit();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const btnEnergy = container.querySelector<HTMLButtonElement>('#btn-monthly-goto-energy');
    btnEnergy?.addEventListener('click', () => {
      stateShowEnergy = !stateShowEnergy;
      renderInternal();
      if (stateShowEnergy) {
        setTimeout(() => {
          container.querySelector('#monthly-energy-mount-point')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });

    const btnExportExcel = container.querySelector<HTMLButtonElement>('#btn-monthly-export-excel');
    btnExportExcel?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'excel',
        activeComponent: stateComponent,
        isEn,
        onConfirm: (mode) => {
          exportOrientSolMasterExcel(res, {
            activeStudyOp: 'monthly',
            activeComponent: stateComponent,
            exportMode: mode,
            isEn,
            peakPowerKw: solarSyncState.getPeakPowerKw(),
            performanceRatio: solarSyncState.getPerformanceRatio(),
            tonc: solarSyncState.getTonc(),
          });
        },
      });
    });

    const btnExportReport = container.querySelector<HTMLButtonElement>('#btn-monthly-export-report');
    btnExportReport?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'pdf',
        activeComponent: stateComponent,
        isEn,
        onConfirm: (mode) => {
          showPdfGenerationNoticeModal(isEn, () => {
            generateOrientSolPDFReport(res, isEn, 'monthly', {
              peakPowerKw: solarSyncState.getPeakPowerKw(),
              performanceRatio: solarSyncState.getPerformanceRatio(),
              tonc: solarSyncState.getTonc(),
              componentsMode: mode,
              activeComponent: stateComponent,
            });
          });
        },
      });
    });
  }

  renderInternal();
  return container;
}
