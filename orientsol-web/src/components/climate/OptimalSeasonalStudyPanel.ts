import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import {
  getMonthlyRadiationForAngle,
  type TableRadiationComponent,
} from '@/components/climate/OptimalAnnualStudyPanel';
import {
  showPdfGenerationNoticeModal,
  generateOrientSolPDFReport,
  showExportComponentChoiceModal,
} from '@/components/export/pdfReportGenerator';
import { exportOrientSolMasterExcel } from '@/components/export/masterExportService';
import { renderEnergyCalculationPanel } from '@/components/energy/EnergyCalculationPanel';
import { renderOptimalSeasonalGraphsWindow } from '@/components/charts/OptimalSeasonalGraphsWindow';
import { renderCaptureLossMapSection } from '@/components/climate/CaptureLossMapSection';
import { solarSyncState } from '@/services/bridge/solarSyncState';
import { exportSeasonalExcelWorkbook } from '@/components/export/seasonalExportHelper';
import { formatNum } from '@/utils/formatters';

export type SeasonalRadiationComponent = 'global' | 'beam' | 'diffuse' | 'albedo' | 'all';

interface OptimalSeasonalStudyProps {
  simulationResult: SolarBridgeSimulationResult;
  locationName: string;
  latitude: number;
  peakPowerKw?: number;
}

// Module-level component state
let stateSeasonalComponent: SeasonalRadiationComponent = 'global';
let stateSeasonalShowEnergy: boolean = false;
let stateSeasonalShowGraphs: boolean = false;

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Seasonal order: Invierno (Dic, Ene, Feb), Primavera (Mar, Abr, May), Verano (Jun, Jul, Ago), Otoño (Sep, Oct, Nov)
const SEASONAL_MONTH_ORDER = [
  { season: 'winter', monthIdx: 11 }, // Diciembre
  { season: 'winter', monthIdx: 0 },  // Enero
  { season: 'winter', monthIdx: 1 },  // Febrero
  { season: 'spring', monthIdx: 2 },  // Marzo
  { season: 'spring', monthIdx: 3 },  // Abril
  { season: 'spring', monthIdx: 4 },  // Mayo
  { season: 'summer', monthIdx: 5 },  // Junio
  { season: 'summer', monthIdx: 6 },  // Julio
  { season: 'summer', monthIdx: 7 },  // Agosto
  { season: 'autumn', monthIdx: 8 },  // Septiembre
  { season: 'autumn', monthIdx: 9 },  // Octubre
  { season: 'autumn', monthIdx: 10 }, // Noviembre
];

/**
 * Notice modal for Albedo radiation
 */
function showAlbedoWarningModal(isEn: boolean) {
  const existing = document.getElementById('matlab-albedo-seasonal-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'matlab-albedo-seasonal-modal';
  backdrop.className = 'matlab-modal-backdrop';

  backdrop.innerHTML = `
    <div class="matlab-dialog-box" role="dialog" aria-modal="true" style="max-width: 480px;">
      <div class="matlab-dialog-titlebar">
        <span class="matlab-title-text">${isEn ? 'Notice' : 'Aviso'}</span>
        <button type="button" class="matlab-close-btn" aria-label="Cerrar">&times;</button>
      </div>
      <div class="matlab-dialog-body">
        <div class="matlab-dialog-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#38bdf8" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="matlab-dialog-msg">
          ${
            isEn
              ? '<strong>Albedo Radiation Warning:</strong><br/>Gains with respect to the horizontal plane (0°) cannot be calculated because Rdm(0°) is zero on a flat ground surface.'
              : '<strong>Aviso de Radiación de Albedo:</strong><br/>Las ganancias respecto al plano horizontal (0°) no se pueden calcular debido a que Rdm(0°) es nula sobre la superficie horizontal.'
          }
        </div>
      </div>
      <div class="matlab-dialog-actions">
        <button type="button" class="matlab-btn-default btn-albedo-ok">OK</button>
      </div>
    </div>
  `;

  const close = () => backdrop.remove();
  backdrop.querySelector('.matlab-close-btn')?.addEventListener('click', close);
  backdrop.querySelector('.btn-albedo-ok')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  document.body.appendChild(backdrop);
}

/**
 * Modal to ask user whether to export only the active component or all components
 * matching MATLAB questdlg in Tabla_OptEstacional.m:
 * '¿Qué desea exportar a un fichero Excel?'
 * ['Sólo la componente visualizada', 'Todas las componentes']
 */
export function showSeasonalExcelExportModal(
  res: SolarBridgeSimulationResult,
  activeComponent: SeasonalRadiationComponent,
  isEn: boolean
) {
  const existing = document.getElementById('matlab-seasonal-excel-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'matlab-seasonal-excel-modal';
  backdrop.className = 'matlab-modal-backdrop';

  backdrop.innerHTML = `
    <div class="matlab-dialog-box" role="dialog" aria-modal="true" style="max-width: 500px;">
      <div class="matlab-dialog-titlebar">
        <span class="matlab-title-text">${isEn ? 'Select Option' : 'Seleccione la opción deseada'}</span>
        <button type="button" class="matlab-close-btn" aria-label="Cerrar">&times;</button>
      </div>
      <div class="matlab-dialog-body" style="padding: 1.5rem 1.25rem;">
        <div class="matlab-dialog-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#38bdf8" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="matlab-dialog-msg" style="font-size: 0.95rem; font-weight: 600; color: var(--text-main, #0f172a);">
          ${isEn ? 'What would you like to export to an Excel file?' : '¿Qué desea exportar a un fichero Excel?'}
        </div>
      </div>
      <div class="matlab-dialog-actions" style="justify-content: flex-end; gap: 0.75rem; padding: 1rem 1.25rem;">
        <button type="button" id="btn-export-single-comp" class="matlab-btn-default" style="font-size: 0.82rem; padding: 0.5rem 0.9rem;">
          ${isEn ? 'Only displayed component' : 'Sólo la componente visualizada'}
        </button>
        <button type="button" id="btn-export-all-comps" class="matlab-btn-default" style="font-size: 0.82rem; padding: 0.5rem 0.9rem; background: #0284c7; border-color: #38bdf8; color: #ffffff;">
          ${isEn ? 'All components' : 'Todas las componentes'}
        </button>
      </div>
    </div>
  `;

  const close = () => backdrop.remove();
  backdrop.querySelector('.matlab-close-btn')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector('#btn-export-single-comp')?.addEventListener('click', () => {
    close();
    exportSeasonalExcelFile(res, activeComponent === 'all' ? 'global' : activeComponent, false, isEn);
  });

  backdrop.querySelector('#btn-export-all-comps')?.addEventListener('click', () => {
    close();
    exportSeasonalExcelFile(res, 'all', true, isEn);
  });

  document.body.appendChild(backdrop);
}


/**
 * Exports Excel workbook and triggers file download or save picker
 */
async function exportSeasonalExcelFile(
  res: SolarBridgeSimulationResult,
  selectedComp: SeasonalRadiationComponent,
  allComponents: boolean,
  isEn: boolean
) {
  const comp = (selectedComp === 'all' ? 'global' : selectedComp) as TableRadiationComponent;
  await exportSeasonalExcelWorkbook(res, {
    activeComponent: comp,
    exportMode: allComponents ? 'all' : 'single',
    isEn,
    peakPowerKw: solarSyncState.getPeakPowerKw(),
    tonc: solarSyncState.getTonc(),
  });
  showSuccessExportNotice(isEn);
}

/**
 * Notice: 'Datos exportados satisfactoriamente en el directorio deseado'
 * matching msgbox in Tabla_OptEstacional.m
 */
function showSuccessExportNotice(isEn: boolean) {
  const existing = document.getElementById('matlab-seasonal-export-success');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'matlab-seasonal-export-success';
  backdrop.className = 'matlab-modal-backdrop';

  backdrop.innerHTML = `
    <div class="matlab-dialog-box" role="dialog" aria-modal="true" style="max-width: 480px;">
      <div class="matlab-dialog-titlebar">
        <span class="matlab-title-text">${isEn ? 'Notice' : 'Aviso'}</span>
        <button type="button" class="matlab-close-btn" aria-label="Cerrar">&times;</button>
      </div>
      <div class="matlab-dialog-body" style="padding: 1.5rem 1.25rem; text-align: center;">
        <p class="matlab-dialog-msg" style="font-size: 0.95rem; color: var(--text-main, #0f172a); font-weight: 600;">
          ${
            isEn
              ? 'Data successfully exported to the desired directory'
              : 'Datos exportados satisfactoriamente en el directorio deseado'
          }
        </p>
      </div>
      <div class="matlab-dialog-actions" style="justify-content: center; padding-bottom: 1.2rem;">
        <button type="button" class="matlab-btn-default btn-success-ok" style="min-width: 90px;">
          OK
        </button>
      </div>
    </div>
  `;

  const close = () => backdrop.remove();
  backdrop.querySelector('.matlab-close-btn')?.addEventListener('click', close);
  backdrop.querySelector('.btn-success-ok')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  document.body.appendChild(backdrop);
}

/**
 * Main component renderer for OrientSol 4.0 Inclinación Óptima Estacional
 * matching Figura 5.2.89 (Image 4)
 */
export function renderOptimalSeasonalStudyPanel(props: OptimalSeasonalStudyProps): HTMLElement {
  const { simulationResult: res, locationName, latitude } = props;
  const container = document.createElement('div');
  container.className = 'opt-seasonal-study-card';
  container.id = 'seasonal-study-window';

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const t = i18n.t;

    const compActual: TableRadiationComponent =
      stateSeasonalComponent === 'all' ? 'global' : stateSeasonalComponent;
    const isAlbedo = compActual === 'albedo';

    const compTitle =
      compActual === 'global'
        ? (isEn ? 'Global' : 'global')
        : compActual === 'beam'
        ? (isEn ? 'Direct' : 'directa')
        : compActual === 'diffuse'
        ? (isEn ? 'Diffuse' : 'difusa')
        : (isEn ? 'Albedo' : 'albedo');

    const compSym = compActual === 'global' ? 'Gdm' : compActual === 'beam' ? 'Bdm' : compActual === 'diffuse' ? 'Ddm' : 'Rdm';

    const winterDeg = res.seasonal.winterTiltDeg;
    const springDeg = res.seasonal.springTiltDeg;
    const summerDeg = res.seasonal.summerTiltDeg;
    const autumnDeg = res.seasonal.autumnTiltDeg;
    const annualOptDeg = res.optimalAnnual.optimalTiltDeg;

    // Standard 7 tilt angles for display: 0, 15, 30, 45, 60, 75, 90
    const angles = [0, 15, 30, 45, 60, 75, 90];
    const radAngles: number[][] = angles.map((ang) => getMonthlyRadiationForAngle(res, compActual, ang));

    // Annual optimum values for each month
    const radAnnualOpt: number[] = getMonthlyRadiationForAngle(res, compActual, annualOptDeg);

    // Get optimal seasonal radiation for each month at its respective seasonal angle
    const radSeasonalOpt: number[] = new Array(12).fill(0);
    for (let m = 0; m < 12; m++) {
      let degForMonth = winterDeg;
      if (m === 2 || m === 3 || m === 4) degForMonth = springDeg;
      else if (m === 5 || m === 6 || m === 7) degForMonth = summerDeg;
      else if (m === 8 || m === 9 || m === 10) degForMonth = autumnDeg;
      radSeasonalOpt[m] = getMonthlyRadiationForAngle(res, compActual, degForMonth)[m];
    }

    // Gains calculation for each month
    const gainsHoriz: number[] = [];
    const gainsAnnual: number[] = [];
    for (let m = 0; m < 12; m++) {
      const gOpt = radSeasonalOpt[m];
      const g0 = radAngles[0][m];
      const gAnu = radAnnualOpt[m];

      const pct0 = g0 > 0 ? ((gOpt - g0) / g0) * 100 : 0;
      const pctAnu = gAnu > 0 ? ((gOpt - gAnu) / gAnu) * 100 : 0;

      gainsHoriz.push(pct0);
      gainsAnnual.push(pctAnu);
    }

    // Annual means
    const meanRadAngles = angles.map((_, aIdx) => {
      const arr = radAngles[aIdx];
      return arr.reduce((a, b) => a + b, 0) / 12;
    });
    const meanSeasonalOpt = radSeasonalOpt.reduce((a, b) => a + b, 0) / 12;
    const meanGainHoriz = gainsHoriz.reduce((a, b) => a + b, 0) / 12;
    const meanGainAnnual = gainsAnnual.reduce((a, b) => a + b, 0) / 12;

    container.innerHTML = `
      <div class="opt-seasonal-window-frame">
        <!-- 1. Top Window Header matching OrientSol 4.0 Figura 5.2.89 -->
        <div class="opt-seasonal-header-bar">
          <div class="opt-seasonal-header-left">
            <div class="opt-seasonal-meta-row">
              <span class="meta-label">
                <strong>${isEn ? 'City:' : 'Ciudad:'}</strong>
                <span class="meta-val meta-city" style="font-weight: 700; margin-left: 0.35rem;">${locationName}</span>
              </span>
              <span class="meta-label" style="margin-left: 2rem;">
                <strong>${isEn ? 'Latitude (°):' : 'Latitud (°):'}</strong>
                <span class="meta-val" style="font-weight: 700; margin-left: 0.35rem;">${formatNum(latitude, 2)}°</span>
              </span>
            </div>
            <div class="opt-seasonal-study-title-row">
              <span class="meta-label">
                <strong>${isEn ? 'Study:' : 'Estudio:'}</strong>
                <span class="meta-val" style="font-weight: 600; margin-left: 0.35rem;">${isEn ? 'Seasonal optimal tilt' : 'Inclinación óptima estacional'}</span>
              </span>
            </div>
          </div>
          <div class="opt-seasonal-header-right">
            <div class="opt-matlab-brand-title">
              ORIENT<span style="color: #f59e0b;">SOL</span> <strong>4.0</strong>
            </div>
          </div>
        </div>

        <!-- 2. Controls Toolbar -->
        <div class="opt-seasonal-toolbar">
          <div class="seasonal-comp-select-group">
            <label for="seasonal-comp-select" class="seasonal-comp-label">
              ${isEn ? 'Select a component' : 'Seleccione una componente'}
            </label>
            <select id="seasonal-comp-select" class="form-select seasonal-comp-dropdown">
              <option value="global" ${stateSeasonalComponent === 'global' ? 'selected' : ''}>${t.results.compGlobal}</option>
              <option value="beam" ${stateSeasonalComponent === 'beam' ? 'selected' : ''}>${t.results.compBeam}</option>
              <option value="diffuse" ${stateSeasonalComponent === 'diffuse' ? 'selected' : ''}>${t.results.compDiffuse}</option>
              <option value="albedo" ${stateSeasonalComponent === 'albedo' ? 'selected' : ''}>${t.results.compAlbedo}</option>
              <option value="all" ${stateSeasonalComponent === 'all' ? 'selected' : ''}>${t.results.compAll}</option>
            </select>
          </div>

          <div class="seasonal-toolbar-actions">
            <button id="btn-seasonal-view-charts" class="btn-study-view-charts ${stateSeasonalShowGraphs ? 'active' : ''}" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>${stateSeasonalShowGraphs ? (isEn ? 'Hide Charts' : 'Ocultar gráficas') : (isEn ? 'View Charts' : 'Ver gráficas')}</span>
            </button>
          </div>
        </div>

        <!-- 3. Table Title -->
        <div class="opt-seasonal-table-caption">
          ${isEn ? `Mean monthly daily ${compTitle} radiation (kWh/m²/day)` : `Radiación ${compTitle} media mensual (kWh/m²/día)`}
        </div>

        <!-- 4. Main Matrix Table matching Figura 5.2.89 -->
        <div class="opt-seasonal-table-wrap">
          <table class="opt-seasonal-table">
            <thead>
              <tr class="seasonal-top-th-row">
                <th rowspan="2" class="th-season-month">${isEn ? 'Month' : 'Mes'}</th>
                ${angles.map((ang) => `<th rowspan="2" class="th-ang-col">${compSym}<br/><span style="font-size: 0.74rem;">(${ang}°)</span></th>`).join('')}
                <th rowspan="2" class="th-opt-angle-col">${isEn ? 'Optimal<br/>Angle (°)' : 'Ángulo<br/>óptimo (°)'}</th>
                <th rowspan="2" class="th-opt-rad-col" title="${isEn ? 'Daily radiation with collector fixed at seasonal optimal tilt' : 'Radiación diaria con colector fijado a la inclinación óptima trimestral'}">${compSym}<br/><span style="font-size: 0.72rem;">${isEn ? '(seasonal β)' : '(β estac.)'}</span></th>
                <th colspan="2" class="th-gains-super-col">${isEn ? 'Gains (%)' : 'Ganancias (%)'}</th>
              </tr>
              <tr class="seasonal-sub-th-row">
                <th class="th-gain-sub">${isEn ? 'Horiz.<br/>plane' : 'Plano<br/>horiz.'}</th>
                <th class="th-gain-sub">${isEn ? 'Opt. annual<br/>tilt' : 'Inclinación<br/>ópt. anual'}</th>
              </tr>
            </thead>
            <tbody>
              ${SEASONAL_MONTH_ORDER.map(({ season, monthIdx }) => {
                const monthName = isEn ? MONTH_NAMES_EN[monthIdx] : MONTH_NAMES_ES[monthIdx];
                const gOpt = radSeasonalOpt[monthIdx];
                const pctHoriz = gainsHoriz[monthIdx];
                const pctAnu = gainsAnnual[monthIdx];

                // Optimal angle display for season (central month emphasized, all rows clearly indicated)
                const seasonDeg =
                  season === 'winter'
                    ? winterDeg
                    : season === 'spring'
                    ? springDeg
                    : season === 'summer'
                    ? summerDeg
                    : autumnDeg;

                const isCentralMonth =
                  (season === 'winter' && monthIdx === 0) ||
                  (season === 'spring' && monthIdx === 3) ||
                  (season === 'summer' && monthIdx === 6) ||
                  (season === 'autumn' && monthIdx === 9);

                const optAngleCell = isCentralMonth
                  ? `<strong class="text-season-${season}" style="font-size: 0.98rem;">${seasonDeg}°</strong>`
                  : `<span class="text-season-${season}" style="font-size: 0.82rem; opacity: 0.72; font-weight: 600;">${seasonDeg}°</span>`;

                // Gdm óptimo text color based on season
                const optColorClass =
                  season === 'winter'
                    ? 'val-opt-winter'
                    : season === 'spring'
                    ? 'val-opt-spring'
                    : season === 'summer'
                    ? 'val-opt-summer'
                    : 'val-opt-autumn';

                const displayPctH = isAlbedo ? '-' : formatNum(pctHoriz, 2);
                const displayPctAnu = formatNum(pctAnu, 2);

                return `
                  <tr class="row-season-${season}">
                    <td class="td-month-badge badge-${season}">
                      <strong>${monthName}</strong>
                    </td>
                    ${angles.map((_, aIdx) => `<td class="td-num">${formatNum(radAngles[aIdx][monthIdx], 2)}</td>`).join('')}
                    <td class="td-num td-opt-deg-cell">${optAngleCell}</td>
                    <td class="td-num td-opt-val ${optColorClass}"><strong>${formatNum(gOpt, 2)}</strong></td>
                    <td class="td-num td-gain-h ${!isAlbedo && pctHoriz >= 0 ? 'text-gain-pos' : !isAlbedo ? 'text-gain-neg' : ''}">${displayPctH}</td>
                    <td class="td-num td-gain-anu ${pctAnu >= 0 ? 'text-gain-pos' : 'text-gain-neg'}">${displayPctAnu}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="seasonal-media-row">
                <td class="td-month-badge badge-media">
                  <strong>${isEn ? 'MEAN' : 'MEDIA'}</strong>
                </td>
                ${meanRadAngles.map((v) => `<td class="td-num"><strong>${formatNum(v, 2)}</strong></td>`).join('')}
                <td class="td-num" style="text-align: center; font-size: 0.78rem; font-weight: 700; color: #10b981;"><strong>${formatNum((winterDeg + springDeg + summerDeg + autumnDeg) / 4, 1)}°</strong></td>
                <td class="td-num td-opt-val highlight-media"><strong>${formatNum(meanSeasonalOpt, 2)}</strong></td>
                <td class="td-num td-gain-h ${!isAlbedo && meanGainHoriz >= 0 ? 'text-gain-pos' : !isAlbedo ? 'text-gain-neg' : ''}"><strong>${isAlbedo ? '-' : formatNum(meanGainHoriz, 2)}</strong></td>
                <td class="td-num td-gain-anu ${meanGainAnnual >= 0 ? 'text-gain-pos' : 'text-gain-neg'}"><strong>${formatNum(meanGainAnnual, 2)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Fundamento Didáctico de Optimización Estacional -->
        <div class="seasonal-methodology-note">
          <div class="seasonal-methodology-header">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>${isEn ? 'Methodological Clarification: Seasonal Tilt Optimization vs Monthly Optimum' : 'Aclaración Metodológica: Inclinación Óptima Estacional (4 Posiciones) vs Óptimo Mensual'}</span>
          </div>
          <div class="seasonal-methodology-grid">
            <div class="seasonal-methodology-item">
              <strong>${isEn ? 'Energy Maximization (Not Simple Angle Average):' : 'Maximización de Energía (No Promedio Aritmético de Ángulos):'}</strong>
              <div class="seasonal-methodology-desc">
                ${isEn
                  ? 'OrientSol does not average the 3 individual monthly angles. Instead, it solves for the single tilt angle that maximizes the total accumulated solar energy (kWh) over the entire trimester. Months with higher solar irradiance weigh more heavily, pulling the optimal angle towards their peak yield.'
                  : 'OrientSol no promedia aritméticamente los ángulos óptimos de los 3 meses. En su lugar, busca la inclinación única que maximiza la energía total acumulada (kWh) en todo el trimestre. Los meses con mayor insolación tienen mayor peso energético y arrastran el ángulo óptimo para obtener la máxima cosecha de kWh.'}
              </div>
            </div>
            <div class="seasonal-methodology-item">
              <strong>${isEn ? 'Quarterly Fixed Compromise (4 Positions/Year):' : 'Compromiso Trimestral Fijo (4 Posiciones/Año):'}</strong>
              <div class="seasonal-methodology-desc">
                ${isEn
                  ? 'The collector slope remains fixed for 3 months. Consequently, individual months may yield slightly less than their independent peak (e.g., in March or May under spring tilt of 25°). For the maximum possible yield with independent monthly tilt adjustments, refer to the Monthly Optimum Study (12 positions).'
                  : 'El colector permanece fijado durante los 3 meses de la estación. Por ello, en meses individuales la radiación puede ser algo menor que su óptimo aislado (p. ej. en marzo o mayo con inclinación primaveral de 25°). Para obtener el máximo independiente en cada mes, consulte el estudio de Inclinación Óptima Mensual (12 posiciones).'}
              </div>
            </div>
            <div class="seasonal-methodology-item">
              <strong>${isEn ? 'Summer Shallow Angles (Near-Horizontal):' : 'Ángulos Tendidos en Verano (Casi Horizontales):'}</strong>
              <div class="seasonal-methodology-desc">
                ${isEn
                  ? 'In mid-latitudes such as Madrid (40.4° N), summer days exceed 14.5 hours with solar noon altitude up to 73°. Slopes above 10° cause significant morning and late-afternoon loss when the sun rises Northeast and sets Northwest; a shallow angle (6°) captures the full wide solar arc.'
                  : 'En latitudes medias como Madrid (40,4° N), el sol de verano tiene trayectorias de más de 14,5 horas con alturas de hasta 73°. Inclinaciones superiores a 10° generan pérdidas matinales y vespertinas al salir el sol por el Noreste y ponerse por el Noroeste; un ángulo casi plano (6°) capta el arco solar íntegro.'}
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Bottom Action Buttons matching MATLAB Figura 5.2.89 -->
        <div class="opt-study-footer-actions">
          <div class="footer-btn-left-group">
            <button id="btn-seasonal-volver" class="btn-study-foot btn-volver" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>${isEn ? 'Back' : 'Volver'}</span>
            </button>
            <button id="btn-seasonal-salir" class="btn-study-foot btn-salir" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>${isEn ? 'Exit' : 'Salir'}</span>
            </button>
          </div>

          <div class="footer-btn-right-group">
            <button id="btn-seasonal-goto-energy" class="btn-study-foot btn-energy ${stateSeasonalShowEnergy ? 'active' : ''}" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>${stateSeasonalShowEnergy ? (isEn ? 'Hide Energy Calculation' : 'Ocultar cálculo de energía') : t.results.energyCalcBtn}</span>
            </button>

            <button id="btn-seasonal-export-excel" class="btn-study-foot btn-excel" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>${t.results.exportExcelBtn}</span>
            </button>

            <button id="btn-seasonal-export-report" class="btn-study-foot btn-report" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <span>${t.results.generateReportBtn}</span>
            </button>
          </div>
        </div>

        <!-- Mount point for CTE DB-HE4 Seasonal Capture Loss Map -->
        <div id="seasonal-loss-map-mount-point"></div>

        <!-- Mount point for Dedicated MATLAB Energy Calculation Window (Imagen 1 / Energia_Osterwald.m) -->
        <div id="opt-seasonal-energy-mount-point"></div>

        <!-- Mount point for Dedicated MATLAB Seasonal Graphs Window (Imagen 2) -->
        <div id="opt-seasonal-graphs-mount-point"></div>
      </div>
    `;

    // Hook CTE DB-HE4 Seasonal Capture Loss Map
    const lossMapMountPoint = container.querySelector<HTMLDivElement>('#seasonal-loss-map-mount-point');
    if (lossMapMountPoint) {
      lossMapMountPoint.innerHTML = '';
      const lossMapSection = renderCaptureLossMapSection({
        mode: 'seasonal',
        simulationResult: res,
        isEn,
      });
      lossMapMountPoint.appendChild(lossMapSection);
    }

    // Mount Graphs Panel if active
    const graphsMountPoint = container.querySelector<HTMLDivElement>('#opt-seasonal-graphs-mount-point');
    if (graphsMountPoint && stateSeasonalShowGraphs) {
      graphsMountPoint.innerHTML = '';
      const graphsWindow = renderOptimalSeasonalGraphsWindow({
        simulationResult: res,
        locationName,
        latitude,
        initialComponent: stateSeasonalComponent,
        onBack: () => {
          stateSeasonalShowGraphs = false;
          renderInternal();
          container.querySelector('.opt-seasonal-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
        onExit: () => {
          stateSeasonalShowGraphs = false;
          renderInternal();
        },
      });
      graphsMountPoint.appendChild(graphsWindow);
    }

    // Mount Energy Panel if active
    const energyMountPoint = container.querySelector<HTMLDivElement>('#opt-seasonal-energy-mount-point');
    if (energyMountPoint && stateSeasonalShowEnergy) {
      energyMountPoint.innerHTML = '';
      const energyWindow = renderEnergyCalculationPanel({
        simulationResult: res,
        locationName,
        latitude,
        studyType: 'seasonal',
        initialPeakKw: props.peakPowerKw ?? 5.0,
        onClose: () => {
          stateSeasonalShowEnergy = false;
          renderInternal();
          container.querySelector('.opt-seasonal-footer-buttons')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
      });
      energyMountPoint.appendChild(energyWindow);
    }

    // Event Listeners
    // 1. Component Selector Dropdown
    const compSelect = container.querySelector<HTMLSelectElement>('#seasonal-comp-select');
    compSelect?.addEventListener('change', () => {
      const val = (compSelect.value || 'global') as SeasonalRadiationComponent;
      stateSeasonalComponent = val;
      if (val === 'albedo') {
        showAlbedoWarningModal(isEn);
      }
      renderInternal();
    });

    // 2. View Charts Action
    const btnViewCharts = container.querySelector<HTMLButtonElement>('#btn-seasonal-view-charts');
    btnViewCharts?.addEventListener('click', () => {
      stateSeasonalShowGraphs = !stateSeasonalShowGraphs;
      renderInternal();
      if (stateSeasonalShowGraphs) {
        setTimeout(() => {
          container.querySelector('#opt-seasonal-graphs-mount-point')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });

    // 3. Salir Button
    const btnSalir = container.querySelector<HTMLButtonElement>('#btn-seasonal-salir');
    btnSalir?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 4. Volver Button
    const btnVolver = container.querySelector<HTMLButtonElement>('#btn-seasonal-volver');
    btnVolver?.addEventListener('click', () => {
      const prevSection = document.querySelector('#opt-annual-study-mount-point') || document.querySelector('.results-header');
      if (prevSection) {
        prevSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // 5. Toggle Energy Calculation Panel (Imagen 1 / Energia_Osterwald.m)
    const btnEnergy = container.querySelector<HTMLButtonElement>('#btn-seasonal-goto-energy');
    btnEnergy?.addEventListener('click', () => {
      stateSeasonalShowEnergy = !stateSeasonalShowEnergy;
      renderInternal();
      if (stateSeasonalShowEnergy) {
        setTimeout(() => {
          container.querySelector('#opt-seasonal-energy-mount-point')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    });

    // 6. Export to Excel (Figures 5.2.90 & 5.2.91)
    const btnExportExcel = container.querySelector<HTMLButtonElement>('#btn-seasonal-export-excel');
    btnExportExcel?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'excel',
        activeComponent: compActual,
        isEn,
        onConfirm: (mode) => {
          exportOrientSolMasterExcel(res, {
            activeStudyOp: 'seasonal',
            activeComponent: compActual,
            exportMode: mode,
            isEn,
            peakPowerKw: solarSyncState.getPeakPowerKw(),
            performanceRatio: solarSyncState.getPerformanceRatio(),
            tonc: solarSyncState.getTonc(),
          });
        },
      });
    });

    // 7. Generate PDF Report (Figures 5.2.70, 5.2.71, 5.2.72, 5.2.74, 5.2.75)
    const btnExportReport = container.querySelector<HTMLButtonElement>('#btn-seasonal-export-report');
    btnExportReport?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'pdf',
        activeComponent: compActual,
        isEn,
        onConfirm: (mode) => {
          showPdfGenerationNoticeModal(isEn, () => {
            generateOrientSolPDFReport(res, isEn, 'seasonal', {
              peakPowerKw: solarSyncState.getPeakPowerKw(),
              performanceRatio: solarSyncState.getPerformanceRatio(),
              tonc: solarSyncState.getTonc(),
              componentsMode: mode,
              activeComponent: compActual,
            });
          });
        },
      });
    });
  }

  renderInternal();
  return container;
}
