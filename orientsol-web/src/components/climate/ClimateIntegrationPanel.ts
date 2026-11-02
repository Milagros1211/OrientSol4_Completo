import { fetchUnifiedClimateData } from '@/services/external';
import { climateDatabaseService, validateClimateRecordForSaving } from '@/services/supabase';
import {
  executeSolarSimulationFromClimateData,
  type SolarBridgeSimulationResult,
} from '@/services/bridge/solarCalculationBridge';
import type { ClimateDataRecord, ClimateSourceType } from '@/types/climate';
import { i18n } from '@/i18n';
import { formatNum, formatInt } from '@/utils/formatters';
import { escapeHtml, formatSafeUserErrorMessage } from '@/utils/security';

const CITY_PRESETS = [
  { name: 'Madrid (España)', lat: 40.4168, lon: -3.7038 },
  { name: 'Barcelona (España)', lat: 41.3879, lon: 2.1699 },
  { name: 'Sevilla (España)', lat: 37.3891, lon: -5.9845 },
  { name: 'Valencia (España)', lat: 39.4699, lon: -0.3763 },
  { name: 'Bilbao (España)', lat: 43.263, lon: -2.935 },
  { name: 'Santa Cruz de Tenerife (España)', lat: 28.4636, lon: -16.2518 },
  { name: 'Roma (Italia)', lat: 41.9028, lon: 12.4964 },
  { name: 'Atenas (Grecia)', lat: 37.9838, lon: 23.7275 },
];

let cachedExternalClimateData: ClimateDataRecord | null = null;
let cachedExternalSimulationResult: SolarBridgeSimulationResult | null = null;

export function renderClimateIntegrationPanel(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'panel-card climate-panel';
  const t = i18n.t;
  const isEn = i18n.getLocale() === 'en';
  const MONTH_LABELS = t.common.monthNamesShort;

  container.innerHTML = `
    <div class="panel-header">
      <div class="panel-icon solar-api-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      </div>
      <div>
        <h3 class="panel-title">${t.externalClimate.title}</h3>
        <p class="panel-desc">${t.externalClimate.subtitle}</p>
      </div>
    </div>

    <!-- Controls Form -->
    <div class="climate-controls-grid">
      <div class="form-group">
        <label for="climate-source-select" class="form-label">${t.externalClimate.sourceLabel}</label>
        <select id="climate-source-select" class="form-select">
          <option value="pvgis">${isEn ? 'PVGIS 5.3 API (European Commission JRC)' : 'PVGIS 5.3 API (Comisión Europea JRC)'}</option>
          <option value="nasa">${isEn ? 'NASA POWER API (Global Satellite Climatology)' : 'NASA POWER API (Climatología Satelital Global)'}</option>
          <option value="meteonorm">${isEn ? 'Open-Meteo API (ECMWF ERA5 Reanálisis)' : 'Open-Meteo API (ECMWF ERA5 Reanálisis)'}</option>
          <option value="supabase">${isEn ? 'Supabase (Saved Cloud Datasets)' : 'Supabase (Datasets Guardados / Nube)'}</option>
        </select>
      </div>

      <div class="form-group">
        <label for="city-preset-select" class="form-label">${isEn ? 'City Preset' : 'Preajuste de Ciudad'}</label>
        <select id="city-preset-select" class="form-select">
          ${CITY_PRESETS.map((c, i) => `<option value="${i}">${c.name}</option>`).join('')}
          <option value="custom">${isEn ? 'Custom Coordinates...' : 'Coordenadas Personalizadas...'}</option>
        </select>
      </div>

      <div class="form-group">
        <label for="input-latitude" class="form-label">${t.location.latitude} [°]</label>
        <input type="number" id="input-latitude" class="form-input" step="0.0001" value="40.4168" />
      </div>

      <div class="form-group">
        <label for="input-longitude" class="form-label">${t.location.longitude} [°]</label>
        <input type="number" id="input-longitude" class="form-input" step="0.0001" value="-3.7038" />
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="climate-actions-row">
      <button id="btn-fetch-climate" class="btn btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
          <path d="M21 21v-5h-5"></path>
        </svg>
        <span>${t.externalClimate.fetchBtn}</span>
      </button>

      <button id="btn-run-simulation" class="btn btn-solar" disabled>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>${t.externalClimate.calcBtn}</span>
      </button>

      <button id="btn-save-supabase" class="btn btn-secondary" disabled>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        <span>${isEn ? 'Save to Supabase' : 'Guardar en Supabase'}</span>
      </button>
    </div>

    <!-- Status Message -->
    <div id="climate-status-bar" class="climate-status-bar status-info">
      ${isEn ? 'Select a climate API source and click "Fetch Climate Data".' : 'Selecciona una fuente API o base de datos y pulsa "Consultar Datos Climáticos".'}
    </div>

    <!-- Active Climate Data Summary Card -->
    <div id="climate-data-card" class="climate-data-card hidden">
      <!-- Dynamically filled with data -->
    </div>

    <!-- Simulation Results -->
    <div id="climate-simulation-results" class="simulation-results-container hidden">
      <!-- Dynamically filled on simulation -->
    </div>
  `;

  // Elements
  const sourceSelect = container.querySelector('#climate-source-select') as HTMLSelectElement;
  const citySelect = container.querySelector('#city-preset-select') as HTMLSelectElement;
  const latInput = container.querySelector('#input-latitude') as HTMLInputElement;
  const lonInput = container.querySelector('#input-longitude') as HTMLInputElement;
  const fetchBtn = container.querySelector('#btn-fetch-climate') as HTMLButtonElement;
  const runBtn = container.querySelector('#btn-run-simulation') as HTMLButtonElement;
  const saveBtn = container.querySelector('#btn-save-supabase') as HTMLButtonElement;
  const statusBar = container.querySelector('#climate-status-bar') as HTMLElement;
  const dataCard = container.querySelector('#climate-data-card') as HTMLElement;
  const resultsContainer = container.querySelector('#climate-simulation-results') as HTMLElement;

  let activeClimateData: ClimateDataRecord | null = cachedExternalClimateData;

  // City preset change handler
  citySelect.addEventListener('change', () => {
    const val = citySelect.value;
    if (val !== 'custom') {
      const idx = parseInt(val, 10);
      const preset = CITY_PRESETS[idx];
      latInput.value = preset.lat.toFixed(4);
      lonInput.value = preset.lon.toFixed(4);
    }
  });

  // Fetch Climate Data Handler
  fetchBtn.addEventListener('click', async () => {
    const source = sourceSelect.value as ClimateSourceType;
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);

    let locationName = 'Coordenadas Personalizadas';
    if (citySelect.value !== 'custom') {
      const idx = parseInt(citySelect.value, 10);
      locationName = CITY_PRESETS[idx].name;
    }

    setLoading(true, isEn ? `Querying ${source.toUpperCase()} API...` : `Consultando API ${source.toUpperCase()}...`);
    resultsContainer.classList.add('hidden');

    try {
      let record: ClimateDataRecord;

      if (source === 'supabase') {
        const stored = await climateDatabaseService.fetchClimateData('madrid');
        if (stored) {
          record = stored;
        } else {
          throw new Error(isEn ? 'No stored records found in Supabase.' : 'No se encontraron registros almacenados en Supabase.');
        }
      } else {
        record = await fetchUnifiedClimateData({
          source,
          latitude: lat,
          longitude: lon,
          locationName,
        });
      }

      activeClimateData = record;
      cachedExternalClimateData = record;
      renderClimateDataPreview(record);
      setStatus(isEn ? `✓ Data retrieved successfully from ${source.toUpperCase()}.` : `✓ Datos obtenidos con éxito desde ${source.toUpperCase()}.`, 'success');
      runBtn.disabled = false;
      saveBtn.disabled = false;
    } catch (err: any) {
      console.error('[OrientSol API] Error:', err);
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'Error al consultar el servicio de datos climáticos externos.',
        'Error querying external climate data service.'
      );
      setStatus(safeMsg, 'error');
      runBtn.disabled = true;
      saveBtn.disabled = true;
    } finally {
      setLoading(false);
    }
  });

  // Save to Supabase Handler
  saveBtn.addEventListener('click', async () => {
    if (!activeClimateData) return;

    setStatus(isEn ? 'Registering dataset in Supabase...' : 'Registrando dataset en Supabase...', 'info');
    saveBtn.disabled = true;

    try {
      const recordToSave: ClimateDataRecord = {
        ...activeClimateData,
        locationName: activeClimateData.locationName,
      };

      const val = validateClimateRecordForSaving(recordToSave, isEn);
      if (!val.valid) {
        setStatus(`Error: ${val.error}`, 'error');
        saveBtn.disabled = false;
        return;
      }

      const reg = await climateDatabaseService.registerEmplacement(recordToSave);
      if (reg.isDuplicate) {
        setStatus(reg.message, 'warning');
      } else {
        renderClimateDataPreview(recordToSave);
        setStatus(
          isEn
            ? `✓ Emplacement "${recordToSave.locationName}" registered successfully in Supabase (12 monthly records).`
            : `✓ Emplazamiento "${recordToSave.locationName}" guardado con éxito en Supabase (12 registros mensuales).`,
          'success'
        );
      }
    } catch (err: any) {
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'Error al registrar los datos en el servidor.',
        'Error saving data to the server.'
      );
      setStatus(`${isEn ? 'Error:' : 'Error:'} ${safeMsg}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Run Pyodide Simulation Bridge Handler
  runBtn.addEventListener('click', async () => {
    if (!activeClimateData) return;

    setSimulationRunning(true);
    setStatus(isEn ? 'Transferring data to Pyodide and running solar optimization...' : 'Transfiriendo datos a Pyodide y ejecutando optimización solar...', 'info');

    try {
      const startTime = performance.now();
      const results = await executeSolarSimulationFromClimateData({
        climateData: activeClimateData,
        albedo: 0.20,
        peakPowerKw: 5.0,
        performanceRatio: 0.80,
      });

      const totalTime = Math.round(performance.now() - startTime);
      cachedExternalSimulationResult = results;
      setStatus(isEn ? `✓ Pyodide simulation finished in ${totalTime}ms.` : `✓ Simulación Pyodide finalizada en ${totalTime}ms.`, 'success');
      renderSimulationResults(results);
    } catch (err: any) {
      console.error('[OrientSol Simulation] Execution Error:', err);
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'Error durante la simulación de cálculo solar en Pyodide.',
        'Error during solar simulation calculation in Pyodide.'
      );
      setStatus(safeMsg, 'error');
    } finally {
      setSimulationRunning(false);
    }
  });

  function setStatus(msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    statusBar.textContent = msg;
    statusBar.className = `climate-status-bar status-${type}`;
  }

  function setLoading(isLoading: boolean, msg?: string) {
    fetchBtn.disabled = isLoading;
    if (isLoading && msg) {
      setStatus(msg, 'info');
    }
  }

  function setSimulationRunning(isRunning: boolean) {
    runBtn.disabled = isRunning;
    if (isRunning) {
      runBtn.innerHTML = `
        <span class="spinner-sm"></span>
        <span>${t.externalClimate.calculating}</span>
      `;
    } else {
      runBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>${t.externalClimate.calcBtn}</span>
      `;
    }
  }

  function renderClimateDataPreview(record: ClimateDataRecord) {
    dataCard.classList.remove('hidden');
    const annualGdm0 = record.monthlyGdm0.reduce((a, b) => a + b, 0) / 12;
    const annualTemp = record.monthlyTemperature.reduce((a, b) => a + b, 0) / 12;

    dataCard.innerHTML = `
      <div class="climate-card-header">
        <div class="card-title-group">
          <h4>${record.locationName} (${record.country})</h4>
          <span class="badge badge-source">${record.source.toUpperCase()}</span>
        </div>
        <div class="card-meta">
          <span>${t.location.latitude}: ${formatNum(record.latitude, 4)}°</span>
          <span>${t.location.longitude}: ${formatNum(record.longitude, 4)}°</span>
          <span>${t.location.elevation}: ${record.elevationM != null ? formatInt(record.elevationM) : 'N/D'} m</span>
        </div>
      </div>

      <div class="climate-kpis-grid">
        <div class="kpi-box">
          <span class="kpi-label">${t.externalClimate.annualGdm0}</span>
          <span class="kpi-val">${formatNum(annualGdm0, 2)} <small>kWh/m²/día</small></span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">${t.externalClimate.annualTemp}</span>
          <span class="kpi-val">${formatNum(annualTemp, 1)} <small>°C</small></span>
        </div>
      </div>

      <div class="monthly-table-wrapper">
        <table class="climate-monthly-table">
          <thead>
            <tr>
              <th>${isEn ? 'Variable' : 'Variable'}</th>
              ${MONTH_LABELS.map((m) => `<th>${m}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="row-label">G<sub>dm</sub>(0) [kWh/m²/d]</td>
              ${record.monthlyGdm0.map((v) => `<td>${formatNum(v, 2)}</td>`).join('')}
            </tr>
            <tr>
              <td class="row-label">T<sub>amb</sub> [°C]</td>
              ${record.monthlyTemperature.map((t) => `<td>${formatNum(t, 1)}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSimulationResults(res: SolarBridgeSimulationResult) {
    resultsContainer.classList.remove('hidden');
    resultsContainer.innerHTML = `
      <div class="results-header">
        <div class="results-badge-row">
          <span class="badge badge-success">${t.results.pythonSuccess}</span>
          <span class="badge badge-neutral">${res.executionTimeMs} ms</span>
        </div>
        <h3>${escapeHtml(t.results.resultsFor.replace('{location}', res.locationName).replace('{lat}', formatNum(res.latitude, 2)))}</h3>
      </div>

      <div class="results-section-grid">
        <div class="result-card highlight-card">
          <div class="result-card-header">
            <h4>${t.results.optAnnualTitle}</h4>
            <span class="tag-optimum">${res.optimalAnnual.optimalTiltDeg}°</span>
          </div>
          <div class="result-stat-main">
            <span class="stat-highlight">${formatNum(res.optimalAnnual.annualMeanDailyKwh, 2)}</span>
            <span class="stat-unit">kWh/m²/día</span>
          </div>
          <div class="result-stat-sub">
            <span>${t.results.gainOverHoriz}</span>
            <strong class="${res.optimalAnnual.gainOverHorizontalPct >= 0 ? 'text-gain' : 'text-danger'}">${res.optimalAnnual.gainOverHorizontalPct >= 0 ? '+' : ''}${formatNum(res.optimalAnnual.gainOverHorizontalPct, 2)}%</strong>
          </div>
          <div class="result-stat-sub">
            <span>${t.results.annualTotalRad}</span>
            <strong>${formatInt(Math.round(res.optimalAnnual.annualTotalKwh))} kWh/m²·año</strong>
          </div>
        </div>

        <div class="result-card">
          <div class="result-card-header">
            <h4>${t.results.seasonalTitle}</h4>
            <span class="${res.seasonal.gainOverOptimalAnnualPct >= 0 ? 'text-gain' : 'text-danger'}">${res.seasonal.gainOverOptimalAnnualPct >= 0 ? '+' : ''}${formatNum(res.seasonal.gainOverOptimalAnnualPct, 2)}% ${t.results.vsFixed}</span>
          </div>
          <div class="seasonal-angles-list">
            <div class="seasonal-item">
              <span class="season-badge winter">${t.results.winter}</span>
              <strong class="season-deg">${res.seasonal.winterTiltDeg}°</strong>
              <span class="season-rad">${formatNum(res.seasonal.winterMeanDailyKwh, 2)} kWh/m²/d</span>
            </div>
            <div class="seasonal-item">
              <span class="season-badge spring">${t.results.spring}</span>
              <strong class="season-deg">${res.seasonal.springTiltDeg}°</strong>
              <span class="season-rad">${formatNum(res.seasonal.springMeanDailyKwh, 2)} kWh/m²/d</span>
            </div>
            <div class="seasonal-item">
              <span class="season-badge summer">${t.results.summer}</span>
              <strong class="season-deg">${res.seasonal.summerTiltDeg}°</strong>
              <span class="season-rad">${formatNum(res.seasonal.summerMeanDailyKwh, 2)} kWh/m²/d</span>
            </div>
            <div class="seasonal-item">
              <span class="season-badge autumn">${t.results.autumn}</span>
              <strong class="season-deg">${res.seasonal.autumnTiltDeg}°</strong>
              <span class="season-rad">${formatNum(res.seasonal.autumnMeanDailyKwh, 2)} kWh/m²/d</span>
            </div>
          </div>
        </div>
      </div>
    `;
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Restore cached preview if available
  if (activeClimateData) {
    renderClimateDataPreview(activeClimateData);
    runBtn.disabled = false;
    saveBtn.disabled = false;
    if (cachedExternalSimulationResult) {
      renderSimulationResults(cachedExternalSimulationResult);
    }
  }

  return container;
}
