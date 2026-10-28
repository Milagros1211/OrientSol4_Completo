import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { renderEnergyCalculationPanel } from '@/components/energy/EnergyCalculationPanel';
import { renderTrackingHorizontalGraphsWindow } from '@/components/charts/TrackingHorizontalGraphsWindow';
import {
  showPdfGenerationNoticeModal,
  generateOrientSolPDFReport,
  showExportComponentChoiceModal,
} from '@/components/export/pdfReportGenerator';
import { exportOrientSolMasterExcel } from '@/components/export/masterExportService';
import { solarSyncState } from '@/services/bridge/solarSyncState';
import { getHorizontalTrackerDailyMeanTiltDeg } from '@/services/solarGeometryAngles';
import { formatNum } from '@/utils/formatters';

export type TrackingRadiationComponent = 'global' | 'beam' | 'diffuse' | 'albedo' | 'all';

interface TrackingStudyProps {
  simulationResult: SolarBridgeSimulationResult;
  locationName: string;
  latitude: number;
  peakPowerKw?: number;
  onBack?: () => void;
  onExit?: () => void;
}

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

let stateHorizComponent: TrackingRadiationComponent = 'global';
let stateHorizShowEnergy: boolean = false;
let stateHorizShowGraphs: boolean = false;

/**
 * Renders OrientSol 4.0 - Seguimiento a un eje horizontal (Tabla_EjeHorizontal.m)
 */
export function renderTrackingHorizontalStudyPanel(props: TrackingStudyProps): HTMLElement {
  const { simulationResult: res, locationName, latitude, onBack, onExit } = props;
  const container = document.createElement('div');
  container.className = 'opt-tracking-study-card';
  container.id = 'tracking-horizontal-study-window';

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const months = isEn ? MONTH_NAMES_EN : MONTH_NAMES_ES;

    const compActual = stateHorizComponent === 'all' ? 'global' : stateHorizComponent;
    const compSym = compActual === 'global' ? 'Gdm' : compActual === 'beam' ? 'Bdm' : compActual === 'diffuse' ? 'Ddm' : 'Rdm';
    const compLabel = compActual === 'global' ? (isEn ? 'Global' : 'global') : compActual === 'beam' ? (isEn ? 'Direct' : 'directa') : compActual === 'diffuse' ? (isEn ? 'Diffuse' : 'difusa') : (isEn ? 'Albedo' : 'albedo');

    const tempMean = res.temperatures.ambient.monthlyMeanC;
    const tempAnnualMean = res.temperatures.ambient.annualMeanC;

    const radHoriz = compActual === 'global'
      ? res.horizontal.gdm0
      : compActual === 'beam'
      ? res.horizontal.bdm0
      : compActual === 'diffuse'
      ? res.horizontal.ddm0
      : new Array(12).fill(0.0);

    const horizComps = res.tracking.horizontalAxis.components;
    const radHorizTrack = horizComps
      ? (horizComps[compActual as keyof typeof horizComps] || res.tracking.horizontalAxis.monthlyDailyKwh)
      : res.tracking.horizontalAxis.monthlyDailyKwh;

    const radAnnualOpt = res.optimalAnnual.monthlyDailyKwh;
    const radSeasonalOpt = res.seasonal.monthlyDailyKwh;
    const radPolar = res.tracking.polarAxis.monthlyDailyKwh;
    const radAzim = res.tracking.azimuthalAxis.monthlyDailyKwh;

    const calcGains = (target: number[]) =>
      radHorizTrack.map((h, i) => (target[i] > 0 ? ((h - target[i]) / target[i]) * 100 : 0));

    const gainsOverHoriz = calcGains(res.horizontal.gdm0);
    const gainsOverAnnual = calcGains(radAnnualOpt);
    const gainsOverSeasonal = calcGains(radSeasonalOpt);
    const gainsOverPolar = calcGains(radPolar);
    const gainsOverAzim = calcGains(radAzim);

    const meanHoriz = radHoriz.reduce((a, b) => a + b, 0) / 12;
    const meanHorizTrack = radHorizTrack.reduce((a, b) => a + b, 0) / 12;
    const meanGainHoriz = ((meanHorizTrack - (res.horizontal.gdm0.reduce((a, b) => a + b, 0) / 12)) / (res.horizontal.gdm0.reduce((a, b) => a + b, 0) / 12)) * 100;
    const meanGainAnnual = ((meanHorizTrack - res.optimalAnnual.annualMeanDailyKwh) / res.optimalAnnual.annualMeanDailyKwh) * 100;
    const meanGainSeasonal = ((meanHorizTrack - res.seasonal.annualMeanDailyKwh) / res.seasonal.annualMeanDailyKwh) * 100;
    const meanGainPolar = ((meanHorizTrack - res.tracking.polarAxis.annualMeanDailyKwh) / res.tracking.polarAxis.annualMeanDailyKwh) * 100;
    const meanGainAzim = ((meanHorizTrack - res.tracking.azimuthalAxis.annualMeanDailyKwh) / res.tracking.azimuthalAxis.annualMeanDailyKwh) * 100;

    // SVG Diagram of Horizontal Axis Tracking (East-West rotating roll tracker)
    const horizDiagramSvg = `
      <svg viewBox="0 0 220 180" class="tracking-panel-illustration" style="width: 100%; max-width: 200px; height: auto;">
        <!-- Two support pillars -->
        <rect x="30" y="110" width="16" height="50" fill="#475569" stroke="#0f172a" stroke-width="2" rx="2" />
        <rect x="174" y="110" width="16" height="50" fill="#475569" stroke="#0f172a" stroke-width="2" rx="2" />
        <rect x="20" y="155" width="36" height="10" fill="#334155" rx="2" />
        <rect x="164" y="155" width="36" height="10" fill="#334155" rx="2" />
        <!-- Horizontal Torque Tube Axis -->
        <line x1="38" y1="115" x2="182" y2="115" stroke="#f97316" stroke-width="6" stroke-linecap="round" />
        <!-- Rotating Bearings -->
        <circle cx="38" cy="115" r="7" fill="#fbbf24" stroke="#d97706" stroke-width="2" />
        <circle cx="182" cy="115" r="7" fill="#fbbf24" stroke="#d97706" stroke-width="2" />
        <!-- Tilted PV Module Rows along horizontal torque tube -->
        <polygon points="50,90 170,90 160,135 40,135" fill="#0284c7" fill-opacity="0.85" stroke="#38bdf8" stroke-width="2" />
        <!-- Grid cells on PV collector -->
        <line x1="90" y1="90" x2="80" y2="135" stroke="#ffffff" stroke-width="1" stroke-opacity="0.6" />
        <line x1="130" y1="90" x2="120" y2="135" stroke="#ffffff" stroke-width="1" stroke-opacity="0.6" />
        <line x1="45" y1="112" x2="165" y2="112" stroke="#ffffff" stroke-width="1" stroke-opacity="0.6" />
        <!-- Rotation curvature arrow (East-West tracking roll) -->
        <path d="M 110,65 A 35,35 0 0,1 138,82" fill="none" stroke="#ea580c" stroke-width="3.5" stroke-linecap="round" />
        <polygon points="142,80 134,74 136,86" fill="#ea580c" />
      </svg>
    `;

    container.innerHTML = `
      <div class="opt-tracking-window-frame">
        <!-- 1. Header Bar matching Image 1 Guide -->
        <div class="opt-tracking-header-bar">
          <div class="opt-tracking-header-left">
            <div class="opt-tracking-meta-row">
              <span class="meta-label"><strong>${isEn ? 'City:' : 'Ciudad:'}</strong> ${locationName}</span>
              <span class="meta-label" style="margin-left: 2rem;">
                <strong>${isEn ? 'Latitude (°):' : 'Latitud (°):'}</strong>
                <span style="color: #38bdf8; font-weight: 700;">${formatNum(latitude, 2)}</span>
              </span>
            </div>
            <div class="opt-tracking-study-title-row">
              <span class="meta-label">
                <strong>${isEn ? 'Study:' : 'Estudio:'}</strong>
                <span style="color: #38bdf8; font-weight: 600;">${isEn ? 'Horizontal single-axis tracking' : 'Seguimiento a un eje horizontal'}</span>
              </span>
            </div>
          </div>
          <div class="opt-tracking-header-right">
            <div class="opt-matlab-brand-title">
              ORIENT<span style="color: #f59e0b;">SOL</span> <strong>4.0</strong>
            </div>
          </div>
        </div>

        <!-- 2. Controls Toolbar -->
        <div class="opt-tracking-toolbar">
          <div class="tracking-comp-select-group">
            <label for="select-horiz-comp" class="tracking-comp-label">
              ${isEn ? 'Select a component' : 'Seleccione una componente'}
            </label>
            <select id="select-horiz-comp" class="form-select tracking-comp-dropdown">
              <option value="global" ${stateHorizComponent === 'global' ? 'selected' : ''}>Global</option>
              <option value="beam" ${stateHorizComponent === 'beam' ? 'selected' : ''}>${isEn ? 'Direct' : 'Directa'}</option>
              <option value="diffuse" ${stateHorizComponent === 'diffuse' ? 'selected' : ''}>${isEn ? 'Diffuse' : 'Difusa'}</option>
              <option value="albedo" ${stateHorizComponent === 'albedo' ? 'selected' : ''}>${isEn ? 'Albedo' : 'Albedo'}</option>
            </select>
          </div>

          <div class="tracking-toolbar-actions">
            <button type="button" id="btn-horiz-graphs" class="btn-study-view-charts ${stateHorizShowGraphs ? 'active' : ''}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>${stateHorizShowGraphs ? (isEn ? 'Hide charts' : 'Ocultar gráficas') : (isEn ? 'View charts' : 'Ver gráficas')}</span>
            </button>
          </div>
        </div>

        <!-- 3. Table Caption -->
        <div class="opt-tracking-table-caption">
          ${isEn ? `Mean monthly daily ${compLabel} radiation (kWh/m²/day)` : `Radiación ${compLabel} media mensual (kWh/m²/día)`}
        </div>

        <!-- 4. Main Matrix Table + Diagram Layout (Figura 6.3.20) -->
        <div class="opt-tracking-content-grid">
          <div class="opt-tracking-table-wrap">
            <table class="opt-tracking-table">
              <thead>
                <tr class="tracking-top-th-row">
                  <th rowspan="2" class="th-track-month">${isEn ? 'Month' : 'Mes'}</th>
                  <th rowspan="2" class="th-track-angles" style="min-width: 140px;">
                    <div>${isEn ? 'Considered Angles' : 'Ángulos considerados'}</div>
                    <div style="font-size: 0.72rem; font-weight: 600; color: #f59e0b;">Inc: 0.0° | Ori: 90.0°</div>
                  </th>
                  <th rowspan="2" class="th-track-h0">${compSym} (0°)</th>
                  <th rowspan="2" class="th-track-opt">${compSym}</th>
                  <th rowspan="2" class="th-track-temp">${isEn ? 'Mean Temp' : 'Tª media'}</th>
                  <th colspan="5" class="th-track-gains-super">${isEn ? 'Gains (%)' : 'Ganancias (%)'}</th>
                </tr>
                <tr class="tracking-sub-th-row">
                  <th class="th-gain-sub">${isEn ? 'Horiz.<br/>plane' : 'Plano<br/>horiz.'}</th>
                  <th class="th-gain-sub">${isEn ? 'Annual opt.<br/>tilt' : 'Inclinación<br/>ópt. anual'}</th>
                  <th class="th-gain-sub">${isEn ? 'Seasonal opt.<br/>tilt' : 'Inclin. ópt.<br/>estacional'}</th>
                  <th class="th-gain-sub">${isEn ? 'Polar<br/>1-axis' : '1 eje<br/>polar'}</th>
                  <th class="th-gain-sub">${isEn ? 'Azimuthal<br/>1-axis' : '1 eje<br/>azimutal'}</th>
                </tr>
              </thead>
              <tbody>
                ${months.map((mName, i) => `
                  <tr>
                    <td class="td-track-month"><strong>${mName}</strong></td>
                    <td class="td-num td-angles" style="font-size: 0.80rem; font-weight: 600; white-space: nowrap; text-align: center;">
                      <span style="color: #fbbf24;">Inc: ${formatNum(getHorizontalTrackerDailyMeanTiltDeg(res.latitude, i), 1)}°</span> <span style="opacity: 0.4;">|</span> <span style="color: var(--text-muted);">Ori: 90,0°</span>
                    </td>
                    <td class="td-num">${formatNum(radHoriz[i], 2)}</td>
                    <td class="td-num td-track-val"><strong>${formatNum(radHorizTrack[i], 2)}</strong></td>
                    <td class="td-num">${formatNum(tempMean[i], 1)}</td>
                    <td class="td-num">${formatNum(gainsOverHoriz[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverAnnual[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverSeasonal[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverPolar[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverAzim[i], 2)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr class="tracking-media-row">
                  <td class="td-track-month"><strong>${isEn ? 'MEAN' : 'MEDIA'}</strong></td>
                  <td class="td-num td-angles" style="font-size: 0.80rem; font-weight: 700; white-space: nowrap; text-align: center; color: #fbbf24;">
                    Inc: ${formatNum(months.reduce((acc, _, idx) => acc + getHorizontalTrackerDailyMeanTiltDeg(res.latitude, idx), 0) / 12, 1)}° | Ori: 90,0°
                  </td>
                  <td class="td-num"><strong>${formatNum(meanHoriz, 2)}</strong></td>
                  <td class="td-num td-track-val"><strong>${formatNum(meanHorizTrack, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(tempAnnualMean, 1)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainHoriz, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainAnnual, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainSeasonal, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainPolar, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainAzim, 2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Illustration Sidebar matching Image 1 -->
          <div class="opt-tracking-diagram-sidebar">
            ${horizDiagramSvg}
            <div class="tracking-diagram-caption">
              ${isEn ? 'Single-axis horizontal tracking with North-South axis and East-West roll rotation' : 'Seguimiento a un eje horizontal con rotación alrededor del eje orientado norte-sur'}
            </div>
          </div>
        </div>

      <!-- Action Buttons Bar -->
      <div class="opt-study-footer-actions">
        <div class="footer-btn-left-group">
          <button type="button" id="btn-horiz-back" class="btn-study-foot btn-volver">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span>${isEn ? 'Back' : 'Volver'}</span>
          </button>
          <button type="button" id="btn-horiz-exit" class="btn-study-foot btn-salir">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>${isEn ? 'Exit' : 'Salir'}</span>
          </button>
        </div>
        <div class="footer-btn-right-group">
          <button type="button" id="btn-horiz-energy" class="btn-study-foot btn-energy ${stateHorizShowEnergy ? 'active' : ''}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>${stateHorizShowEnergy ? (isEn ? 'Hide Energy Calculation' : 'Ocultar cálculo de energía') : (isEn ? 'Energy Calculation' : 'Cálculo de energía')}</span>
          </button>
          <button type="button" id="btn-horiz-excel" class="btn-study-foot btn-excel">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>${isEn ? 'Export to Excel' : 'Exportar a Excel'}</span>
          </button>
          <button type="button" id="btn-horiz-pdf" class="btn-study-foot btn-report">
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

      <!-- Optional Embedded Views -->
      <div id="horiz-extra-content-area" style="margin-top: 1.5rem;"></div>
    `;

    // Hook listeners
    const selComp = container.querySelector('#select-horiz-comp') as HTMLSelectElement;
    selComp?.addEventListener('change', () => {
      stateHorizComponent = selComp.value as TrackingRadiationComponent;
      renderInternal();
    });

    const extraArea = container.querySelector('#horiz-extra-content-area') as HTMLElement;

    const btnEnergy = container.querySelector('#btn-horiz-energy') as HTMLButtonElement;
    btnEnergy?.addEventListener('click', () => {
      stateHorizShowEnergy = !stateHorizShowEnergy;
      stateHorizShowGraphs = false;
      renderInternal();
    });

    const btnGraphs = container.querySelector('#btn-horiz-graphs') as HTMLButtonElement;
    btnGraphs?.addEventListener('click', () => {
      stateHorizShowGraphs = !stateHorizShowGraphs;
      stateHorizShowEnergy = false;
      renderInternal();
    });

    if (stateHorizShowEnergy && extraArea) {
      extraArea.innerHTML = '';
      const energyPanel = renderEnergyCalculationPanel({
        simulationResult: res,
        locationName,
        latitude,
        studyType: 'horizontal',
        onClose: () => {
          stateHorizShowEnergy = false;
          renderInternal();
        }
      });
      extraArea.appendChild(energyPanel);
    } else if (stateHorizShowGraphs && extraArea) {
      extraArea.innerHTML = '';
      const graphsWindow = renderTrackingHorizontalGraphsWindow({
        simulationResult: res,
        locationName,
        latitude,
        onBack: () => {
          stateHorizShowGraphs = false;
          renderInternal();
        },
        onExit: () => {
          stateHorizShowGraphs = false;
          renderInternal();
        }
      });
      extraArea.appendChild(graphsWindow);
    }

    container.querySelector('#btn-horiz-back')?.addEventListener('click', () => {
      if (onBack) onBack();
    });

    container.querySelector('#btn-horiz-exit')?.addEventListener('click', () => {
      if (onExit) onExit();
    });

    const activeCompHoriz = stateHorizComponent === 'all' ? 'global' : stateHorizComponent;

    container.querySelector('#btn-horiz-excel')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'excel',
        activeComponent: activeCompHoriz,
        isEn,
        onConfirm: (mode) => {
          exportOrientSolMasterExcel(res, {
            activeStudyOp: 'horizontal',
            activeComponent: activeCompHoriz,
            exportMode: mode,
            isEn,
            peakPowerKw: solarSyncState.getPeakPowerKw(),
            performanceRatio: solarSyncState.getPerformanceRatio(),
            tonc: solarSyncState.getTonc(),
          });
        },
      });
    });

    container.querySelector('#btn-horiz-pdf')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'pdf',
        activeComponent: activeCompHoriz,
        isEn,
        onConfirm: (mode) => {
          showPdfGenerationNoticeModal(isEn, () => {
            generateOrientSolPDFReport(res, isEn, 'horizontal', {
              peakPowerKw: solarSyncState.getPeakPowerKw(),
              performanceRatio: solarSyncState.getPerformanceRatio(),
              tonc: solarSyncState.getTonc(),
              componentsMode: mode,
              activeComponent: activeCompHoriz,
            });
          });
        },
      });
    });
  }

  renderInternal();
  return container;
}
