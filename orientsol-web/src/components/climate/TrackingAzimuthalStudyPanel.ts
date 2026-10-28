import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { renderEnergyCalculationPanel } from '@/components/energy/EnergyCalculationPanel';
import { renderTrackingAzimuthalGraphsWindow } from '@/components/charts/TrackingAzimuthalGraphsWindow';
import {
  showPdfGenerationNoticeModal,
  generateOrientSolPDFReport,
  showExportComponentChoiceModal,
} from '@/components/export/pdfReportGenerator';
import { exportOrientSolMasterExcel } from '@/components/export/masterExportService';
import { solarSyncState } from '@/services/bridge/solarSyncState';
import { getNoonAzimuthDeg } from '@/services/solarGeometryAngles';
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

let stateAzimComponent: TrackingRadiationComponent = 'global';
let stateAzimShowEnergy: boolean = false;
let stateAzimShowGraphs: boolean = false;

/**
 * Renders OrientSol 4.0 - Seguimiento a un eje azimutal (Tabla_EjeAzimutal.m)
 */
export function renderTrackingAzimuthalStudyPanel(props: TrackingStudyProps): HTMLElement {
  const { simulationResult: res, locationName, latitude, onBack, onExit } = props;
  const container = document.createElement('div');
  container.className = 'opt-tracking-study-card';
  container.id = 'tracking-azimuthal-study-window';

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const months = isEn ? MONTH_NAMES_EN : MONTH_NAMES_ES;

    const compActual = stateAzimComponent === 'all' ? 'global' : stateAzimComponent;
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

    const azimComps = res.tracking.azimuthalAxis.components;
    const radAzim = azimComps
      ? (azimComps[compActual as keyof typeof azimComps] || res.tracking.azimuthalAxis.monthlyDailyKwh)
      : res.tracking.azimuthalAxis.monthlyDailyKwh;

    const radAnnualOpt = res.optimalAnnual.monthlyDailyKwh;
    const radSeasonalOpt = res.seasonal.monthlyDailyKwh;
    const radPolar = res.tracking.polarAxis.monthlyDailyKwh;
    const radHorizTrack = res.tracking.horizontalAxis.monthlyDailyKwh;

    const calcGains = (target: number[]) =>
      radAzim.map((a, i) => (target[i] > 0 ? ((a - target[i]) / target[i]) * 100 : 0));

    const gainsOverHoriz = calcGains(res.horizontal.gdm0);
    const gainsOverAnnual = calcGains(radAnnualOpt);
    const gainsOverSeasonal = calcGains(radSeasonalOpt);
    const gainsOverPolar = calcGains(radPolar);
    const gainsOverHorizTrack = calcGains(radHorizTrack);

    const meanHoriz = radHoriz.reduce((a, b) => a + b, 0) / 12;
    const meanAzim = radAzim.reduce((a, b) => a + b, 0) / 12;
    const meanGainHoriz = ((meanAzim - (res.horizontal.gdm0.reduce((a, b) => a + b, 0) / 12)) / (res.horizontal.gdm0.reduce((a, b) => a + b, 0) / 12)) * 100;
    const meanGainAnnual = ((meanAzim - res.optimalAnnual.annualMeanDailyKwh) / res.optimalAnnual.annualMeanDailyKwh) * 100;
    const meanGainSeasonal = ((meanAzim - res.seasonal.annualMeanDailyKwh) / res.seasonal.annualMeanDailyKwh) * 100;
    const meanGainPolar = ((meanAzim - res.tracking.polarAxis.annualMeanDailyKwh) / res.tracking.polarAxis.annualMeanDailyKwh) * 100;
    const meanGainHorizTrack = ((meanAzim - res.tracking.horizontalAxis.annualMeanDailyKwh) / res.tracking.horizontalAxis.annualMeanDailyKwh) * 100;

    // SVG Diagram of Azimuthal Tracking (Vertical Axis rotation)
    const azimDiagramSvg = `
      <svg viewBox="0 0 220 180" class="tracking-panel-illustration" style="width: 100%; max-width: 200px; height: auto;">
        <!-- Base pedestal -->
        <rect x="85" y="145" width="50" height="15" fill="#334155" stroke="#0f172a" stroke-width="2" rx="3" />
        <rect x="100" y="75" width="20" height="70" fill="#64748b" stroke="#1e293b" stroke-width="2" />
        <!-- Rotating Azimuth turntable ring -->
        <ellipse cx="110" cy="115" rx="36" ry="12" fill="none" stroke="#f97316" stroke-width="3" stroke-dasharray="6,4" />
        <!-- Fixed-tilt frame atop vertical column -->
        <polygon points="40,65 180,65 160,25 20,25" fill="#38bdf8" fill-opacity="0.85" stroke="#0284c7" stroke-width="2" />
        <!-- Panel Grid Lines -->
        <line x1="68" y1="65" x2="48" y2="25" stroke="#0369a1" stroke-width="1.2" />
        <line x1="96" y1="65" x2="76" y2="25" stroke="#0369a1" stroke-width="1.2" />
        <line x1="124" y1="65" x2="104" y2="25" stroke="#0369a1" stroke-width="1.2" />
        <line x1="152" y1="65" x2="132" y2="25" stroke="#0369a1" stroke-width="1.2" />
        <line x1="30" y1="45" x2="170" y2="45" stroke="#0369a1" stroke-width="1.2" />
        <!-- Azimuth Rotation Arrow around base -->
        <path d="M 80,125 A 36,12 0 1,0 140,125" fill="none" stroke="#ea580c" stroke-width="3" />
        <polygon points="144,123 136,117 138,129" fill="#ea580c" />
      </svg>
    `;

    container.innerHTML = `
      <div class="opt-tracking-window-frame">
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
                <span style="color: #38bdf8; font-weight: 600;">${isEn ? 'Single-axis azimuthal tracking' : 'Seguimiento a un eje azimutal'}</span>
              </span>
            </div>
          </div>
          <div class="opt-tracking-header-right">
            <div class="opt-matlab-brand-title">
              ORIENT<span style="color: #f59e0b;">SOL</span> <strong>4.0</strong>
            </div>
          </div>
        </div>

        <div class="opt-tracking-toolbar">
          <div class="tracking-comp-select-group">
            <label for="tracking-azim-comp-select" class="tracking-comp-label">
              ${isEn ? 'Select a component' : 'Seleccione una componente'}
            </label>
            <select id="tracking-azim-comp-select" class="form-select tracking-comp-dropdown">
              <option value="global" ${stateAzimComponent === 'global' ? 'selected' : ''}>${isEn ? 'Global' : 'Global'}</option>
              <option value="beam" ${stateAzimComponent === 'beam' ? 'selected' : ''}>${isEn ? 'Direct' : 'Directa'}</option>
              <option value="diffuse" ${stateAzimComponent === 'diffuse' ? 'selected' : ''}>${isEn ? 'Diffuse' : 'Difusa'}</option>
              <option value="albedo" ${stateAzimComponent === 'albedo' ? 'selected' : ''}>${isEn ? 'Albedo' : 'Albedo'}</option>
            </select>
          </div>

          <div class="tracking-toolbar-actions">
            <button id="btn-azim-view-charts" class="btn-study-view-charts ${stateAzimShowGraphs ? 'active' : ''}" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>${stateAzimShowGraphs ? (isEn ? 'Hide charts' : 'Ocultar gráficas') : (isEn ? 'View charts' : 'Ver gráficas')}</span>
            </button>
          </div>
        </div>

        <div class="opt-tracking-table-caption">
          ${isEn ? `Mean monthly daily ${compLabel} radiation (kWh/m²/day)` : `Radiación ${compLabel} media mensual (kWh/m²/día)`}
        </div>

        <div class="opt-tracking-content-grid">
          <div class="opt-tracking-table-wrap">
            <table class="opt-tracking-table">
              <thead>
                <tr class="tracking-top-th-row">
                  <th rowspan="2" class="th-track-month">${isEn ? 'Month' : 'Mes'}</th>
                  <th rowspan="2" class="th-track-angles" style="min-width: 140px;">
                    <div>${isEn ? 'Considered Angles' : 'Ángulos considerados'}</div>
                    <div style="font-size: 0.72rem; font-weight: 600; color: #a855f7;">Inc: ${formatNum(res.latitude, 1)}° | Ori: ${res.latitude >= 0 ? (res.latitude < 23.45 ? '0,0°/180,0°' : '0,0°') : (res.latitude > -23.45 ? '180,0°/0,0°' : '180,0°')}</div>
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
                  <th class="th-gain-sub">${isEn ? 'Horizontal<br/>1-axis' : '1 eje<br/>horizontal'}</th>
                </tr>
              </thead>
              <tbody>
                ${months.map((mName, i) => {
                  const g0 = radHoriz[i];
                  const pVal = radAzim[i];
                  const tVal = tempMean[i];
                  const gHor = gainsOverHoriz[i];
                  const gAnn = gainsOverAnnual[i];
                  const gSeas = gainsOverSeasonal[i];
                  const gPol = gainsOverPolar[i];
                  const gHz = gainsOverHorizTrack[i];
                  const noonAzim = getNoonAzimuthDeg(res.latitude, i);

                  return `
                    <tr>
                      <td class="td-track-month"><strong>${mName}</strong></td>
                      <td class="td-num td-angles" style="font-size: 0.80rem; font-weight: 600; white-space: nowrap; text-align: center;">
                        <span style="color: #c084fc;">Inc: ${formatNum(res.latitude, 1)}°</span> <span style="opacity: 0.4;">|</span> <span style="color: var(--text-muted);">Ori: ${formatNum(noonAzim, 1)}°</span>
                      </td>
                      <td class="td-num">${formatNum(g0, 2)}</td>
                      <td class="td-num td-track-val"><strong>${formatNum(pVal, 2)}</strong></td>
                      <td class="td-num td-track-temp">${tVal !== undefined ? formatNum(tVal, 1) : '-'}</td>
                      <td class="td-num">${formatNum(gHor, 2)}</td>
                      <td class="td-num">${formatNum(gAnn, 2)}</td>
                      <td class="td-num">${formatNum(gSeas, 2)}</td>
                      <td class="td-num">${formatNum(gPol, 2)}</td>
                      <td class="td-num">${formatNum(gHz, 2)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot>
                <tr class="tracking-media-row">
                  <td class="td-track-month"><strong>${isEn ? 'MEAN' : 'MEDIA'}</strong></td>
                  <td class="td-num td-angles" style="font-size: 0.80rem; font-weight: 700; white-space: nowrap; text-align: center; color: #c084fc;">
                    Inc: ${formatNum(res.latitude, 1)}° | Ori: ${formatNum(months.reduce((acc, _, idx) => acc + getNoonAzimuthDeg(res.latitude, idx), 0) / 12, 1)}°
                  </td>
                  <td class="td-num"><strong>${formatNum(meanHoriz, 2)}</strong></td>
                  <td class="td-num td-track-val"><strong>${formatNum(meanAzim, 2)}</strong></td>
                  <td class="td-num td-track-temp"><strong>${tempAnnualMean !== undefined ? formatNum(tempAnnualMean, 1) : '-'}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainHoriz, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainAnnual, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainSeasonal, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainPolar, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainHorizTrack, 2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="opt-tracking-diagram-sidebar">
            ${azimDiagramSvg}
            <div class="tracking-diagram-caption">
              ${isEn ? 'Single-axis azimuthal tracking with continuous vertical axis rotation' : 'Seguimiento a un eje azimutal con giro continuo alrededor del eje vertical'}
            </div>
          </div>
        </div>

        <div class="opt-study-footer-actions">
          <div class="footer-btn-left-group">
            <button id="btn-azim-volver" class="btn-study-foot btn-volver" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>${isEn ? 'Back' : 'Volver'}</span>
            </button>
            <button id="btn-azim-salir" class="btn-study-foot btn-salir" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>${isEn ? 'Exit' : 'Salir'}</span>
            </button>
          </div>

          <div class="footer-btn-right-group">
            <button id="btn-azim-goto-energy" class="btn-study-foot btn-energy ${stateAzimShowEnergy ? 'active' : ''}" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>${isEn ? 'Energy calculation' : 'Cálculo de energía'}</span>
            </button>

            <button id="btn-azim-export-excel" class="btn-study-foot btn-excel" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>${isEn ? 'Export to Excel' : 'Exportar a Excel'}</span>
            </button>

            <button id="btn-azim-export-report" class="btn-study-foot btn-report" type="button">
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

        <div id="opt-azim-graphs-mount-point"></div>
        <div id="opt-azim-energy-mount-point"></div>
      </div>
    `;

    const graphsMountPoint = container.querySelector<HTMLDivElement>('#opt-azim-graphs-mount-point');
    if (graphsMountPoint && stateAzimShowGraphs) {
      graphsMountPoint.innerHTML = '';
      const graphsWindow = renderTrackingAzimuthalGraphsWindow({
        simulationResult: res,
        locationName,
        latitude,
        initialComponent: stateAzimComponent as any,
        onBack: () => {
          stateAzimShowGraphs = false;
          renderInternal();
        },
        onExit: () => {
          stateAzimShowGraphs = false;
          renderInternal();
          if (onExit) onExit();
        },
      });
      graphsMountPoint.appendChild(graphsWindow);
    }

    const energyMountPoint = container.querySelector<HTMLDivElement>('#opt-azim-energy-mount-point');
    if (energyMountPoint && stateAzimShowEnergy) {
      energyMountPoint.innerHTML = '';
      const energyWindow = renderEnergyCalculationPanel({
        simulationResult: res,
        locationName,
        latitude,
        studyType: 'azimuthal',
        initialPeakKw: props.peakPowerKw ?? 5.0,
        onClose: () => {
          stateAzimShowEnergy = false;
          renderInternal();
        },
      });
      energyMountPoint.appendChild(energyWindow);
    }

    container.querySelector<HTMLSelectElement>('#tracking-azim-comp-select')?.addEventListener('change', (e) => {
      stateAzimComponent = (e.target as HTMLSelectElement).value as TrackingRadiationComponent;
      renderInternal();
    });

    container.querySelector<HTMLButtonElement>('#btn-azim-goto-energy')?.addEventListener('click', () => {
      stateAzimShowEnergy = !stateAzimShowEnergy;
      renderInternal();
      if (stateAzimShowEnergy) {
        setTimeout(() => {
          container.querySelector('#opt-azim-energy-mount-point')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });

    container.querySelector<HTMLButtonElement>('#btn-azim-view-charts')?.addEventListener('click', () => {
      stateAzimShowGraphs = !stateAzimShowGraphs;
      renderInternal();
      if (stateAzimShowGraphs) {
        setTimeout(() => {
          container.querySelector('#opt-azim-graphs-mount-point')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });

    container.querySelector<HTMLButtonElement>('#btn-azim-volver')?.addEventListener('click', () => {
      if (onBack) onBack();
    });

    container.querySelector<HTMLButtonElement>('#btn-azim-salir')?.addEventListener('click', () => {
      if (onExit) onExit();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const activeCompAzim = stateAzimComponent === 'all' ? 'global' : stateAzimComponent;

    container.querySelector<HTMLButtonElement>('#btn-azim-export-excel')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'excel',
        activeComponent: activeCompAzim,
        isEn,
        onConfirm: (mode) => {
          exportOrientSolMasterExcel(res, {
            activeStudyOp: 'azimuthal',
            activeComponent: activeCompAzim,
            exportMode: mode,
            isEn,
            peakPowerKw: solarSyncState.getPeakPowerKw(),
            performanceRatio: solarSyncState.getPerformanceRatio(),
            tonc: solarSyncState.getTonc(),
          });
        },
      });
    });

    container.querySelector<HTMLButtonElement>('#btn-azim-export-report')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'pdf',
        activeComponent: activeCompAzim,
        isEn,
        onConfirm: (mode) => {
          showPdfGenerationNoticeModal(isEn, () => {
            generateOrientSolPDFReport(res, isEn, 'azimuthal', {
              peakPowerKw: solarSyncState.getPeakPowerKw(),
              performanceRatio: solarSyncState.getPerformanceRatio(),
              tonc: solarSyncState.getTonc(),
              componentsMode: mode,
              activeComponent: activeCompAzim,
            });
          });
        },
      });
    });
  }

  renderInternal();
  return container;
}
