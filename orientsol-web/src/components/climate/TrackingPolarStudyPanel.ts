import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { renderEnergyCalculationPanel } from '@/components/energy/EnergyCalculationPanel';
import { renderTrackingPolarGraphsWindow } from '@/components/charts/TrackingPolarGraphsWindow';
import {
  showPdfGenerationNoticeModal,
  generateOrientSolPDFReport,
  showExportComponentChoiceModal,
} from '@/components/export/pdfReportGenerator';
import { exportOrientSolMasterExcel } from '@/components/export/masterExportService';
import { solarSyncState } from '@/services/bridge/solarSyncState';
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

let statePolarComponent: TrackingRadiationComponent = 'global';
let statePolarShowEnergy: boolean = false;
let statePolarShowGraphs: boolean = false;

/**
 * Renders OrientSol 4.0 - Seguimiento a un eje polar (Figura 6.3.18)
 */
export function renderTrackingPolarStudyPanel(props: TrackingStudyProps): HTMLElement {
  const { simulationResult: res, locationName, latitude, onBack, onExit } = props;
  const container = document.createElement('div');
  container.className = 'opt-tracking-study-card';
  container.id = 'tracking-polar-study-window';

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const months = isEn ? MONTH_NAMES_EN : MONTH_NAMES_ES;

    const compActual = statePolarComponent === 'all' ? 'global' : statePolarComponent;
    const compSym = compActual === 'global' ? 'Gdm' : compActual === 'beam' ? 'Bdm' : compActual === 'diffuse' ? 'Ddm' : 'Rdm';
    const compLabel = compActual === 'global' ? (isEn ? 'Global' : 'global') : compActual === 'beam' ? (isEn ? 'Direct' : 'directa') : compActual === 'diffuse' ? (isEn ? 'Diffuse' : 'difusa') : (isEn ? 'Albedo' : 'albedo');

    // Temperatures
    const tempMean = res.temperatures.ambient.monthlyMeanC;
    const tempAnnualMean = res.temperatures.ambient.annualMeanC;

    // Baseline vectors
    const radHoriz = compActual === 'global'
      ? res.horizontal.gdm0
      : compActual === 'beam'
      ? res.horizontal.bdm0
      : compActual === 'diffuse'
      ? res.horizontal.ddm0
      : new Array(12).fill(0.0);

    // Polar track radiation
    const polarComps = res.tracking.polarAxis.components;
    const radPolar = polarComps
      ? (polarComps[compActual as keyof typeof polarComps] || res.tracking.polarAxis.monthlyDailyKwh)
      : res.tracking.polarAxis.monthlyDailyKwh;

    // Gain comparison targets
    const radAnnualOpt = res.optimalAnnual.monthlyDailyKwh;
    const radSeasonalOpt = res.seasonal.monthlyDailyKwh;
    const radAzim = res.tracking.azimuthalAxis.monthlyDailyKwh;
    const radHorizTrack = res.tracking.horizontalAxis.monthlyDailyKwh;

    // Monthly gains (%) of Polar Tracking over each target
    const calcGains = (target: number[]) =>
      radPolar.map((p, i) => (target[i] > 0 ? ((p - target[i]) / target[i]) * 100 : 0));

    const gainsOverHoriz = calcGains(res.horizontal.gdm0);
    const gainsOverAnnual = calcGains(radAnnualOpt);
    const gainsOverSeasonal = calcGains(radSeasonalOpt);
    const gainsOverAzim = calcGains(radAzim);
    const gainsOverHorizTrack = calcGains(radHorizTrack);

    // Annual means
    const meanHoriz = radHoriz.reduce((a, b) => a + b, 0) / 12;
    const meanPolar = radPolar.reduce((a, b) => a + b, 0) / 12;
    const meanGainHoriz = ((meanPolar - (res.horizontal.gdm0.reduce((a, b) => a + b, 0) / 12)) / (res.horizontal.gdm0.reduce((a, b) => a + b, 0) / 12)) * 100;
    const meanGainAnnual = ((meanPolar - res.optimalAnnual.annualMeanDailyKwh) / res.optimalAnnual.annualMeanDailyKwh) * 100;
    const meanGainSeasonal = ((meanPolar - res.seasonal.annualMeanDailyKwh) / res.seasonal.annualMeanDailyKwh) * 100;
    const meanGainAzim = ((meanPolar - res.tracking.azimuthalAxis.annualMeanDailyKwh) / res.tracking.azimuthalAxis.annualMeanDailyKwh) * 100;
    const meanGainHorizTrack = ((meanPolar - res.tracking.horizontalAxis.annualMeanDailyKwh) / res.tracking.horizontalAxis.annualMeanDailyKwh) * 100;

    // SVG Diagram of 1-Axis Polar Tracking Panel (tilted axis at latitude)
    const polarDiagramSvg = `
      <svg viewBox="0 0 220 180" class="tracking-panel-illustration" style="width: 100%; max-width: 200px; height: auto;">
        <!-- Polar Axis Rod tilted at latitude angle -->
        <line x1="25" y1="155" x2="195" y2="25" stroke="#1e293b" stroke-width="9" stroke-linecap="round" />
        <line x1="25" y1="155" x2="195" y2="25" stroke="#64748b" stroke-width="6" stroke-linecap="round" />
        <!-- Polar Bearing Mounts -->
        <circle cx="45" cy="140" r="8" fill="#334155" stroke="#0f172a" stroke-width="2" />
        <circle cx="175" cy="40" r="8" fill="#334155" stroke="#0f172a" stroke-width="2" />
        <!-- Solar Collector Panel (Isometric Tilted Surface) -->
        <g transform="translate(110, 90) rotate(-37) translate(-110, -90)">
          <polygon points="50,70 170,70 150,110 30,110" fill="#38bdf8" fill-opacity="0.85" stroke="#0284c7" stroke-width="2" />
          <!-- PV Grid Cells -->
          <line x1="74" y1="70" x2="54" y2="110" stroke="#0369a1" stroke-width="1.2" />
          <line x1="98" y1="70" x2="78" y2="110" stroke="#0369a1" stroke-width="1.2" />
          <line x1="122" y1="70" x2="102" y2="110" stroke="#0369a1" stroke-width="1.2" />
          <line x1="146" y1="70" x2="126" y2="110" stroke="#0369a1" stroke-width="1.2" />
          <line x1="40" y1="90" x2="160" y2="90" stroke="#0369a1" stroke-width="1.2" />
        </g>
        <!-- Orange Rotation Arrow (indicating polar tracking) -->
        <path d="M 40,150 A 24,24 0 1,1 25,125" fill="none" stroke="#ea580c" stroke-width="3.5" stroke-linecap="round" />
        <polygon points="20,123 30,116 26,132" fill="#ea580c" />
      </svg>
    `;

    container.innerHTML = `
      <div class="opt-tracking-window-frame">
        <!-- 1. Header Bar matching Figura 6.3.18 -->
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
                <span style="color: #38bdf8; font-weight: 600;">${isEn ? 'Polar single-axis tracking' : 'Seguimiento a un eje polar'}</span>
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
            <label for="tracking-polar-comp-select" class="tracking-comp-label">
              ${isEn ? 'Select a component' : 'Seleccione una componente'}
            </label>
            <select id="tracking-polar-comp-select" class="form-select tracking-comp-dropdown">
              <option value="global" ${statePolarComponent === 'global' ? 'selected' : ''}>Global</option>
              <option value="beam" ${statePolarComponent === 'beam' ? 'selected' : ''}>${isEn ? 'Direct' : 'Directa'}</option>
              <option value="diffuse" ${statePolarComponent === 'diffuse' ? 'selected' : ''}>${isEn ? 'Diffuse' : 'Difusa'}</option>
              <option value="albedo" ${statePolarComponent === 'albedo' ? 'selected' : ''}>${isEn ? 'Albedo' : 'Albedo'}</option>
              <option value="all" ${statePolarComponent === 'all' ? 'selected' : ''}>${isEn ? 'All' : 'Todas'}</option>
            </select>
          </div>

          <div class="tracking-toolbar-actions">
            <button id="btn-polar-view-charts" class="btn-study-view-charts ${statePolarShowGraphs ? 'active' : ''}" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>${statePolarShowGraphs ? (isEn ? 'Hide charts' : 'Ocultar gráficas') : (isEn ? 'View charts' : 'Ver gráficas')}</span>
            </button>
          </div>
        </div>

        <!-- 3. Table Caption -->
        <div class="opt-tracking-table-caption">
          ${isEn ? `Mean monthly daily ${compLabel} radiation (kWh/m²/day)` : `Radiación ${compLabel} media mensual (kWh/m²/día)`}
        </div>

        <!-- 4. Main Matrix Table + Diagram Layout (Figura 6.3.18) -->
        <div class="opt-tracking-content-grid">
          <div class="opt-tracking-table-wrap">
            <table class="opt-tracking-table">
              <thead>
                <tr class="tracking-top-th-row">
                  <th rowspan="2" class="th-track-month">${isEn ? 'Month' : 'Mes'}</th>
                  <th rowspan="2" class="th-track-angles" style="min-width: 140px;">
                    <div>${isEn ? 'Considered Angles' : 'Ángulos considerados'}</div>
                    <div style="font-size: 0.72rem; font-weight: 600; color: #38bdf8;">Inc: ${formatNum(res.latitude, 1)}° | Ori: ${res.latitude >= 0 ? '0,0°' : '180,0°'}</div>
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
                  <th class="th-gain-sub">${isEn ? 'Azimuthal<br/>1-axis' : '1 eje<br/>azimutal'}</th>
                  <th class="th-gain-sub">${isEn ? 'Horizontal<br/>1-axis' : '1 eje<br/>horizontal'}</th>
                </tr>
              </thead>
              <tbody>
                ${months.map((mName, i) => `
                  <tr>
                    <td class="td-track-month"><strong>${mName}</strong></td>
                    <td class="td-num td-angles" style="font-size: 0.80rem; font-weight: 600; white-space: nowrap; text-align: center;">
                      <span style="color: #38bdf8;">Inc: ${formatNum(res.latitude, 1)}°</span> <span style="opacity: 0.4;">|</span> <span style="color: var(--text-muted);">Ori: ${res.latitude >= 0 ? '0,0°' : '180,0°'}</span>
                    </td>
                    <td class="td-num">${formatNum(radHoriz[i], 2)}</td>
                    <td class="td-num td-track-val"><strong>${formatNum(radPolar[i], 2)}</strong></td>
                    <td class="td-num td-track-temp">${formatNum(tempMean[i], 1)}</td>
                    <td class="td-num">${formatNum(gainsOverHoriz[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverAnnual[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverSeasonal[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverAzim[i], 2)}</td>
                    <td class="td-num">${formatNum(gainsOverHorizTrack[i], 2)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr class="tracking-media-row">
                  <td class="td-track-month"><strong>${isEn ? 'MEAN' : 'MEDIA'}</strong></td>
                  <td class="td-num td-angles" style="font-size: 0.80rem; font-weight: 700; white-space: nowrap; text-align: center; color: #38bdf8;">
                    Inc: ${formatNum(res.latitude, 1)}° | Ori: ${res.latitude >= 0 ? '0,0°' : '180,0°'}
                  </td>
                  <td class="td-num"><strong>${formatNum(meanHoriz, 2)}</strong></td>
                  <td class="td-num td-track-val"><strong>${formatNum(meanPolar, 2)}</strong></td>
                  <td class="td-num td-track-temp"><strong>${formatNum(tempAnnualMean, 1)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainHoriz, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainAnnual, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainSeasonal, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainAzim, 2)}</strong></td>
                  <td class="td-num"><strong>${formatNum(meanGainHorizTrack, 2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Illustration Sidebar -->
          <div class="opt-tracking-diagram-sidebar">
            ${polarDiagramSvg}
            <div class="tracking-diagram-caption">
              ${isEn ? 'Single-axis polar tracking with rotation around tilted polar axis' : 'Seguimiento a un eje polar con rotación alrededor del eje orientado a la latitud'}
            </div>
          </div>
        </div>

        <!-- 5. Footer Buttons matching Figura 6.3.18 -->
        <div class="opt-study-footer-actions">
          <div class="footer-btn-left-group">
            <button id="btn-polar-volver" class="btn-study-foot btn-volver" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>${isEn ? 'Back' : 'Volver'}</span>
            </button>
            <button id="btn-polar-salir" class="btn-study-foot btn-salir" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>${isEn ? 'Exit' : 'Salir'}</span>
            </button>
          </div>

          <div class="footer-btn-right-group">
            <button id="btn-polar-goto-energy" class="btn-study-foot btn-energy ${statePolarShowEnergy ? 'active' : ''}" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>${statePolarShowEnergy ? (isEn ? 'Hide energy calculation' : 'Ocultar cálculo de energía') : (isEn ? 'Energy calculation' : 'Cálculo de energía')}</span>
            </button>

            <button id="btn-polar-export-excel" class="btn-study-foot btn-excel" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>${isEn ? 'Export to Excel' : 'Exportar a Excel'}</span>
            </button>

            <button id="btn-polar-export-report" class="btn-study-foot btn-report" type="button">
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

        <!-- Mount points for Dedicated Graphs Window and Energy Window -->
        <div id="opt-polar-graphs-mount-point"></div>
        <div id="opt-polar-energy-mount-point"></div>
      </div>
    `;

    // Mount Graphs Window if active
    const graphsMountPoint = container.querySelector<HTMLDivElement>('#opt-polar-graphs-mount-point');
    if (graphsMountPoint && statePolarShowGraphs) {
      graphsMountPoint.innerHTML = '';
      const graphsWindow = renderTrackingPolarGraphsWindow({
        simulationResult: res,
        locationName,
        latitude,
        initialComponent: statePolarComponent as any,
        onBack: () => {
          statePolarShowGraphs = false;
          renderInternal();
        },
        onExit: () => {
          statePolarShowGraphs = false;
          renderInternal();
          if (onExit) onExit();
        },
      });
      graphsMountPoint.appendChild(graphsWindow);
    }

    // Mount Energy Panel if active
    const energyMountPoint = container.querySelector<HTMLDivElement>('#opt-polar-energy-mount-point');
    if (energyMountPoint && statePolarShowEnergy) {
      energyMountPoint.innerHTML = '';
      const energyWindow = renderEnergyCalculationPanel({
        simulationResult: res,
        locationName,
        latitude,
        studyType: 'polar',
        initialPeakKw: props.peakPowerKw ?? 5.0,
        onClose: () => {
          statePolarShowEnergy = false;
          renderInternal();
        },
      });
      energyMountPoint.appendChild(energyWindow);
    }

    // Event listeners
    container.querySelector<HTMLSelectElement>('#tracking-polar-comp-select')?.addEventListener('change', (e) => {
      statePolarComponent = (e.target as HTMLSelectElement).value as TrackingRadiationComponent;
      renderInternal();
    });

    container.querySelector<HTMLButtonElement>('#btn-polar-goto-energy')?.addEventListener('click', () => {
      statePolarShowEnergy = !statePolarShowEnergy;
      renderInternal();
      if (statePolarShowEnergy) {
        setTimeout(() => {
          container.querySelector('#opt-polar-energy-mount-point')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });

    container.querySelector<HTMLButtonElement>('#btn-polar-view-charts')?.addEventListener('click', () => {
      statePolarShowGraphs = !statePolarShowGraphs;
      renderInternal();
      if (statePolarShowGraphs) {
        setTimeout(() => {
          container.querySelector('#opt-polar-graphs-mount-point')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });

    container.querySelector<HTMLButtonElement>('#btn-polar-volver')?.addEventListener('click', () => {
      if (onBack) onBack();
    });

    container.querySelector<HTMLButtonElement>('#btn-polar-salir')?.addEventListener('click', () => {
      if (onExit) onExit();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const activeCompPolar = statePolarComponent === 'all' ? 'global' : statePolarComponent;

    container.querySelector<HTMLButtonElement>('#btn-polar-export-excel')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'excel',
        activeComponent: activeCompPolar,
        isEn,
        onConfirm: (mode) => {
          exportOrientSolMasterExcel(res, {
            activeStudyOp: 'polar',
            activeComponent: activeCompPolar,
            exportMode: mode,
            isEn,
            peakPowerKw: solarSyncState.getPeakPowerKw(),
            performanceRatio: solarSyncState.getPerformanceRatio(),
            tonc: solarSyncState.getTonc(),
          });
        },
      });
    });

    container.querySelector<HTMLButtonElement>('#btn-polar-export-report')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'pdf',
        activeComponent: activeCompPolar,
        isEn,
        onConfirm: (mode) => {
          showPdfGenerationNoticeModal(isEn, () => {
            generateOrientSolPDFReport(res, isEn, 'polar', {
              peakPowerKw: solarSyncState.getPeakPowerKw(),
              performanceRatio: solarSyncState.getPerformanceRatio(),
              tonc: solarSyncState.getTonc(),
              componentsMode: mode,
              activeComponent: activeCompPolar,
            });
          });
        },
      });
    });
  }

  renderInternal();
  return container;
}
