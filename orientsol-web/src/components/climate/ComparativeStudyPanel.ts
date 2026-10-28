import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { renderComparativeGraphsWindow } from '@/components/charts/ComparativeGraphsWindow';
import { getMonthlyRadiationForAngle } from '@/components/climate/OptimalAnnualStudyPanel';
import {
  showPdfGenerationNoticeModal,
  generateOrientSolPDFReport,
  showExportComponentChoiceModal,
} from '@/components/export/pdfReportGenerator';
import { exportOrientSolMasterExcel } from '@/components/export/masterExportService';
import { solarSyncState } from '@/services/bridge/solarSyncState';
import { getNoonAzimuthDeg, getDualAxisNoonTiltDeg, getHorizontalTrackerDailyMeanTiltDeg } from '@/services/solarGeometryAngles';
import { formatNum } from '@/utils/formatters';

export type ComparativeRadiationComponent = 'global' | 'beam' | 'diffuse' | 'albedo';

interface ComparativeStudyProps {
  simulationResult: SolarBridgeSimulationResult;
  locationName: string;
  latitude: number;
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

let stateCompComponent: ComparativeRadiationComponent = 'global';
let stateCompShowGraphs: boolean = false;

/**
 * Replicates OrientSol 4.0 - Comparativa de todos los tipos de estudios (Tabla_Comparativa.m)
 * Matching strictly Figura 5.2.98
 */
export function renderComparativeStudyPanel(props: ComparativeStudyProps): HTMLElement {
  const { simulationResult: res, locationName, latitude, onBack, onExit } = props;

  const container = document.createElement('div');
  container.className = 'opt-tracking-study-card comparative-study-panel';
  container.id = 'comparative-study-window';

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const months = isEn ? MONTH_NAMES_EN : MONTH_NAMES_ES;

    const compActual = stateCompComponent;
    const compSym = compActual === 'global' ? 'Gdm' : compActual === 'beam' ? 'Bdm' : compActual === 'diffuse' ? 'Ddm' : 'Rdm';
    const compTitle = compActual === 'global' ? (isEn ? 'Global mean monthly radiation' : 'Radiación global media mensual')
      : compActual === 'beam' ? (isEn ? 'Direct mean monthly radiation' : 'Radiación directa media mensual')
      : compActual === 'diffuse' ? (isEn ? 'Diffuse mean monthly radiation' : 'Radiación difusa media mensual')
      : (isEn ? 'Albedo mean monthly radiation' : 'Radiación de albedo media mensual');

    // Radiation components for all 7 methods
    const rad0 = compActual === 'global' ? res.horizontal.gdm0
      : compActual === 'beam' ? res.horizontal.bdm0
      : compActual === 'diffuse' ? res.horizontal.ddm0
      : new Array(12).fill(0.0);

    const getComp = (compObj: { global?: number[]; beam?: number[]; diffuse?: number[]; albedo?: number[] } | undefined, fallback: number[]) => {
      if (compActual === 'global') return fallback;
      if (compObj && compObj[compActual]) return compObj[compActual]!;
      if (compActual === 'beam') return res.horizontal.bdm0;
      if (compActual === 'diffuse') return res.horizontal.ddm0;
      return new Array(12).fill(0.0);
    };

    const radOptAnnual = getMonthlyRadiationForAngle(res, compActual, res.optimalAnnual.optimalTiltDeg);
    const radOptSeasonal = compActual === 'global' ? res.seasonal.monthlyDailyKwh : getMonthlyRadiationForAngle(res, compActual, Math.round((res.seasonal.winterTiltDeg + res.seasonal.summerTiltDeg) / 2));
    
    // Monthly optimal (12 independent positions)
    const monthlyOptTilts = res.monthlyOptimum12?.optimalTiltsDeg ?? [];
    const radOptMonthly: number[] = [];
    for (let m = 0; m < 12; m++) {
      if (compActual === 'global') {
        radOptMonthly.push(res.monthlyOptimum12?.monthlyDailyKwh?.[m] ?? res.horizontal.gdm0[m]);
      } else {
        const tiltM = monthlyOptTilts[m] ?? res.optimalAnnual.optimalTiltDeg;
        const radMonth = getMonthlyRadiationForAngle(res, compActual, tiltM);
        radOptMonthly.push(radMonth[m]);
      }
    }

    const radPolar = getComp(res.tracking.polarAxis.components, res.tracking.polarAxis.monthlyDailyKwh);
    const radAzim = getComp(res.tracking.azimuthalAxis.components, res.tracking.azimuthalAxis.monthlyDailyKwh);
    const radHorizTrack = getComp(res.tracking.horizontalAxis.components, res.tracking.horizontalAxis.monthlyDailyKwh);
    const radDual = getComp(res.tracking.dualAxis.components, res.tracking.dualAxis.monthlyDailyKwh);
    const tempMean = res.temperatures.ambient.monthlyMeanC;

    // Averages (row MEDIA)
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / 12;
    const m0 = avg(rad0);
    const mOptAnnual = avg(radOptAnnual);
    const mOptSeasonal = avg(radOptSeasonal);
    const mOptMonthly = avg(radOptMonthly);
    const mPolar = avg(radPolar);
    const mAzim = avg(radAzim);
    const mHorizTrack = avg(radHorizTrack);
    const mDual = avg(radDual);
    const mTemp = res.temperatures.ambient.annualMeanC;

    // Exact average angles considered for each study mode
    const seasonTilts = months.map((_, i) => {
      if (i === 11 || i === 0 || i === 1) {
        return res.seasonal?.winterTiltDeg ?? 60;
      } else if (i === 2 || i === 3 || i === 4) {
        return res.seasonal?.springTiltDeg ?? 35;
      } else if (i === 5 || i === 6 || i === 7) {
        return res.seasonal?.summerTiltDeg ?? 15;
      }
      return res.seasonal?.autumnTiltDeg ?? 35;
    });
    const avgSeasonalTilt = avg(seasonTilts);
    const avgMonthlyTilt = monthlyOptTilts.length ? avg(monthlyOptTilts) : 0;
    const noonDualTilts = months.map((_, i) => getDualAxisNoonTiltDeg(latitude, i));
    const noonAzims = months.map((_, i) => getNoonAzimuthDeg(latitude, i));
    const horizTilts = months.map((_, i) => getHorizontalTrackerDailyMeanTiltDeg(latitude, i));
    const avgDualTilt = avg(noonDualTilts);
    const avgDualAzim = avg(noonAzims);
    const avgHorizTilt = avg(horizTilts);
    const fixedOri = latitude >= 0 ? 0.0 : 180.0;

    container.innerHTML = `
      <div class="opt-tracking-window-frame">
        <!-- 1. Header matching OrientSol 4.0 MATLAB Window -->
        <div class="opt-tracking-header-bar">
          <div class="opt-tracking-header-left">
            <div class="opt-tracking-meta-row">
              <span>
                <strong>${isEn ? 'City:' : 'Ciudad:'}</strong>
                <span class="meta-val meta-city" style="font-weight: 700; margin-left: 0.35rem;">${locationName}</span>
              </span>
              <span style="margin-left: 1.5rem;">
                <strong>${isEn ? 'Latitude (°):' : 'Latitud (°):'}</strong>
                <span class="meta-val" style="font-weight: 700; margin-left: 0.35rem;">${formatNum(latitude, 2)}°</span>
              </span>
            </div>
            <div class="opt-tracking-study-title-row">
              <span class="meta-label">
                <strong>${isEn ? 'Study:' : 'Estudio:'}</strong>
                <span class="meta-val" style="font-weight: 600; margin-left: 0.35rem;">${isEn ? 'Comparative of all study types' : 'Comparativa de todos los tipos de estudios'}</span>
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
            <label for="sel-comp-study" class="tracking-comp-label">
              ${isEn ? 'Select a component' : 'Seleccione una componente'}
            </label>
            <select id="sel-comp-study" class="form-select tracking-comp-dropdown">
              <option value="global" ${compActual === 'global' ? 'selected' : ''}>${isEn ? 'Global' : 'Global'}</option>
              <option value="beam" ${compActual === 'beam' ? 'selected' : ''}>${isEn ? 'Direct' : 'Directa'}</option>
              <option value="diffuse" ${compActual === 'diffuse' ? 'selected' : ''}>${isEn ? 'Diffuse' : 'Difusa'}</option>
              <option value="albedo" ${compActual === 'albedo' ? 'selected' : ''}>${isEn ? 'Albedo' : 'Albedo'}</option>
            </select>
          </div>

          <div class="tracking-toolbar-actions">
            <button type="button" id="btn-comp-view-graphs" class="btn-study-view-charts ${stateCompShowGraphs ? 'active' : ''}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="m19 9-5 5-4-4-3 3"></path>
              </svg>
              <span>${stateCompShowGraphs ? (isEn ? 'Hide Graphs' : 'Ocultar gráficas') : (isEn ? 'View Graphs' : 'Ver gráficas')}</span>
            </button>
          </div>
        </div>

        <!-- 3. Subtitle / Table Caption -->
        <div class="opt-tracking-table-caption">
          ${compTitle} (kWh/m²/día)
        </div>

        <!-- 4. 10-Column Comparative Table Matching Figura 5.2.98 including Monthly Optimum -->
        <div class="opt-tracking-table-wrap comp-table-wrap-fit">
          <table class="opt-tracking-table comparative-results-table">
            <thead>
              <tr class="tracking-top-th-row">
                <th class="th-track-month">${isEn ? 'Month' : 'Mes'}</th>
                <th>${compSym}<br/><span style="font-size: 0.72rem;">(0°)</span></th>
                <th>${compSym}<br/><span style="font-size: 0.70rem;">${isEn ? 'Annual Opt.' : 'Ópt. Anual'}</span></th>
                <th>${compSym}<br/><span style="font-size: 0.70rem;">${isEn ? 'Seasonal Opt.' : 'Ópt. Estac.'}</span></th>
                <th>${compSym}<br/><span style="font-size: 0.70rem;">${isEn ? 'Monthly Opt.' : 'Ópt. Mens.'}</span></th>
                <th>${compSym}<br/><span style="font-size: 0.70rem;">${isEn ? 'Polar 1-ax' : '1 eje polar'}</span></th>
                <th>${compSym}<br/><span style="font-size: 0.70rem;">${isEn ? 'Azim. 1-ax' : '1 eje azim.'}</span></th>
                <th>${compSym}<br/><span style="font-size: 0.70rem;">${isEn ? 'Horiz. 1-ax' : '1 eje horiz.'}</span></th>
                <th class="th-track-opt">${compSym}<br/><span style="font-size: 0.70rem;">${isEn ? 'Two-axis' : '2 ejes'}</span></th>
                <th class="th-track-temp">${isEn ? 'Mean Temp' : 'Tª media'}<br/><span style="font-size: 0.70rem;">(°C)</span></th>
              </tr>
            </thead>
            <tbody>
              ${months.map((mName, i) => {
                const optTiltAnn = res.optimalAnnual.optimalTiltDeg;
                return `
                <tr>
                  <td class="td-track-month"><strong>${mName}</strong></td>
                  <td class="td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main">${formatNum(rad0[i], 2)}</span>
                      <span class="comp-angle-chip">Inc: 0,0° | Ori: 0,0°</span>
                    </div>
                  </td>
                  <td class="td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main">${formatNum(radOptAnnual[i], 2)}</span>
                      <span class="comp-angle-chip">Inc: ${formatNum(optTiltAnn, 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                    </div>
                  </td>
                  <td class="td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main">${formatNum(radOptSeasonal[i], 2)}</span>
                      <span class="comp-angle-chip">Inc: ${formatNum(seasonTilts[i], 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                    </div>
                  </td>
                  <td class="td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main">${formatNum(radOptMonthly[i], 2)}</span>
                      <span class="comp-angle-chip">Inc: ${formatNum(monthlyOptTilts[i] ?? 0, 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                    </div>
                  </td>
                  <td class="td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main">${formatNum(radPolar[i], 2)}</span>
                      <span class="comp-angle-chip">Inc: ${formatNum(latitude, 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                    </div>
                  </td>
                  <td class="td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main">${formatNum(radAzim[i], 2)}</span>
                      <span class="comp-angle-chip">Inc: ${formatNum(latitude, 1)}° | Ori: ${formatNum(noonAzims[i], 1)}°</span>
                    </div>
                  </td>
                  <td class="td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main">${formatNum(radHorizTrack[i], 2)}</span>
                      <span class="comp-angle-chip">Inc: ${formatNum(horizTilts[i], 1)}° | Ori: 90,0°</span>
                    </div>
                  </td>
                  <td class="td-track-dual td-comp-val-cell">
                    <div class="comp-cell-flex">
                      <span class="comp-val-main"><strong>${formatNum(radDual[i], 2)}</strong></span>
                      <span class="comp-angle-chip chip-dual">Inc: ${formatNum(noonDualTilts[i], 1)}° | Ori: ${formatNum(noonAzims[i], 1)}°</span>
                    </div>
                  </td>
                  <td class="td-track-temp-val"><strong>${formatNum(tempMean[i], 1)}</strong></td>
                </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="tracking-media-row">
                <td class="td-track-month"><strong>${isEn ? 'MEAN' : 'MEDIA'}</strong></td>
                <td class="td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(m0, 2)}</strong></span>
                    <span class="comp-angle-chip">Inc: 0,0° | Ori: 0,0°</span>
                  </div>
                </td>
                <td class="td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(mOptAnnual, 2)}</strong></span>
                    <span class="comp-angle-chip">Inc: ${formatNum(res.optimalAnnual.optimalTiltDeg, 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                  </div>
                </td>
                <td class="td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(mOptSeasonal, 2)}</strong></span>
                    <span class="comp-angle-chip">Inc: ${formatNum(avgSeasonalTilt, 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                  </div>
                </td>
                <td class="td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(mOptMonthly, 2)}</strong></span>
                    <span class="comp-angle-chip">Inc: ${formatNum(avgMonthlyTilt, 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                  </div>
                </td>
                <td class="td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(mPolar, 2)}</strong></span>
                    <span class="comp-angle-chip">Inc: ${formatNum(latitude, 1)}° | Ori: ${formatNum(fixedOri, 1)}°</span>
                  </div>
                </td>
                <td class="td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(mAzim, 2)}</strong></span>
                    <span class="comp-angle-chip">Inc: ${formatNum(latitude, 1)}° | Ori: ${formatNum(avgDualAzim, 1)}°</span>
                  </div>
                </td>
                <td class="td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(mHorizTrack, 2)}</strong></span>
                    <span class="comp-angle-chip">Inc: ${formatNum(avgHorizTilt, 1)}° | Ori: 90,0°</span>
                  </div>
                </td>
                <td class="td-track-dual td-comp-val-cell">
                  <div class="comp-cell-flex">
                    <span class="comp-val-main"><strong>${formatNum(mDual, 2)}</strong></span>
                    <span class="comp-angle-chip chip-dual">Inc: ${formatNum(avgDualTilt, 1)}° | Ori: ${formatNum(avgDualAzim, 1)}°</span>
                  </div>
                </td>
                <td class="td-track-temp-val"><strong>${formatNum(mTemp, 1)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- 5. Footer Buttons Matching OrientSol Design System -->
        <div class="opt-study-footer-actions" style="margin-top: 1.5rem;">
          <div class="footer-btn-left-group">
            <button type="button" id="btn-comp-volver" class="btn-study-foot btn-volver">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>${isEn ? 'Back' : 'Volver'}</span>
            </button>
            <button type="button" id="btn-comp-salir" class="btn-study-foot btn-salir">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>${isEn ? 'Exit' : 'Salir'}</span>
            </button>
          </div>
          <div class="footer-btn-right-group">
            <button type="button" id="btn-comp-excel" class="btn-study-foot btn-excel">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>${isEn ? 'Export to Excel' : 'Exportar a Excel'}</span>
            </button>
            <button type="button" id="btn-comp-pdf" class="btn-study-foot btn-report">
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

        <!-- Graphs container when toggled -->
        <div id="comparative-graphs-slot" style="margin-top: 1.5rem;"></div>
      </div>
    `;

    // Hook listeners
    const selComp = container.querySelector('#sel-comp-study') as HTMLSelectElement;
    selComp?.addEventListener('change', () => {
      stateCompComponent = selComp.value as ComparativeRadiationComponent;
      renderInternal();
    });

    const btnGraphs = container.querySelector('#btn-comp-view-graphs') as HTMLButtonElement;
    btnGraphs?.addEventListener('click', () => {
      stateCompShowGraphs = !stateCompShowGraphs;
      renderInternal();
    });

    const graphsSlot = container.querySelector('#comparative-graphs-slot') as HTMLElement;
    if (stateCompShowGraphs && graphsSlot) {
      graphsSlot.innerHTML = '';
      const graphsWindow = renderComparativeGraphsWindow({
        simulationResult: res,
        locationName,
        latitude,
        onBack: () => {
          stateCompShowGraphs = false;
          renderInternal();
        },
        onExit: () => {
          stateCompShowGraphs = false;
          renderInternal();
        }
      });
      graphsSlot.appendChild(graphsWindow);
    }

    container.querySelector('#btn-comp-volver')?.addEventListener('click', () => {
      if (onBack) onBack();
    });

    container.querySelector('#btn-comp-salir')?.addEventListener('click', () => {
      if (onExit) onExit();
    });

    container.querySelector('#btn-comp-excel')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'excel',
        activeComponent: stateCompComponent,
        isEn,
        onConfirm: (mode) => {
          exportOrientSolMasterExcel(res, {
            activeStudyOp: 'comparative',
            activeComponent: stateCompComponent,
            exportMode: mode,
            isEn,
            peakPowerKw: solarSyncState.getPeakPowerKw(),
            performanceRatio: solarSyncState.getPerformanceRatio(),
            tonc: solarSyncState.getTonc(),
          });
        },
      });
    });

    container.querySelector('#btn-comp-pdf')?.addEventListener('click', () => {
      showExportComponentChoiceModal({
        exportType: 'pdf',
        activeComponent: stateCompComponent,
        isEn,
        onConfirm: (mode) => {
          showPdfGenerationNoticeModal(isEn, () => {
            generateOrientSolPDFReport(res, isEn, 'comparative', {
              peakPowerKw: solarSyncState.getPeakPowerKw(),
              performanceRatio: solarSyncState.getPerformanceRatio(),
              tonc: solarSyncState.getTonc(),
              componentsMode: mode,
              activeComponent: stateCompComponent,
            });
          });
        },
      });
    });
  }

  renderInternal();
  return container;
}
