import { hybridClimateManager, type ManualClimateInput } from '@/services/hybrid';
import {
  executeSolarSimulationFromClimateData,
  type SolarBridgeSimulationResult,
} from '@/services/bridge/solarCalculationBridge';
import { solarSyncState } from '@/services/bridge/solarSyncState';
import {
  generateSampleCSV,
  generateSampleCSVHorizontal,
  generateSampleJSON,
} from '@/services/hybrid/climateFileParser';
import type { ClimateDataRecord } from '@/types/climate';
import {
  climateDatabaseService,
  validateClimateRecordForSaving,
  formatLocationWithCountry,
} from '@/services/supabase';
import { escapeHtml, escapeAttr, formatSafeUserErrorMessage } from '@/utils/security';
import { formatNum, formatInt } from '@/utils/formatters';
import { fetchUnifiedClimateData } from '@/services/external';
import { i18n } from '@/i18n';
import {
  renderRadiationChart,
  renderEnergyAndTemperatureChart,
  renderSurfacesRankingChart,
  attachSolarChartsEventListeners,
} from '@/components/charts/SolarCharts';
import { themeManager } from '@/services/theme/themeManager';
import { getSurfaceDisplayName, getCategoryBadge } from '@/i18n/surfaceTranslations';
import { pyodideService } from '@/services/pyodide';
import {
  renderOptimalAnnualStudyPanel,
} from '@/components/climate/OptimalAnnualStudyPanel';
import { renderOptimalMonthlyStudyPanel } from '@/components/climate/OptimalMonthlyStudyPanel';
import { renderOptimalSeasonalStudyPanel } from '@/components/climate/OptimalSeasonalStudyPanel';
import { renderTrackingPolarStudyPanel } from '@/components/climate/TrackingPolarStudyPanel';
import { renderTrackingAzimuthalStudyPanel } from '@/components/climate/TrackingAzimuthalStudyPanel';
import { renderTrackingHorizontalStudyPanel } from '@/components/climate/TrackingHorizontalStudyPanel';
import { renderTrackingDualAxisStudyPanel } from '@/components/climate/TrackingDualAxisStudyPanel';
import { renderComparativeStudyPanel } from '@/components/climate/ComparativeStudyPanel';
import { renderOperationMethodologyCard, type SolarOperationType } from '@/components/climate/OperationMethodologyCard';
import { openPedagogicalGuideModal } from '@/components/modals/PedagogicalGuideModal';

// Module-level caches to preserve state across language toggles (ES <-> EN)
let cachedLastSimulationResult: SolarBridgeSimulationResult | null = null;
let cachedActiveRecord: ClimateDataRecord | null = null;
let cachedActiveTab: 'historical' | 'manual' | 'upload' | 'api' = 'historical';
let cachedActiveStudyOp: 'annual' | 'monthly' | 'seasonal' | 'polar' | 'azimuthal' | 'horizontal' | 'dual' | 'comparative' = 'annual';

/**
 * Renders the banner indicating whether online upload to Supabase is permitted or in offline cache mode.
 */
function renderSupabaseUploadBannerHtml(isEn: boolean): string {
  const isOnline = climateDatabaseService.isOnline();
  const isConfigured = climateDatabaseService.isConfigured();
  const isAllowed = isOnline && isConfigured;

  if (isAllowed) {
    return `
      <div class="supabase-upload-indicator online">
        <span class="status-indicator-dot online"></span>
        <div class="indicator-text-block">
          <strong>${isEn ? 'Online Supabase Upload: PERMITTED' : 'Carga Online a Supabase: PERMITIDA'}</strong>
          <span class="indicator-sub">${isEn ? 'Connected to table: ' : 'Conectado a la tabla: '}<code>datos_mensuales</code>. ${isEn ? 'New emplacements are automatically stored in the cloud.' : 'Los nuevos emplazamientos se guardan automáticamente en la nube.'}</span>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="supabase-upload-indicator offline">
        <span class="status-indicator-dot offline"></span>
        <div class="indicator-text-block">
          <strong>${isEn ? 'Online Supabase Upload: NOT PERMITTED (Offline Mode)' : 'Carga Online a Supabase: NO PERMITIDA (Modo Offline)'}</strong>
          <span class="indicator-sub">${isEn ? 'No Supabase connection detected. New emplacements will be safely saved in local cache.' : 'Sin conexión activa a Supabase. El emplazamiento se guardará en la caché local para sincronizarlo después.'}</span>
        </div>
      </div>
    `;
  }
}

export function renderDualClimateLoaderPanel(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'panel-card dual-climate-panel';
  const t = i18n.t;
  const isEn = i18n.getLocale() === 'en';
  const MONTH_NAMES = t.common.monthNamesShort;
  const isOnlineInit = climateDatabaseService.isOnline();
  if (!isOnlineInit && cachedActiveTab === 'api') {
    cachedActiveTab = 'historical';
  }
  const currentActiveRecordInit: ClimateDataRecord = cachedActiveRecord || hybridClimateManager.getHistoricalLocations()[0];

  container.innerHTML = `
    <div class="panel-header">
      <div class="panel-icon hybrid-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
          <path d="M12 12v9"></path>
          <path d="m8 17 4 4 4-4"></path>
        </svg>
      </div>
      <div>
        <h3 class="panel-title">${t.hybridLoader.title}</h3>
        <p class="panel-desc">${t.hybridLoader.subtitle}</p>
      </div>
    </div>

    <!-- Mode Navigation Tabs -->
    <div class="dual-tabs-bar">
      <button class="dual-tab-btn ${cachedActiveTab === 'historical' ? 'active' : ''}" data-tab="historical">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span>${t.hybridLoader.tabHistorical}</span>
      </button>

      <button class="dual-tab-btn ${cachedActiveTab === 'manual' ? 'active' : ''}" data-tab="manual">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        <span>${t.hybridLoader.tabManual}</span>
      </button>

      <button class="dual-tab-btn ${cachedActiveTab === 'upload' ? 'active' : ''}" data-tab="upload">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <span>${t.hybridLoader.tabUpload}</span>
      </button>

      <button class="dual-tab-btn ${cachedActiveTab === 'api' ? 'active' : ''} ${!isOnlineInit ? 'tab-disabled' : ''}" data-tab="api" id="dual-tab-btn-api" ${!isOnlineInit ? 'disabled' : ''} title="${!isOnlineInit ? (isEn ? 'Internet connection required for satellite APIs' : 'Requiere conexión a Internet para consultar APIs satelitales (PVGIS / NASA)') : ''}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"></path>
        </svg>
        <span id="tab-api-title-text">${!isOnlineInit ? (isEn ? '4. Satellite Query (Offline)' : '4. Consulta Satelital (Sin conexión)') : (isEn ? '4. Consulta Satelital (PVGIS / NASA)' : '4. Consulta Satelital (PVGIS / NASA)')}</span>
      </button>
    </div>

    <!-- TAB 1: HISTORICAL DATABASE & SUPABASE SEARCH -->
    <div id="tab-content-historical" class="dual-tab-content ${cachedActiveTab === 'historical' ? '' : 'hidden'}">
      <!-- Pedagogical Guide Banner: Tab 1 -->
      <div class="tab-instruction-banner">
        <div class="tab-instruction-header" style="justify-content: space-between; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>${isEn ? 'Pedagogical Guide: How to select and explore official catalog stations?' : 'Guía Didáctica: ¿Cómo seleccionar y qué representa una estación del catálogo oficial?'}</span>
          </div>
          <button type="button" class="btn-pedagogical-guide" data-pedagogical-tab="historical">
            <span>${isEn ? 'ℹ View Full Didactic Guide' : 'ℹ Ver Guía Didáctica y Metodología'}</span>
          </button>
        </div>
        <ol class="tab-instruction-steps">
          <li>${isEn 
            ? '<strong>Assisted Location Search:</strong> Type any city or province name in the search box below (e.g., <em>Jaén</em>, <em>Madrid</em>, <em>Sevilla</em>) to view live matches and click <strong>"Select Station"</strong>.' 
            : '<strong>Búsqueda Inteligente de Emplazamiento:</strong> Escribe el nombre de tu ciudad o provincia (ej. <em>Jaén</em>, <em>Madrid</em>, <em>Sevilla</em>) en el buscador y selecciona el resultado del desplegable o pulsa <strong>«Seleccionar Estación»</strong>.'}</li>
          <li>${isEn 
            ? '<strong>Physical Variables Injected:</strong> Loads the 12-month global horizontal irradiation vector G<sub>dm</sub>(0) [kWh/m²·day] and ambient temperature T<sub>amb</sub> [°C] to feed the calculation engine.' 
            : '<strong>Variables Físicas Inyectadas:</strong> Carga de forma instantánea los 12 meses de irradiación diaria media sobre plano horizontal G<sub>dm</sub>(0) [kWh/m²·día] y temperatura media T<sub>amb</sub> [°C] para simular.'}</li>
          <li>${isEn 
            ? '<strong>Data Origin Identification:</strong> Stations tagged <code>[ORIENTSOL]</code> are verified official cloud records; stations tagged <code>[LOCAL CACHE]</code> are personal user-uploaded files.' 
            : '<strong>Identificación de Origen:</strong> La etiqueta <code>[ORIENTSOL]</code> identifica datos oficiales de la nube; <code>[CACHÉ LOCAL]</code> identifica mediciones personales importadas por ti.'}</li>
        </ol>
        <div class="pedagogical-concept-card">
          <span>
            <strong style="color: #0284c7;">${isEn ? 'Physical Concept:' : 'Fundamento Físico:'}</strong>
            ${isEn
              ? 'G<sub>dm</sub>(0) is the monthly mean daily solar energy on horizontal ground. T<sub>amb</sub> governs the thermal loss of photovoltaic modules via the NOCT model.'
              : 'G<sub>dm</sub>(0) es la irradiación solar global diaria en plano horizontal. T<sub>amb</sub> determina las pérdidas por calentamiento de las células fotovoltaicas según el modelo TONC/NOCT.'}
          </span>
          <span style="font-weight: 700; color: #059669;">${isEn ? 'Direct link to calculation engine below' : 'Alimenta directamente el motor de cálculo inferior'}</span>
        </div>
      </div>
      <div class="historical-search-row">
        <div class="form-group flex-1" style="position: relative;">
          <label for="hist-search-input" class="form-label">
            ${t.hybridLoader.historicalLabel}
            <span class="search-hint-sub">${isEn ? '(Verified Climate Catalog)' : '(Catálogo Climático Oficial)'}</span>
          </label>
          <div class="search-input-box">
            <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              id="hist-search-input"
              class="form-input search-text-input"
              value="${escapeAttr(currentActiveRecordInit.locationName)}"
              placeholder="${isEn ? 'Search location (Spanish/English letters only)...' : 'Buscar emplazamiento (solo letras castellano/inglés)...'}"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <!-- Live Suggestions / Similarities Dropdown -->
          <div id="hist-suggestions-dropdown" class="suggestions-dropdown hidden" role="listbox"></div>
        </div>
        <button id="btn-use-historical" class="btn btn-primary" style="align-self: flex-end;">
          <span>${t.hybridLoader.selectStation}</span>
        </button>
      </div>

      <!-- NOT FOUND ALERT BANNER -->
      <div id="hist-not-found-banner" class="search-not-found-banner hidden"></div>
    </div>

    <!-- TAB 2: MANUAL FORM -->
    <div id="tab-content-manual" class="dual-tab-content ${cachedActiveTab === 'manual' ? '' : 'hidden'}">
      <!-- Pedagogical Guide Banner: Tab 2 -->
      <div class="tab-instruction-banner">
        <div class="tab-instruction-header" style="justify-content: space-between; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>${isEn ? 'Pedagogical Guide: Custom manual entry, solar geometry & albedo' : 'Guía Didáctica: Entrada Manual, Geometría Solar y Física del Albedo'}</span>
          </div>
          <button type="button" class="btn-pedagogical-guide" data-pedagogical-tab="manual">
            <span>${isEn ? 'ℹ View Full Didactic Guide' : 'ℹ Ver Guía Didáctica: Albedo y Rangos'}</span>
          </button>
        </div>
        <ol class="tab-instruction-steps">
          <li>${isEn 
            ? '<strong>(Optional) Reference Baseline:</strong> Use <em>"Pre-fill with historical station"</em> to load typical baseline values and edit them easily.' 
            : '<strong>(Opcional) Prellenado de Referencia:</strong> Puedes elegir una estación de referencia en <em>«Prellenar con estación»</em> para cargar datos base y editarlos a tu gusto.'}</li>
          <li>${isEn 
            ? '<strong>Geographic Coordinates (Lat / Lon):</strong> Essential for celestial geometry: solar declination &delta;, sunrise/sunset hour angle &omega;<sub>s</sub>, and extraterrestrial radiation G<sub>0d</sub>.' 
            : '<strong>Coordenadas Geográficas (Latitud y Longitud):</strong> Imprescindibles para la geometría solar: cálculo de la declinación &delta;, hora solar de salida/puesta &omega;<sub>s</sub> y radiación extraterrestre G<sub>0d</sub>.'}</li>
          <li>${isEn 
            ? '<strong>Ground Albedo (&rho;<sub>g</sub>):</strong> Reflectance coefficient of the surrounding terrain (e.g., standard grass 0.20, asphalt 0.15, light concrete 0.35, snow 0.60–0.80).' 
            : '<strong>Albedo del Suelo (&rho;<sub>g</sub>):</strong> Coeficiente de reflectividad del terreno hacia los paneles (suelo común/vegetación 0,20; asfalto 0,15; hormigón claro 0,35; nieve 0,60–0,80).'}</li>
          <li>${isEn 
            ? '<strong>Physical Range Enforcement:</strong> Validates in real time that G<sub>dm</sub>(0) stays in [0.05, 14.0 kWh/m²·d] (cannot exceed G<sub>0d</sub>) and T<sub>amb</sub> in [-50°C, 65°C].' 
            : '<strong>Validación de Coherencia Física:</strong> El sistema comprueba en tiempo real que G<sub>dm</sub>(0) esté en [0,05 a 14,0 kWh/m²·día] (sin superar G<sub>0d</sub>) y T<sub>amb</sub> en [-50°C a +65°C].'}</li>
          <li>${isEn 
            ? '<strong>Apply & Cloud Storage:</strong> Click <strong>"Apply Manual Data"</strong> to feed the simulator immediately, or <strong>"Save to Supabase"</strong> to register it in the official cloud database.' 
            : '<strong>Aplicar y Guardar en la Nube:</strong> Pulsa <strong>«Aplicar Datos Manuales»</strong> para simular localmente, o <strong>«Guardar en Supabase»</strong> para incorporarlo al catálogo oficial en la nube.'}</li>
        </ol>
        <div class="pedagogical-concept-card">
          <span>
            <strong style="color: #0284c7;">${isEn ? 'Ground Albedo Tip:' : 'Consejo de Albedo:'}</strong>
            ${isEn
              ? 'Standard albedo is 0.20 for rural/urban ground. On white roofs or snow, higher values increase diffuse reflection on tilted panels.'
              : 'El estándar de diseño es &rho;<sub>g</sub> = 0,20. En cubiertas reflectantes blancas o nieve, un mayor albedo incrementa la captación en planos inclinados.'}
          </span>
          <span style="font-weight: 700; color: #059669;">${isEn ? 'Verified physical range check' : 'Control estricto de plausibilidad física'}</span>
        </div>
      </div>
      <div id="manual-upload-permission-box">${renderSupabaseUploadBannerHtml(isEn)}</div>
      <div class="manual-preset-row">
        <span class="manual-preset-label">${t.hybridLoader.manualPresetLabel}</span>
        <select id="manual-template-select" class="form-select select-compact">
          <option value="">${t.hybridLoader.manualPresetPlaceholder}</option>
          ${hybridClimateManager
            .getHistoricalLocations()
            .map((loc) => `<option value="${escapeAttr(loc.id)}">${escapeHtml(loc.locationName)} (${escapeHtml(loc.country)})</option>`)
            .join('')}
        </select>
        <button id="btn-apply-manual-template" class="btn btn-secondary btn-sm">${t.hybridLoader.loadTemplate}</button>
      </div>

      <div class="form-grid manual-meta-grid">
        <div class="form-group">
          <label class="form-label">${t.hybridLoader.locName}</label>
          <input type="text" id="manual-name" class="form-input" value="${isEn ? 'Custom Solar Facility' : 'Instalación Solar Personalizada'}" autocomplete="off" spellcheck="false" required />
        </div>
        <div class="form-group">
          <label class="form-label">${t.location.latitude} [°]</label>
          <input type="text" inputmode="decimal" id="manual-lat" class="form-input" value="${formatNum(37.389, 3)}" autocomplete="off" required />
        </div>
        <div class="form-group">
          <label class="form-label">${t.location.longitude} [°]</label>
          <input type="text" inputmode="decimal" id="manual-lon" class="form-input" value="${formatNum(-5.984, 3)}" autocomplete="off" required />
        </div>
        <input type="hidden" id="manual-elev" value="0" />
        <div class="form-group">
          <label class="form-label">${t.location.albedoLabel} (&rho;<sub>g</sub>)</label>
          <input type="text" inputmode="decimal" id="manual-albedo" class="form-input" value="${formatNum(0.20, 2)}" autocomplete="off" required />
        </div>
      </div>

      <div class="manual-table-container">
        <label class="form-label">${isEn ? 'Monthly Values: G<sub>dm</sub>(0) [kWh/m²/day] &amp; T<sub>amb</sub> [°C]' : 'Valores Mensuales: G<sub>dm</sub>(0) [kWh/m²/día] &amp; T<sub>amb</sub> [°C]'}</label>
        <div class="monthly-inputs-table-wrapper">
          <table class="manual-monthly-table">
            <thead>
              <tr>
                <th>${isEn ? 'Variable' : 'Variable'}</th>
                ${MONTH_NAMES.map((m) => `<th>${m}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="row-label">G<sub>dm</sub>(0)</td>
                ${MONTH_NAMES.map(
                  (_, i) => `<td><input type="text" inputmode="decimal" class="manual-g-input" data-month="${i}" value="${formatNum(2.5 + i * 0.4, 2)}" autocomplete="off" required /></td>`
                ).join('')}
              </tr>
              <tr>
                <td class="row-label">T<sub>amb</sub> [°C]</td>
                ${MONTH_NAMES.map(
                  (_, i) => `<td><input type="text" inputmode="decimal" class="manual-t-input" data-month="${i}" value="${formatNum(10 + i * 1.5, 1)}" autocomplete="off" required /></td>`
                ).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="manual-actions-row" style="display: flex; gap: 0.75rem; justify-content: flex-end;">
        <button id="btn-validate-manual" class="btn btn-primary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>${t.hybridLoader.applyManualBtn}</span>
        </button>
        <button id="btn-save-manual-to-supabase" class="btn btn-secondary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>${isEn ? 'Save to Supabase' : 'Guardar en Supabase'}</span>
        </button>
      </div>
    </div>

    <!-- TAB 3: DIGITAL FILE UPLOAD -->
    <div id="tab-content-upload" class="dual-tab-content hidden">
      <!-- Pedagogical Guide Banner: Tab 3 -->
      <div class="tab-instruction-banner">
        <div class="tab-instruction-header" style="justify-content: space-between; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>${isEn ? 'Pedagogical Guide: Digital file import, formats & direct in-tab calculation' : 'Guía Didáctica: Importación Digital CSV/JSON, Formatos y Cálculo Directo'}</span>
          </div>
          <button type="button" class="btn-pedagogical-guide" data-pedagogical-tab="upload">
            <span>${isEn ? 'ℹ View Full Didactic Guide' : 'ℹ Ver Guía Didáctica: Archivos y Cálculo'}</span>
          </button>
        </div>
        <ol class="tab-instruction-steps">
          <li>${isEn 
            ? '<strong>Standardized Sample Templates:</strong> Download our ready-to-use CSV or JSON templates (single station or multi-station batch) to structure your G<sub>dm</sub>(0) and temperature records with decimal dots or commas.' 
            : '<strong>Plantillas Normalizadas de Ejemplo:</strong> Descarga nuestras plantillas listas para usar (CSV o JSON, individual o lote multi-estación) para estructurar tus 12 meses de radiación G<sub>dm</sub>(0) y temperatura.'}</li>
          <li>${isEn 
            ? '<strong>File Import & Validation:</strong> Drag and drop your file into the dropzone or click <strong>"Select File"</strong>. OrientSol instantly parses coordinates and verifies all 12 monthly values.' 
            : '<strong>Carga y Validación Automática:</strong> Arrastra tu archivo .csv, .json o .txt o pulsa <strong>«Seleccionar Archivo»</strong>. El sistema valida al instante las coordenadas y los 12 meses de mediciones sin recargar la página.'}</li>
          <li>${isEn 
            ? '<strong>Dual Storage Pipeline:</strong> Uploaded stations are immediately cached locally (offline-ready). Clicking <strong>"Upload to Database"</strong> syncs them securely to Supabase (online mode).' 
            : '<strong>Almacenamiento Dual (Caché Local + Nube DB):</strong> Los datos se guardan inmediatamente en caché local (listos offline). Al pulsar <strong>«Cargar a Base de Datos»</strong>, se sincronizan de forma segura con la nube de Supabase.'}</li>
          <li>${isEn 
            ? '<strong>Direct In-Place Calculation:</strong> Calculate immediately without changing screens! The station selector and quick-access pills appear right below, allowing you to switch stations and run the calculation engine on the spot.' 
            : '<strong>Selección y Simulación Directa In Situ:</strong> ¡Calcula de inmediato sin salir de esta sección! El selector y las píldoras de estaciones aparecen justo abajo para elegir cualquier emplazamiento y ejecutar el motor de cálculo en el acto.'}</li>
        </ol>
        <div class="pedagogical-concept-card">
          <span>
            <strong style="color: #0284c7;">${isEn ? 'Batch Multi-Station Feature:' : 'Función Multi-Estación:'}</strong>
            ${isEn
              ? 'Upload a single file containing multiple cities (e.g., Arequipa, Cusco, Piura). Interactive pills let you calculate each station with a single click.'
              : 'Puedes subir un único archivo con varios emplazamientos a la vez (ej. Arequipa, Cusco, Piura). Las píldoras interactivas te permiten simular cada una con un solo clic.'}
          </span>
          <span style="font-weight: 700; color: #059669;">${isEn ? 'Direct in-place calculation' : 'Cálculos y simulación directa in situ'}</span>
        </div>
      </div>
      <div id="file-upload-permission-box">${renderSupabaseUploadBannerHtml(isEn)}</div>
      <div id="file-dropzone" class="file-dropzone">
        <div class="dropzone-icon">
          <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <polyline points="9 15 12 12 15 15"></polyline>
          </svg>
        </div>
        <h4>${t.hybridLoader.dropzoneTitle}</h4>
        <p class="dropzone-hint">${t.hybridLoader.dropzoneHint}</p>
        <div class="dropzone-btn-group">
          <label class="btn btn-primary dropzone-file-btn">
            <span>${t.hybridLoader.selectFileBtn}</span>
            <input type="file" id="climate-file-input" accept=".csv,.json,.txt" style="display: none;" />
          </label>
          <button id="btn-download-csv-template" class="btn btn-secondary">${isEn ? 'Sample CSV (Vertical)' : 'Plantilla CSV (Vertical)'}</button>
          <button id="btn-download-csv-horizontal-template" class="btn btn-secondary">${isEn ? 'Sample CSV (Horizontal)' : 'Plantilla CSV (Horizontal)'}</button>
          <button id="btn-download-csv-multi-template" class="btn btn-secondary">${isEn ? 'Sample Batch CSV (Multi)' : 'Plantilla CSV (Lote Multi)'}</button>
          <button id="btn-download-json-template" class="btn btn-secondary">${isEn ? 'Sample JSON (Single)' : 'Plantilla JSON (Individual)'}</button>
          <button id="btn-download-json-multi-template" class="btn btn-secondary">${isEn ? 'Sample Batch JSON (Multi)' : 'Plantilla JSON (Lote Multi)'}</button>
        </div>
      </div>

      <!-- File Staging Card (prominently displays detected records and upload to database button) -->
      <div id="upload-staging-card" class="upload-staging-card hidden"></div>

      <!-- Post-Upload Success & Redirection Card (redirects to Tab 1 Catalog with dropdown tags) -->
      <div id="upload-success-card" class="upload-success-card hidden"></div>

      <!-- Station Selector in Tab 3 (Search & Select from Database [ORIENTSOL] or Cache [CACHÉ LOCAL]) -->
      <div id="tab3-station-selector-box" class="tab3-station-selector-box hidden">
        <div style="margin-bottom: 0.85rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); display: flex; align-items: center; gap: 0.45rem;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            ${isEn ? 'Select or Search Station to Calculate' : 'Seleccionar o Buscar Estación para Simular'}
          </span>
          <span class="search-hint-sub" style="font-size: 0.78rem;">
            ${isEn ? '(Reflects Database [ORIENTSOL] and [LOCAL CACHE])' : '(Refleja Base de Datos [ORIENTSOL] y [CACHÉ LOCAL])'}
          </span>
        </div>

        <div class="historical-search-row">
          <div class="form-group flex-1" style="position: relative;">
            <div class="search-input-box">
              <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                id="tab3-search-input"
                class="form-input search-text-input"
                placeholder="${isEn ? 'Search or select location (Arequipa, Cusco, Madrid...)' : 'Buscar o seleccionar emplazamiento (Arequipa, Cusco, Madrid...)'}"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <!-- Live Suggestions / Similarities Dropdown for Tab 3 -->
            <div id="tab3-suggestions-dropdown" class="suggestions-dropdown hidden" role="listbox"></div>
          </div>
          <button type="button" id="btn-use-tab3-station" class="btn btn-primary" style="align-self: flex-end;">
            <span>${t.hybridLoader.selectStation}</span>
          </button>
        </div>

        <!-- Detected stations from uploaded file as quick pills -->
        <div id="tab3-detected-pills-container" class="tab3-detected-pills-container hidden" style="margin-top: 1rem; padding-top: 0.85rem; border-top: 1px dashed var(--border-color, rgba(148, 163, 184, 0.25));">
          <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.45rem; display: block;">
            ${isEn ? 'Emplacements from uploaded file (click to select & calculate):' : 'Emplazamientos del archivo cargado (haz clic para seleccionar y simular):'}
          </span>
          <div id="tab3-detected-pills" class="tab3-detected-pills" style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;"></div>
        </div>

        <!-- NOT FOUND ALERT BANNER FOR TAB 3 -->
        <div id="tab3-not-found-banner" class="search-not-found-banner hidden" style="margin-top: 0.75rem;"></div>
      </div>
    </div>

    <!-- TAB 4: SATELLITE CLIMATE APIS -->
    <div id="tab-content-api" class="dual-tab-content ${cachedActiveTab === 'api' ? '' : 'hidden'}">
      <!-- Pedagogical Guide Banner: Tab 4 -->
      <div class="tab-instruction-banner">
        <div class="tab-instruction-header" style="justify-content: space-between; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>${isEn ? 'Pedagogical Guide: Global Satellite Climate Queries (PVGIS, NASA & Open-Meteo)' : 'Guía Didáctica: Consulta Satelital Global (PVGIS, NASA POWER y Open-Meteo)'}</span>
          </div>
          <button type="button" class="btn-pedagogical-guide" data-pedagogical-tab="api">
            <span>${isEn ? 'ℹ View Full Didactic Guide' : 'ℹ Ver Guía Didáctica: Redes Satelitales'}</span>
          </button>
        </div>
        <ol class="tab-instruction-steps">
          <li>${isEn 
            ? '<strong>Select Radiation Database:</strong> Choose between <strong>PVGIS 5.3</strong> (SARAH2 European Commission benchmark), <strong>NASA POWER</strong> (global satellite climatology), or <strong>Open-Meteo</strong> (ECMWF ERA5 reanalysis).' 
            : '<strong>Selección de Red Radiométrica:</strong> Elige entre <strong>PVGIS 5.3</strong> (Comisión Europea JRC, base SARAH2 de alta resolución), <strong>NASA POWER</strong> (climatología satelital global) o <strong>Open-Meteo</strong> (reanálisis ECMWF ERA5).'}</li>
          <li>${isEn 
            ? '<strong>Geolocation by City or Coordinates:</strong> Choose a preset city or specify the exact Latitude and Longitude of any location worldwide.' 
            : '<strong>Geolocalización por Ciudad o Coordenadas:</strong> Elige una ciudad predefinida o introduce la Latitud y Longitud exactas de cualquier punto del planeta.'}</li>
          <li>${isEn 
            ? '<strong>Automated 12-Month Ingestion:</strong> Click <strong>"Fetch Satellite Climate"</strong> to retrieve horizontal radiation G<sub>dm</sub>(0) and temperature T<sub>amb</sub> via secure edge proxy.' 
            : '<strong>Descarga e Ingesta Automatizada:</strong> Pulsa <strong>«Consultar Climatología»</strong> para extraer los 12 meses de irradiación solar G<sub>dm</sub>(0) y temperatura T<sub>amb</sub> a través del proxy seguro.'}</li>
          <li>${isEn 
            ? '<strong>Direct Simulation & Cloud Backup:</strong> Active dataset updates on the spot to run calculations immediately; click <strong>"Save to Supabase"</strong> to register it in your cloud catalog under <code>[ORIENTSOL]</code>.' 
            : '<strong>Simulación Inmediata y Guardado:</strong> La tarjeta activa se actualiza al instante para simular con el motor de cálculo; pulsa <strong>«Guardar en Supabase»</strong> para añadirlo a tu catálogo en la nube bajo <code>[ORIENTSOL]</code>.'}</li>
        </ol>
        <div class="pedagogical-concept-card">
          <span>
            <strong style="color: #0284c7;">${isEn ? 'Satellite vs Ground Physics:' : 'Física Satelital vs Terrestre:'}</strong>
            ${isEn
              ? 'Satellite models estimate ground solar flux via atmospheric radiative transfer from geostationary orbit sensors. Ideal for locations lacking official ground pyranometers.'
              : 'Los satélites geoestacionarios estiman la irradiancia terrestre midiendo el albedo de nubes y aerosoles con modelos de transferencia radiativa. Son idóneos para emplazamientos sin estaciones terrestres.'}
          </span>
          <span style="font-weight: 700; color: #059669;">${isEn ? 'Global planetary coverage' : 'Cobertura planetaria completa'}</span>
        </div>
      </div>
      <div id="tab4-offline-alert" class="search-alert-box alert-warning-box ${isOnlineInit ? 'hidden' : ''}" style="margin-bottom: 1rem;">
        <div class="alert-icon-wrap">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#f59e0b" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div>
          <div class="alert-title">${isEn ? 'Satellite APIs Offline' : 'APIs Satelitales Sin Conexión'}</div>
          <div class="alert-desc">
            ${isEn ? 'Internet connection required to query PVGIS or NASA satellite servers. Please use Tab 1 (Historical Database) or Tab 2 (Manual Entry) while offline.' : 'Se requiere conexión a Internet para consultar los servidores satelitales de PVGIS o NASA. Por favor, utilice la Pestaña 1 (Base de Datos Histórica) o Pestaña 2 (Entrada Manual) mientras esté desconectado.'}
          </div>
        </div>
      </div>
      <div class="climate-controls-grid">
        <div class="form-group">
          <label for="api-source-select" class="form-label">${isEn ? 'Data Source' : 'Fuente de Datos'}</label>
          <select id="api-source-select" class="form-select">
            <option value="pvgis">${isEn ? 'PVGIS 5.3 API (European Commission JRC)' : 'PVGIS 5.3 API (Comisión Europea JRC)'}</option>
            <option value="nasa">${isEn ? 'NASA POWER API (Global Satellite Climatology)' : 'NASA POWER API (Climatología Satelital Global)'}</option>
            <option value="meteonorm">${isEn ? 'Open-Meteo API (ECMWF ERA5 Reanalysis)' : 'Open-Meteo API (ECMWF ERA5 Reanálisis)'}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="api-city-preset-select" class="form-label">${isEn ? 'City Preset' : 'Preajuste de Ciudad'}</label>
          <select id="api-city-preset-select" class="form-select">
            <option value="0">${isEn ? 'Madrid (Spain)' : 'Madrid (España)'}</option>
            <option value="1">${isEn ? 'Barcelona (Spain)' : 'Barcelona (España)'}</option>
            <option value="2">${isEn ? 'Seville (Spain)' : 'Sevilla (España)'}</option>
            <option value="3">${isEn ? 'Valencia (Spain)' : 'Valencia (España)'}</option>
            <option value="4">${isEn ? 'Bilbao (Spain)' : 'Bilbao (España)'}</option>
            <option value="5">${isEn ? 'Santa Cruz de Tenerife (Spain)' : 'Santa Cruz de Tenerife (España)'}</option>
            <option value="6">${isEn ? 'Jaén (Spain)' : 'Jaén (España)'}</option>
            <option value="7">${isEn ? 'Rome (Italy)' : 'Roma (Italia)'}</option>
            <option value="8">${isEn ? 'Athens (Greece)' : 'Atenas (Grecia)'}</option>
            <option value="custom">${isEn ? 'Custom Coordinates...' : 'Coordenadas Personalizadas...'}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="api-input-name" class="form-label">${isEn ? 'Emplacement Name' : 'Nombre del Emplazamiento'}</label>
          <input type="text" id="api-input-name" class="form-input" value="${isEn ? 'Madrid (Spain)' : 'Madrid (España)'}" />
        </div>

        <div class="form-group">
          <label for="api-input-lat" class="form-label">${t.location.latitude} [°]</label>
          <input type="text" inputmode="decimal" id="api-input-lat" class="form-input" value="${formatNum(40.4168, 4)}" />
        </div>

        <div class="form-group">
          <label for="api-input-lon" class="form-label">${t.location.longitude} [°]</label>
          <input type="text" inputmode="decimal" id="api-input-lon" class="form-input" value="${formatNum(-3.7038, 4)}" />
        </div>
      </div>

      <div class="climate-actions-row">
        <button id="btn-fetch-satellite-api" class="btn btn-primary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
            <path d="M21 21v-5h-5"></path>
          </svg>
          <span>${isEn ? 'Fetch Satellite Climate' : 'Consultar Climatología'}</span>
        </button>

        <button id="btn-save-api-to-supabase" class="btn btn-secondary" disabled>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>${isEn ? 'Save to Supabase' : 'Guardar en Supabase'}</span>
        </button>
      </div>
    </div>

    <!-- Active Dataset Preview Card -->
    <div id="active-dataset-card" class="active-dataset-card">
      <!-- Dynamically filled with active dataset -->
    </div>

    <!-- Simulation Launch Banner -->
    <div class="simulation-launch-bar">
      <div class="sim-config-group">
        <label>${t.hybridLoader.peakPowerLabel}: <input type="text" inputmode="decimal" id="sim-peak-kw" class="form-input input-compact" value="${formatNum(5.0, 1)}" /></label>
        <label>${t.hybridLoader.prLabel}: <input type="text" inputmode="decimal" id="sim-pr" class="form-input input-compact" value="${formatNum(0.80, 2)}" /></label>
        <label>${t.hybridLoader.albedoLabel}: <input type="text" inputmode="decimal" id="sim-albedo" class="form-input input-compact" value="${formatNum(0.20, 2)}" /></label>
        <label>${t.hybridLoader.toncLabel}: <input type="text" inputmode="decimal" id="sim-tonc" class="form-input input-compact" value="${formatNum(47.0, 1)}" /></label>
      </div>
      <button id="btn-run-hybrid-simulation" class="btn btn-solar btn-lg">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>${t.hybridLoader.runSimulationBtn}</span>
      </button>
    </div>

    <!-- Live Status / Message Bar -->
    <div id="hybrid-status-bar" class="climate-status-bar status-info">
      ${isEn ? 'Select a historical station, complete the manual form, or upload a CSV/JSON file.' : 'Selecciona una fuente histórica, completa el formulario manual o sube un archivo CSV/JSON.'}
    </div>

    <!-- Simulation Results Area -->
    <div id="hybrid-simulation-results" class="simulation-results-container hidden">
      <!-- Dynamically filled on simulation -->
    </div>
  `;

  // Queries
  const tabButtons = container.querySelectorAll<HTMLButtonElement>('.dual-tab-btn');
  const tabContents = {
    historical: container.querySelector('#tab-content-historical') as HTMLElement,
    manual: container.querySelector('#tab-content-manual') as HTMLElement,
    upload: container.querySelector('#tab-content-upload') as HTMLElement,
    api: container.querySelector('#tab-content-api') as HTMLElement,
  };

  const histSearchInput = container.querySelector('#hist-search-input') as HTMLInputElement;
  const histSuggestionsDropdown = container.querySelector('#hist-suggestions-dropdown') as HTMLDivElement;
  const histNotFoundBanner = container.querySelector('#hist-not-found-banner') as HTMLDivElement;
  const useHistBtn = container.querySelector('#btn-use-historical') as HTMLButtonElement;

  const manualName = container.querySelector('#manual-name') as HTMLInputElement;
  const manualLat = container.querySelector('#manual-lat') as HTMLInputElement;
  const manualLon = container.querySelector('#manual-lon') as HTMLInputElement;
  const manualElev = container.querySelector('#manual-elev') as HTMLInputElement;
  const manualAlbedo = container.querySelector('#manual-albedo') as HTMLInputElement;
  const manualTemplateSelect = container.querySelector('#manual-template-select') as HTMLSelectElement;
  const applyTemplateBtn = container.querySelector('#btn-apply-manual-template') as HTMLButtonElement;
  const validateManualBtn = container.querySelector('#btn-validate-manual') as HTMLButtonElement;
  const saveManualBtn = container.querySelector('#btn-save-manual-to-supabase') as HTMLButtonElement;

  const dropzone = container.querySelector('#file-dropzone') as HTMLElement;
  const fileInput = container.querySelector('#climate-file-input') as HTMLInputElement;
  const downloadCsvBtn = container.querySelector('#btn-download-csv-template') as HTMLButtonElement;
  const downloadCsvHorizontalBtn = container.querySelector('#btn-download-csv-horizontal-template') as HTMLButtonElement;
  const downloadCsvMultiBtn = container.querySelector('#btn-download-csv-multi-template') as HTMLButtonElement;
  const downloadJsonBtn = container.querySelector('#btn-download-json-template') as HTMLButtonElement;
  const downloadJsonMultiBtn = container.querySelector('#btn-download-json-multi-template') as HTMLButtonElement;
  const uploadStagingCard = container.querySelector('#upload-staging-card') as HTMLDivElement;
  const uploadSuccessCard = container.querySelector('#upload-success-card') as HTMLDivElement;

  // Tab 3: Station Selector & Detected Pills Queries
  const tab3StationSelectorBox = container.querySelector('#tab3-station-selector-box') as HTMLDivElement;
  const tab3SearchInput = container.querySelector('#tab3-search-input') as HTMLInputElement;
  const tab3SuggestionsDropdown = container.querySelector('#tab3-suggestions-dropdown') as HTMLDivElement;
  const tab3NotFoundBanner = container.querySelector('#tab3-not-found-banner') as HTMLDivElement;
  const tab3UseStationBtn = container.querySelector('#btn-use-tab3-station') as HTMLButtonElement;
  const tab3DetectedPillsContainer = container.querySelector('#tab3-detected-pills-container') as HTMLDivElement;
  const tab3DetectedPills = container.querySelector('#tab3-detected-pills') as HTMLDivElement;

  // Tab 4: Satellite Climate APIs Queries
  const apiSourceSelect = container.querySelector('#api-source-select') as HTMLSelectElement;
  const apiCitySelect = container.querySelector('#api-city-preset-select') as HTMLSelectElement;
  const apiNameInput = container.querySelector('#api-input-name') as HTMLInputElement;
  const apiLatInput = container.querySelector('#api-input-lat') as HTMLInputElement;
  const apiLonInput = container.querySelector('#api-input-lon') as HTMLInputElement;
  const apiFetchBtn = container.querySelector('#btn-fetch-satellite-api') as HTMLButtonElement;
  const apiSaveBtn = container.querySelector('#btn-save-api-to-supabase') as HTMLButtonElement;

  let pendingUploadedRecords: ClimateDataRecord[] = [];

  const activeCard = container.querySelector('#active-dataset-card') as HTMLElement;
  const simBtn = container.querySelector('#btn-run-hybrid-simulation') as HTMLButtonElement;
  const simPeakKw = container.querySelector('#sim-peak-kw') as HTMLInputElement;
  const simPr = container.querySelector('#sim-pr') as HTMLInputElement;
  const simAlbedo = container.querySelector('#sim-albedo') as HTMLInputElement;
  const simTonc = container.querySelector('#sim-tonc') as HTMLInputElement;
  const statusBar = container.querySelector('#hybrid-status-bar') as HTMLElement;
  const resultsContainer = container.querySelector('#hybrid-simulation-results') as HTMLElement;

  // Initialize values from synchronized global state
  if (simPeakKw) simPeakKw.value = formatNum(solarSyncState.getPeakPowerKw(), 1);
  if (simTonc) simTonc.value = formatNum(solarSyncState.getTonc(), 1);

  // Real-time synchronization when typing into Climate Simulation Bar
  simPeakKw?.addEventListener('input', () => {
    const v = parseFloat(simPeakKw.value.replace(',', '.'));
    if (!isNaN(v) && v > 0) {
      solarSyncState.setPeakPowerKw(v, 'sim-panel');
    }
  });

  simTonc?.addEventListener('input', () => {
    const v = parseFloat(simTonc.value.replace(',', '.'));
    if (!isNaN(v) && v > 0) {
      solarSyncState.setTonc(v, 'sim-panel');
    }
  });

  // Listen to parameter updates coming from EnergyCalculationPanel
  window.addEventListener('orientsol:solar-params-updated', (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (!d || d.source === 'sim-panel') return;
    if (d.field === 'peakPowerKw' && simPeakKw && parseFloat(simPeakKw.value.replace(',', '.')) !== d.value) {
      simPeakKw.value = formatNum(d.value, 1);
    } else if (d.field === 'tonc' && simTonc && parseFloat(simTonc.value.replace(',', '.')) !== d.value) {
      simTonc.value = formatNum(d.value, 1);
    }
  });

  let currentActiveRecord: ClimateDataRecord = currentActiveRecordInit;

  // Tab switching
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (btn.disabled || btn.classList.contains('tab-disabled')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const tabKey = btn.getAttribute('data-tab') as 'historical' | 'manual' | 'upload' | 'api';
      cachedActiveTab = tabKey;
      Object.entries(tabContents).forEach(([key, el]) => {
        if (key === tabKey) el?.classList.remove('hidden');
        else el?.classList.add('hidden');
      });
    });
  });

  // Listen to external navigation triggers (e.g., from top navigation bar)
  const handleSwitchClimateTab = (e: Event) => {
    const customEvt = e as CustomEvent<'historical' | 'manual' | 'upload' | 'api'>;
    const targetKey = customEvt.detail;
    const btn = container.querySelector<HTMLButtonElement>(`.dual-tab-btn[data-tab="${targetKey}"]`);
    if (btn) {
      btn.click();
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  window.addEventListener('orientsol:switch-climate-tab', handleSwitchClimateTab);

  // Pedagogical Guide Modal Triggers (Tabs 1, 2, 3, 4)
  container.querySelectorAll<HTMLButtonElement>('.btn-pedagogical-guide').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabKey = (btn.getAttribute('data-pedagogical-tab') || 'historical') as 'historical' | 'manual' | 'upload' | 'api';
      openPedagogicalGuideModal(tabKey, isEn);
    });
  });

  // Satellite API City Presets
  const API_CITY_PRESETS = [
    { name: isEn ? 'Madrid (Spain)' : 'Madrid (España)', lat: 40.4168, lon: -3.7038 },
    { name: isEn ? 'Barcelona (Spain)' : 'Barcelona (España)', lat: 41.3879, lon: 2.1699 },
    { name: isEn ? 'Seville (Spain)' : 'Sevilla (España)', lat: 37.3891, lon: -5.9845 },
    { name: isEn ? 'Valencia (Spain)' : 'Valencia (España)', lat: 39.4699, lon: -0.3763 },
    { name: isEn ? 'Bilbao (Spain)' : 'Bilbao (España)', lat: 43.263, lon: -2.935 },
    { name: isEn ? 'Santa Cruz de Tenerife (Spain)' : 'Santa Cruz de Tenerife (España)', lat: 28.4636, lon: -16.2518 },
    { name: isEn ? 'Jaén (Spain)' : 'Jaén (España)', lat: 37.7796, lon: -3.7849 },
    { name: isEn ? 'Rome (Italy)' : 'Roma (Italia)', lat: 41.9028, lon: 12.4964 },
    { name: isEn ? 'Athens (Greece)' : 'Atenas (Grecia)', lat: 37.9838, lon: 23.7275 },
  ];

  apiCitySelect?.addEventListener('change', () => {
    const val = apiCitySelect.value;
    if (val !== 'custom') {
      const idx = parseInt(val, 10);
      const preset = API_CITY_PRESETS[idx];
      if (preset) {
        if (apiNameInput) apiNameInput.value = preset.name;
        apiLatInput.value = formatNum(preset.lat, 4);
        apiLonInput.value = formatNum(preset.lon, 4);
      }
    }
  });

  // Fetch Satellite Climate Data Handler
  apiFetchBtn?.addEventListener('click', async () => {
    const sourceKey = apiSourceSelect.value;
    const actualSource = sourceKey === 'nasa' ? 'nasa_power' : (sourceKey as any);
    const lat = parseFloat(apiLatInput.value.replace(',', '.'));
    const lon = parseFloat(apiLonInput.value.replace(',', '.'));

    const chosenName = apiNameInput ? apiNameInput.value.trim() : '';
    let locationName = chosenName || 'Coordenadas Personalizadas';
    if (!chosenName && apiCitySelect.value !== 'custom') {
      const idx = parseInt(apiCitySelect.value, 10);
      locationName = API_CITY_PRESETS[idx]?.name || locationName;
    }

    const srcName = actualSource === 'nasa_power' ? 'NASA POWER' : actualSource.toUpperCase();
    setStatus(isEn ? `Fetching data from ${srcName}...` : `Consultando datos climáticos desde ${srcName}...`, 'info');
    apiFetchBtn.disabled = true;

    try {
      const record = await fetchUnifiedClimateData({
        source: actualSource,
        latitude: lat,
        longitude: lon,
        locationName,
      });

      renderActiveRecord(record);
      apiSaveBtn.disabled = false;
      if (record.metadata?.pvgisEquivalent) {
        setStatus(
          isEn
            ? `✓ PVGIS Climate Data: Meteorological dataset retrieved successfully via PVGIS official ERA5 model for "${record.locationName}". Ready to calculate with Python motor.`
            : `✓ Datos climáticos oficiales PVGIS 5.3 (ERA5) obtenidos con éxito para "${record.locationName}". Listo para ejecutar en motor Python.`,
          'success'
        );
      } else {
        setStatus(
          isEn
            ? `✓ Satellite data retrieved successfully from ${srcName} for "${record.locationName}". Ready to calculate with Pyodide below.`
            : `✓ Datos satelitales obtenidos con éxito desde ${srcName} para "${record.locationName}". Listo para calcular con Pyodide en la barra inferior.`,
          'success'
        );
      }
    } catch (err: any) {
      console.error('[API Fetch Error]', err);
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'Error al consultar el servicio meteorológico externo.',
        'Error querying external meteorological service.'
      );
      setStatus(safeMsg, 'error');
    } finally {
      apiFetchBtn.disabled = false;
    }
  });

  // Save Satellite API Record to Supabase with Desired Name
  apiSaveBtn?.addEventListener('click', async () => {
    if (!currentActiveRecord) return;

    // Obtener identificador normalizado de la fuente satelital
    const sourceKey = apiSourceSelect ? apiSourceSelect.value : currentActiveRecord.source;
    let sourceTag = 'PVGIS';
    if (sourceKey === 'nasa' || sourceKey === 'nasa_power') {
      sourceTag = 'NASA_POWER';
    } else if (sourceKey === 'meteonorm') {
      sourceTag = 'OPEN_METEO';
    } else if (currentActiveRecord.source) {
      sourceTag = currentActiveRecord.source.toUpperCase();
    }

    // Timestamp solo de fecha en formato YYYY-MM-DD
    const dateStamp = new Date().toISOString().split('T')[0];

    // Formato requerido: _(NOMBREDESOURCE_TIMESTAMPSOLODEFECHA), ej: _(PVGIS_2026-10-24)
    const formattedApiEmplacementName = `_(${sourceTag}_${dateStamp})`;

    const recordToSave: ClimateDataRecord = {
      ...currentActiveRecord,
      locationName: formattedApiEmplacementName,
    };

    // Pre-validation: Stop upload and show error if empty or invalid
    const val = validateClimateRecordForSaving(recordToSave, isEn);
    if (!val.valid) {
      setStatus(`Error: ${val.error}`, 'error');
      return;
    }

    apiSaveBtn.disabled = true;
    setStatus(isEn ? 'Registering dataset in Supabase...' : 'Registrando emplazamiento en Supabase...', 'info');

    try {
      const reg = await climateDatabaseService.registerEmplacement(recordToSave);
      if (reg.isDuplicate) {
        setStatus(reg.message, 'warning');
      } else {
        if (apiNameInput) apiNameInput.value = formattedApiEmplacementName;
        renderActiveRecord(recordToSave);
        await updateSearchableStations();
        const uploadPermissionStatus = reg.isOffline
          ? (isEn ? 'Online upload NOT permitted (Offline Mode) → Stored in local cache.' : 'Carga Online a Supabase: NO PERMITIDA (Modo Offline) → Guardado en caché local para sincronizar después.')
          : (isEn ? 'Online upload to Supabase: PERMITTED → Emplacement successfully registered in datos_mensuales.' : 'Carga Online a Supabase: PERMITIDA → Emplazamiento registrado exitosamente en datos_mensuales.');
        setStatus(`${uploadPermissionStatus} ${reg.message}`, 'success');
      }
    } catch (err: any) {
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'No se pudo completar el registro en el servidor.',
        'Could not complete registration on the server.'
      );
      setStatus(`${isEn ? 'Error:' : 'Error:'} ${safeMsg}`, 'error');
    } finally {
      apiSaveBtn.disabled = false;
    }
  });

  function setStatus(msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    statusBar.textContent = msg;
    statusBar.className = `climate-status-bar status-${type}`;
  }

  function renderActiveRecord(record: ClimateDataRecord) {
    currentActiveRecord = record;
    cachedActiveRecord = record;
    const annualG = record.monthlyGdm0.reduce((a, b) => a + b, 0) / 12;
    const annualT = record.monthlyTemperature.reduce((a, b) => a + b, 0) / 12;

    const titleWithCountry = formatLocationWithCountry(record.locationName, record.country);

    const tagInfo = getLocationTagInfo(record);

    activeCard.innerHTML = `
      <div class="active-record-badge-bar">
        <div class="record-title-box">
          <h4>${escapeHtml(titleWithCountry)}</h4>
          <span class="suggestion-pill ${tagInfo.badgeClass}" style="margin: 0; font-size: 0.72rem; padding: 0.2rem 0.6rem; font-weight: 700; border-radius: 9999px;">${escapeHtml(tagInfo.statusTag)}</span>
        </div>
        <div class="record-meta-pills">
          <span><strong>${t.location.latitude}:</strong> ${formatNum(record.latitude, 3)}°</span>
          <span><strong>${t.location.longitude}:</strong> ${formatNum(record.longitude, 3)}°</span>
          <span><strong>G<sub>dm</sub>(0):</strong> ${formatNum(annualG, 2)} kWh/m²/d</span>
          <span><strong>T<sub>amb</sub>:</strong> ${formatNum(annualT, 1)} °C</span>
        </div>
      </div>

      <div class="monthly-table-wrapper" style="margin-top: 0.75rem;">
        <table class="climate-monthly-table">
          <thead>
            <tr>
              <th>${isEn ? 'Month' : 'Mes'}</th>
              ${MONTH_NAMES.map((m) => `<th>${m}</th>`).join('')}
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

  // 1. Historical & Supabase Station Live Similarity Search Actions
  let allSearchableStations: ClimateDataRecord[] = [];

  const getCityCoreKey = (name: string) =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/_?versionoriginal/gi, '')
      .replace(/\([^)]*\)/g, '')
      .split(/[-–—,]/)[0]
      .replace(/[^a-z0-9]/g, '')
      .trim();

  const extractYearFromName = (name: string): string | null => {
    const match = (name || '').match(/(19\d{2}|20\d{2})/);
    return match ? match[1] : null;
  };

  const isDuplicateStation = (a: ClimateDataRecord, b: ClimateDataRecord) => {
    const yearA = extractYearFromName(a.locationName);
    const yearB = extractYearFromName(b.locationName);
    // Si tienen años diferentes explícitos en el nombre (ej. Lima 2025 vs Lima 2026), representan series anuales distintas
    if (yearA && yearB && yearA !== yearB) {
      return false;
    }
    const keyA = getCityCoreKey(a.locationName);
    const keyB = getCityCoreKey(b.locationName);
    if (keyA && keyB && keyA === keyB) return true;
    const dLat = Math.abs(a.latitude - b.latitude);
    const dLon = Math.abs(a.longitude - b.longitude);
    return dLat < 0.05 && dLon < 0.05;
  };

  const updateSearchableStations = async () => {
    // 1. Fetch live datasets from Supabase (tabla datos_mensuales)
    let cloudList: ClimateDataRecord[] = [];
    try {
      cloudList = await climateDatabaseService.getClimateDatasets();
    } catch (e) {
      console.warn('[OrientSol] Could not fetch Supabase datasets for search:', e);
    }

    // 2. Fetch canonical official locations
    const historicalList = hybridClimateManager.getHistoricalLocations();

    // 3. Fetch local cache of user uploaded files and offline queue
    const uploadedCache = climateDatabaseService.getUploadedCache();
    const offlineQueue = climateDatabaseService.getOfflineQueue();

    const merged: ClimateDataRecord[] = [];

    // Prioridad 1: Emplazamientos sincronizados en Supabase y Catálogo OrientSol (siempre ORIENTSOL)
    for (const rec of cloudList) {
      if (!merged.some((existing) => isDuplicateStation(existing, rec))) {
        merged.push({
          ...rec,
          source: 'supabase',
          metadata: {
            ...rec.metadata,
            isOfficial: true,
          },
        });
      }
    }

    for (const rec of historicalList) {
      if (!merged.some((existing) => isDuplicateStation(existing, rec))) {
        merged.push({
          ...rec,
          source: 'local_database',
          metadata: {
            ...rec.metadata,
            isOfficial: true,
          },
        });
      }
    }

    // Prioridad 2: Emplazamientos aún no sincronizados (en caché local o cola offline) -> CACHÉ LOCAL
    for (const rec of [...uploadedCache, ...offlineQueue]) {
      if (!merged.some((existing) => isDuplicateStation(existing, rec))) {
        merged.push({
          ...rec,
          source: 'offline_cache' as any,
          metadata: {
            ...rec.metadata,
            isOfficial: false,
          },
        });
      }
    }

    allSearchableStations = merged;
  };

  // Dynamically sync Tab 4 (Satellite APIs) disabled status based on real-time internet connectivity
  function syncNetworkTabState(online: boolean) {
    const apiBtn = container.querySelector<HTMLButtonElement>('#dual-tab-btn-api');
    const apiText = container.querySelector('#tab-api-title-text');
    const apiOfflineAlert = container.querySelector('#tab4-offline-alert');
    const apiFetchBtn = container.querySelector<HTMLButtonElement>('#btn-fetch-satellite');
    const fileUploadPermissionBox = container.querySelector('#file-upload-permission-box');

    if (apiBtn) {
      if (!online) {
        apiBtn.disabled = true;
        apiBtn.classList.add('tab-disabled');
        apiBtn.title = isEn
          ? 'Internet connection required for satellite APIs'
          : 'Requiere conexión a Internet para consultar APIs satelitales (PVGIS / NASA)';
        if (apiText) {
          apiText.textContent = isEn
            ? '4. Satellite Query (Offline)'
            : '4. Consulta Satelital (Sin conexión)';
        }
        if (apiOfflineAlert) {
          apiOfflineAlert.classList.remove('hidden');
        }
        if (apiFetchBtn) {
          apiFetchBtn.disabled = true;
          apiFetchBtn.classList.add('disabled');
        }

        // If user is currently looking at Tab 4 (API) when internet cuts off, auto-switch to Tab 1 (Historical)
        if (cachedActiveTab === 'api') {
          const histBtn = container.querySelector<HTMLButtonElement>('.dual-tab-btn[data-tab="historical"]');
          if (histBtn) {
            histBtn.click();
          }
        }
      } else {
        apiBtn.disabled = false;
        apiBtn.classList.remove('tab-disabled');
        apiBtn.title = '';
        if (apiText) {
          apiText.textContent = isEn
            ? '4. Satellite Query (PVGIS / NASA)'
            : '4. Consulta Satelital (PVGIS / NASA)';
        }
        if (apiOfflineAlert) {
          apiOfflineAlert.classList.add('hidden');
        }
        if (apiFetchBtn) {
          apiFetchBtn.disabled = false;
          apiFetchBtn.classList.remove('disabled');
        }
      }
    }

    if (fileUploadPermissionBox) {
      fileUploadPermissionBox.innerHTML = renderSupabaseUploadBannerHtml(isEn);
    }
  }

  // Pre-load and re-sync on network state changes & database updates
  updateSearchableStations();
  syncNetworkTabState(climateDatabaseService.isOnline());

  climateDatabaseService.subscribe(() => {
    syncNetworkTabState(climateDatabaseService.isOnline());
    updateSearchableStations().then(() => {
      if (histSearchInput && histSearchInput.value.trim()) {
        performSearch(histSearchInput.value.trim());
      }
    });
  });

  window.addEventListener('online', () => {
    syncNetworkTabState(true);
    updateSearchableStations().then(() => {
      if (histSearchInput && histSearchInput.value.trim()) {
        performSearch(histSearchInput.value.trim());
      }
    });
  });

  window.addEventListener('offline', () => {
    syncNetworkTabState(false);
    updateSearchableStations().then(() => {
      if (histSearchInput && histSearchInput.value.trim()) {
        performSearch(histSearchInput.value.trim());
      }
    });
  });

  window.addEventListener('orientsol:network-changed', (e: Event) => {
    const detail = (e as CustomEvent)?.detail;
    syncNetworkTabState(detail?.isOnline ?? climateDatabaseService.isOnline());
  });

  function showNotFoundBanner(queryText: string) {
    histSuggestionsDropdown.classList.add('hidden');
    histNotFoundBanner.innerHTML = `
      <div class="search-alert-box alert-warning-box">
        <div class="alert-icon-wrap">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#f59e0b" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="alert-content-wrap">
          <p class="alert-text-msg">
            ${isEn
              ? `The location "<strong>${escapeHtml(queryText)}</strong>" is not saved in cache or in the database. If you wish, please fill in the manual entry.`
              : `El emplazamiento "<strong>${escapeHtml(queryText)}</strong>" no está guardado ni en caché ni en la base de datos. Si deseas, llena la introducción manual.`}
          </p>
          <button type="button" id="btn-goto-manual-tab" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            <span>${isEn ? 'Go to Manual Entry (Tab 2)' : 'Llenar Introducción Manual (Pestaña 2)'}</span>
          </button>
        </div>
      </div>
    `;
    histNotFoundBanner.classList.remove('hidden');

    const gotoBtn = histNotFoundBanner.querySelector<HTMLButtonElement>('#btn-goto-manual-tab');
    gotoBtn?.addEventListener('click', () => {
      const manualTabBtn = container.querySelector<HTMLButtonElement>('.dual-tab-btn[data-tab="manual"]');
      manualTabBtn?.click();
      if (manualName && queryText) {
        manualName.value = queryText;
      }
    });
  }

  function hideNotFoundBanner() {
    histNotFoundBanner.classList.add('hidden');
    histNotFoundBanner.innerHTML = '';
  }

  function getLocationTagInfo(loc: ClimateDataRecord): { badgeClass: string; badgeText: string; statusTag: string } {
    // 1. Si proviene de la base de datos Supabase, catálogo oficial o tiene isOfficial === true -> ORIENTSOL
    if (loc.source === 'supabase' || loc.source === 'local_database' || loc.metadata?.isOfficial === true) {
      return {
        badgeClass: 'badge-historical',
        badgeText: 'ORIENTSOL',
        statusTag: 'ORIENTSOL',
      };
    }

    // 2. Si aún no está sincronizado en Supabase y está en caché local / cola offline -> CACHÉ LOCAL
    return {
      badgeClass: 'badge-cache',
      badgeText: isEn ? 'LOCAL CACHE' : 'CACHÉ LOCAL',
      statusTag: isEn ? 'LOCAL CACHE' : 'CACHÉ LOCAL',
    };
  }

  function selectLocation(loc: ClimateDataRecord) {
    histSearchInput.value = loc.locationName;
    histSuggestionsDropdown.classList.add('hidden');
    hideNotFoundBanner();
    renderActiveRecord(loc);
    const tagInfo = getLocationTagInfo(loc);
    const displayTitle = formatLocationWithCountry(loc.locationName, loc.country);
    setStatus(
      isEn
        ? `Loaded station: ${displayTitle} [${tagInfo.statusTag}].`
        : `Cargada estación: ${displayTitle} [${tagInfo.statusTag}].`,
      'success'
    );
  }

  function performSearch(queryText: string) {
    const q = queryText.trim().toLowerCase();
    if (!q) {
      histSuggestionsDropdown.classList.add('hidden');
      hideNotFoundBanner();
      return;
    }

    // Filter case-insensitive similarity
    const rawMatches = allSearchableStations.filter((s) => {
      const name = s.locationName.toLowerCase();
      const country = (s.country || '').toLowerCase();
      return name.includes(q) || country.includes(q);
    });

    // Deduplicate matches so that only 1 station per city is displayed
    const matches: ClimateDataRecord[] = [];
    for (const m of rawMatches) {
      if (!matches.some((existing) => isDuplicateStation(existing, m))) {
        matches.push(m);
      }
    }

    if (matches.length > 0) {
      hideNotFoundBanner();
      histSuggestionsDropdown.innerHTML = `
        <div class="suggestions-header">
          <span>${isEn ? 'Similarities Found' : 'Similitudes Halladas'}: <strong>${matches.length}</strong></span>
          <span class="suggestions-hint">${isEn ? 'Click to select' : 'Haz clic para seleccionar'}</span>
        </div>
        <div class="suggestions-list">
          ${matches
            .map((m) => {
              const tagInfo = getLocationTagInfo(m);
              const badgeClass = tagInfo.badgeClass;
              const badgeText = tagInfo.badgeText;
              const annualG = m.monthlyGdm0.reduce((a, b) => a + b, 0) / 12;
              const cStr = (m.country || '').trim();
              const hasParenCountry = /\([^)]+\)$/.test(m.locationName.trim()) || (Boolean(cStr) && m.locationName.toLowerCase().includes(cStr.toLowerCase()));
              const countryBadge = cStr && !hasParenCountry ? `<span class="suggestion-country">(${escapeHtml(cStr)})</span>` : '';
              return `
                <div class="suggestion-item" data-id="${escapeAttr(m.id || m.locationName)}" role="option">
                  <div class="suggestion-main">
                    <span class="suggestion-name"><strong>${escapeHtml(m.locationName)}</strong></span>
                    ${countryBadge}
                    <span class="suggestion-pill ${badgeClass}">${badgeText}</span>
                  </div>
                  <div class="suggestion-meta">
                    <span>Lat: ${formatNum(m.latitude, 2)}°</span>
                    <span>Lon: ${formatNum(m.longitude, 2)}°</span>
                    <span>G<sub>dm</sub>(0): ${formatNum(annualG, 2)} kWh/m²/d</span>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
      histSuggestionsDropdown.classList.remove('hidden');

      histSuggestionsDropdown.querySelectorAll<HTMLElement>('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const found = allSearchableStations.find((s) => s.id === id || s.locationName === id);
          if (found) {
            selectLocation(found);
          }
        });
      });
    } else {
      // No similarities found!
      showNotFoundBanner(queryText.trim());
    }
  }

  // Open suggestions on input focus if text exists
  histSearchInput.addEventListener('focus', () => {
    if (histSearchInput.value.trim()) {
      performSearch(histSearchInput.value.trim());
    }
  });

  // Input event: case-insensitive letters, numbers, and common punctuation
  histSearchInput.addEventListener('input', (e) => {
    const inp = e.target as HTMLInputElement;
    const raw = inp.value;
    const sanitized = raw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\-_()]/g, '');
    if (sanitized !== raw) {
      inp.value = sanitized;
    }
    performSearch(sanitized);
  });

  const handleSaveOrSelectAction = () => {
    const raw = histSearchInput.value.trim();
    const q = raw.toLowerCase();
    if (!q) {
      return;
    }

    // Strict matching check
    const exact = allSearchableStations.find((s) => s.locationName.trim().toLowerCase() === q);
    const partial = !exact && allSearchableStations.find((s) => s.locationName.trim().toLowerCase().startsWith(q));
    const toSelect = exact || partial;

    if (!toSelect) {
      // EN CASO DE NO HALLARLO:
      // ASI PONGAS ENTER PARA GUARDAR NO DEBE DEJARTE HACER ABSOLUTAMENTE NADA.
      // SOLO MOSTRARTE EL MENSAJE DE QUE EL EMPLAZAMIENTO NO ESTA GUARDADO NI EN CACHE NI EN LA BASE DE DATOS Y QUE SI DESEAS LLENA LA INTRODUCCION MANUAL.
      showNotFoundBanner(raw);
      histSearchInput.classList.add('input-error-shake');
      setTimeout(() => histSearchInput.classList.remove('input-error-shake'), 600);
      return;
    }

    // Found: load and select
    selectLocation(toSelect);
  };

  histSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSaveOrSelectAction();
    }
  });

  useHistBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleSaveOrSelectAction();
  });

  // ==========================================================================
  // TAB 3: STATION SELECTOR, DROP-DOWN & DETECTED PILLS LOGIC
  // ==========================================================================
  function showTab3NotFoundBanner(queryText: string) {
    if (!tab3SuggestionsDropdown || !tab3NotFoundBanner) return;
    tab3SuggestionsDropdown.classList.add('hidden');
    tab3NotFoundBanner.innerHTML = `
      <div class="search-alert-box alert-warning-box">
        <div class="alert-icon-wrap">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#f59e0b" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="alert-content-wrap">
          <p class="alert-text-msg">
            ${isEn
              ? `The location "<strong>${escapeHtml(queryText)}</strong>" is not saved in cache or in the database.`
              : `El emplazamiento "<strong>${escapeHtml(queryText)}</strong>" no está guardado ni en caché ni en la base de datos.`}
          </p>
        </div>
      </div>
    `;
    tab3NotFoundBanner.classList.remove('hidden');
  }

  function hideTab3NotFoundBanner() {
    if (!tab3NotFoundBanner) return;
    tab3NotFoundBanner.classList.add('hidden');
    tab3NotFoundBanner.innerHTML = '';
  }

  function selectTab3Location(loc: ClimateDataRecord) {
    if (tab3SearchInput) tab3SearchInput.value = loc.locationName;
    if (histSearchInput) histSearchInput.value = loc.locationName;
    if (tab3SuggestionsDropdown) tab3SuggestionsDropdown.classList.add('hidden');
    hideTab3NotFoundBanner();
    renderActiveRecord(loc);
    updateTab3ActivePill(loc.locationName);
    const tagInfo = getLocationTagInfo(loc);
    const displayTitle = formatLocationWithCountry(loc.locationName, loc.country);
    setStatus(
      isEn
        ? `Loaded station: ${displayTitle} [${tagInfo.statusTag}]. Ready to run calculations below.`
        : `Cargada estación: ${displayTitle} [${tagInfo.statusTag}]. Lista para ejecutar cálculos en la barra inferior.`,
      'success'
    );
  }

  function performTab3Search(queryText: string) {
    if (!tab3SuggestionsDropdown) return;
    const q = queryText.trim().toLowerCase();

    const rawMatches = q
      ? allSearchableStations.filter((s) => {
          const name = s.locationName.toLowerCase();
          const country = (s.country || '').toLowerCase();
          return name.includes(q) || country.includes(q);
        })
      : allSearchableStations;

    const matches: ClimateDataRecord[] = [];
    for (const m of rawMatches) {
      if (!matches.some((existing) => isDuplicateStation(existing, m))) {
        matches.push(m);
      }
    }

    if (matches.length > 0) {
      hideTab3NotFoundBanner();
      tab3SuggestionsDropdown.innerHTML = `
        <div class="suggestions-header">
          <span>${isEn ? 'Stations Found' : 'Emplazamientos Hallados'}: <strong>${matches.length}</strong></span>
          <span class="suggestions-hint">${isEn ? 'Click to select & calculate' : 'Haz clic para seleccionar y simular'}</span>
        </div>
        <div class="suggestions-list">
          ${matches
            .slice(0, 30)
            .map((m) => {
              const tagInfo = getLocationTagInfo(m);
              const badgeClass = tagInfo.badgeClass;
              const badgeText = tagInfo.badgeText;
              const annualG = m.monthlyGdm0.reduce((a, b) => a + b, 0) / 12;
              const cStr = (m.country || '').trim();
              const hasParenCountry = /\([^)]+\)$/.test(m.locationName.trim()) || (Boolean(cStr) && m.locationName.toLowerCase().includes(cStr.toLowerCase()));
              const countryBadge = cStr && !hasParenCountry ? `<span class="suggestion-country">(${escapeHtml(cStr)})</span>` : '';
              return `
                <div class="suggestion-item" data-id="${escapeAttr(m.id || m.locationName)}" role="option">
                  <div class="suggestion-main">
                    <span class="suggestion-name"><strong>${escapeHtml(m.locationName)}</strong></span>
                    ${countryBadge}
                    <span class="suggestion-pill ${badgeClass}">${badgeText}</span>
                  </div>
                  <div class="suggestion-meta">
                    <span>Lat: ${formatNum(m.latitude, 2)}°</span>
                    <span>Lon: ${formatNum(m.longitude, 2)}°</span>
                    <span>G<sub>dm</sub>(0): ${formatNum(annualG, 2)} kWh/m²/d</span>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
      tab3SuggestionsDropdown.classList.remove('hidden');

      tab3SuggestionsDropdown.querySelectorAll<HTMLElement>('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const found = allSearchableStations.find((s) => s.id === id || s.locationName === id);
          if (found) {
            selectTab3Location(found);
          }
        });
      });
    } else {
      showTab3NotFoundBanner(queryText.trim());
    }
  }

  function renderTab3DetectedPills(records: ClimateDataRecord[]) {
    if (!tab3DetectedPillsContainer || !tab3DetectedPills) return;
    if (!records || records.length === 0) {
      tab3DetectedPillsContainer.classList.add('hidden');
      return;
    }

    tab3DetectedPills.innerHTML = records
      .map((rec) => {
        const latest = allSearchableStations.find((s) => s.locationName.trim().toLowerCase() === rec.locationName.trim().toLowerCase()) || rec;
        const tagInfo = getLocationTagInfo(latest);
        const isActive = currentActiveRecord && currentActiveRecord.locationName.trim().toLowerCase() === rec.locationName.trim().toLowerCase();
        return `
          <button type="button" class="tab3-pill-btn ${isActive ? 'active' : ''}" data-name="${escapeAttr(rec.locationName)}">
            <span>${escapeHtml(rec.locationName)}</span>
            <span class="suggestion-pill ${tagInfo.badgeClass}" style="margin: 0; font-size: 0.68rem; padding: 0.15rem 0.45rem; font-weight: 700; border-radius: 9999px;">${escapeHtml(tagInfo.statusTag)}</span>
          </button>
        `;
      })
      .join('');

    tab3DetectedPillsContainer.classList.remove('hidden');

    tab3DetectedPills.querySelectorAll<HTMLButtonElement>('.tab3-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        if (!name) return;
        const found = allSearchableStations.find((s) => s.locationName.trim().toLowerCase() === name.trim().toLowerCase()) || records.find((r) => r.locationName === name);
        if (found) {
          selectTab3Location(found);
        }
      });
    });
  }

  function updateTab3ActivePill(locationName: string) {
    if (!tab3DetectedPills) return;
    const target = locationName.trim().toLowerCase();
    tab3DetectedPills.querySelectorAll<HTMLButtonElement>('.tab3-pill-btn').forEach((btn) => {
      const btnName = (btn.dataset.name || '').trim().toLowerCase();
      if (btnName === target) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  const handleTab3SaveOrSelectAction = () => {
    if (!tab3SearchInput) return;
    const raw = tab3SearchInput.value.trim();
    const q = raw.toLowerCase();
    if (!q) return;

    const exact = allSearchableStations.find((s) => s.locationName.trim().toLowerCase() === q);
    const partial = !exact && allSearchableStations.find((s) => s.locationName.trim().toLowerCase().startsWith(q));
    const toSelect = exact || partial;

    if (!toSelect) {
      showTab3NotFoundBanner(raw);
      tab3SearchInput.classList.add('input-error-shake');
      setTimeout(() => tab3SearchInput.classList.remove('input-error-shake'), 600);
      return;
    }

    selectTab3Location(toSelect);
  };

  if (tab3SearchInput) {
    tab3SearchInput.addEventListener('focus', () => {
      performTab3Search(tab3SearchInput.value.trim());
    });

    tab3SearchInput.addEventListener('input', (e) => {
      const inp = e.target as HTMLInputElement;
      const raw = inp.value;
      const sanitized = raw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\-_()]/g, '');
      if (sanitized !== raw) {
        inp.value = sanitized;
      }
      performTab3Search(sanitized);
    });

    tab3SearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleTab3SaveOrSelectAction();
      }
    });
  }

  if (tab3UseStationBtn) {
    tab3UseStationBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleTab3SaveOrSelectAction();
    });
  }

  // Close suggestions if user clicks outside
  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    if (!container.contains(target)) {
      histSuggestionsDropdown.classList.add('hidden');
      if (tab3SuggestionsDropdown) tab3SuggestionsDropdown.classList.add('hidden');
    } else {
      if (tab3SuggestionsDropdown && tab3StationSelectorBox && !tab3StationSelectorBox.contains(target)) {
        tab3SuggestionsDropdown.classList.add('hidden');
      }
    }
  });

  // 2. Manual Form Actions
  applyTemplateBtn.addEventListener('click', () => {
    const locId = manualTemplateSelect.value;
    if (!locId) return;
    const rec = hybridClimateManager.getHistoricalLocationById(locId);
    if (!rec) return;

    manualName.value = `${rec.locationName} (Manual)`;
    manualLat.value = formatNum(rec.latitude, 3);
    manualLon.value = formatNum(rec.longitude, 3);
    manualElev.value = formatInt(rec.elevationM ?? 0);

    const gInputs = container.querySelectorAll<HTMLInputElement>('.manual-g-input');
    const tInputs = container.querySelectorAll<HTMLInputElement>('.manual-t-input');
    gInputs.forEach((inp, idx) => {
      if (rec.monthlyGdm0[idx] !== undefined) inp.value = formatNum(rec.monthlyGdm0[idx], 2);
    });
    tInputs.forEach((inp, idx) => {
      if (rec.monthlyTemperature[idx] !== undefined) inp.value = formatNum(rec.monthlyTemperature[idx], 1);
    });

    setStatus(isEn ? `Template "${rec.locationName}" applied to form.` : `Plantilla "${rec.locationName}" aplicada al formulario.`, 'info');
  });

  function highlightErrorInput(input: HTMLElement) {
    input.classList.remove('input-error-shake');
    void input.offsetWidth;
    input.classList.add('input-error-shake');
    input.focus();
    setTimeout(() => input.classList.remove('input-error-shake'), 1200);
  }

  function setupNumericLock(
    input: HTMLInputElement,
    options: {
      allowNegative?: boolean;
      min?: number;
      max?: number;
      labelName: string;
      decimals?: number;
    }
  ) {
    const { allowNegative = false, min, max, labelName, decimals } = options;

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (
        ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
          e.key
        )
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        return;
      }

      if (allowNegative && (e.key === '-' || e.key === 'Subtract')) {
        const selStart = input.selectionStart ?? 0;
        if (selStart === 0 && !input.value.includes('-')) {
          return;
        }
      }

      if (e.key === '.' || e.key === ',') {
        const val = input.value.replace(/\./g, ',');
        if (!val.includes(',')) {
          return;
        }
      }

      e.preventDefault();
    });

    input.addEventListener('input', () => {
      // Normalize dot to comma for standard decimal display
      const raw = input.value.replace(/\./g, ',');
      let sanitized = '';
      let hasComma = false;
      let hasMinus = false;

      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch >= '0' && ch <= '9') {
          sanitized += ch;
        } else if (allowNegative && ch === '-' && i === 0 && !hasMinus) {
          sanitized += ch;
          hasMinus = true;
        } else if (ch === ',' && !hasComma) {
          sanitized += ch;
          hasComma = true;
        }
      }

      if (input.value !== sanitized) {
        input.value = sanitized;
      }
    });

    input.addEventListener('blur', () => {
      const v = input.value.trim();
      if (!v) {
        highlightErrorInput(input);
        setStatus(
          isEn
            ? `"${labelName}" cannot be empty. Please enter a valid number.`
            : `"${labelName}" no puede estar vacío. Introduce un valor numérico.`,
          'warning'
        );
      } else {
        const num = parseFloat(v.replace(',', '.'));
        if (isNaN(num)) {
          highlightErrorInput(input);
          setStatus(
            isEn
              ? `"${labelName}" contains invalid characters.`
              : `"${labelName}" contiene caracteres no válidos.`,
            'warning'
          );
        } else if (min !== undefined && num < min) {
          highlightErrorInput(input);
          setStatus(
            isEn
              ? `"${labelName}" cannot be lower than ${formatNum(min, min % 1 === 0 ? 0 : 2)}.`
              : `"${labelName}" no puede ser menor que ${formatNum(min, min % 1 === 0 ? 0 : 2)}.`,
            'warning'
          );
        } else if (max !== undefined && num > max) {
          highlightErrorInput(input);
          setStatus(
            isEn
              ? `"${labelName}" cannot exceed ${formatNum(max, max % 1 === 0 ? 0 : 2)}.`
              : `"${labelName}" no puede ser mayor que ${formatNum(max, max % 1 === 0 ? 0 : 2)}.`,
            'warning'
          );
        } else if (decimals !== undefined) {
          input.value = formatNum(num, decimals);
        }
      }
    });
  }

  // Attach locks to all manual numeric inputs
  setupNumericLock(manualLat, { allowNegative: true, min: -90, max: 90, labelName: isEn ? 'Latitude' : 'Latitud', decimals: 3 });
  setupNumericLock(manualLon, { allowNegative: true, min: -180, max: 180, labelName: isEn ? 'Longitude' : 'Longitud', decimals: 3 });
  setupNumericLock(manualAlbedo, { allowNegative: false, min: 0.0, max: 1.0, labelName: isEn ? 'Ground Albedo' : 'Albedo del Suelo', decimals: 2 });

  // Attach lock to location name
  manualName.addEventListener('keydown', (e: KeyboardEvent) => {
    if (['<', '>', '{', '}', '$', ';', '"', '\\', '`'].includes(e.key)) {
      e.preventDefault();
    }
  });
  manualName.addEventListener('input', () => {
    const raw = manualName.value;
    const sanitized = raw.replace(/[<>{}\$;"\\`]/g, '');
    if (raw !== sanitized) {
      manualName.value = sanitized;
    }
  });
  manualName.addEventListener('blur', () => {
    if (!manualName.value.trim()) {
      highlightErrorInput(manualName);
      setStatus(
        isEn
          ? 'Location name cannot be empty.'
          : 'El nombre de localización no puede estar vacío.',
        'warning'
      );
    }
  });

  const manualGInputs = container.querySelectorAll<HTMLInputElement>('.manual-g-input');
  const manualTInputs = container.querySelectorAll<HTMLInputElement>('.manual-t-input');

  manualGInputs.forEach((inp, idx) => {
    setupNumericLock(inp, {
      allowNegative: false,
      min: 0.01,
      max: 25.0,
      labelName: `Gdm(0) [${MONTH_NAMES[idx]}]`,
      decimals: 2,
    });
  });

  manualTInputs.forEach((inp, idx) => {
    setupNumericLock(inp, {
      allowNegative: true,
      min: -50.0,
      max: 65.0,
      labelName: `Tamb [${MONTH_NAMES[idx]}]`,
      decimals: 1,
    });
  });

  if (apiLatInput) setupNumericLock(apiLatInput, { allowNegative: true, min: -90, max: 90, labelName: isEn ? 'Latitude' : 'Latitud', decimals: 4 });
  if (apiLonInput) setupNumericLock(apiLonInput, { allowNegative: true, min: -180, max: 180, labelName: isEn ? 'Longitude' : 'Longitud', decimals: 4 });
  if (simPeakKw) setupNumericLock(simPeakKw, { allowNegative: false, min: 0.1, max: 5000.0, labelName: isEn ? 'Peak Power' : 'Potencia Pico', decimals: 1 });
  if (simPr) setupNumericLock(simPr, { allowNegative: false, min: 0.1, max: 1.0, labelName: isEn ? 'Performance Ratio' : 'Performance Ratio', decimals: 2 });
  if (simAlbedo) setupNumericLock(simAlbedo, { allowNegative: false, min: 0.0, max: 1.0, labelName: isEn ? 'Ground Albedo' : 'Albedo del Suelo', decimals: 2 });
  if (simTonc) setupNumericLock(simTonc, { allowNegative: false, min: 20.0, max: 80.0, labelName: isEn ? 'NOCT / TONC' : 'TONC', decimals: 1 });

  function validateManualFormInputs(): ManualClimateInput | null {
    const name = manualName.value.trim();
    if (!name) {
      highlightErrorInput(manualName);
      setStatus(
        isEn ? 'Error: Location Name cannot be empty or invalid.' : 'Error: El Nombre de Localización no puede estar vacío.',
        'error'
      );
      return null;
    }

    const latRaw = manualLat.value.trim().replace(',', '.');
    const lat = parseFloat(latRaw);
    if (!latRaw || isNaN(lat) || lat < -90 || lat > 90) {
      highlightErrorInput(manualLat);
      setStatus(
        isEn
          ? 'Error: Latitude is empty or invalid (must be between -90° and +90°).'
          : 'Error: La Latitud está vacía o es inválida (debe ser un número entre -90° y +90°).',
        'error'
      );
      return null;
    }

    const lonRaw = manualLon.value.trim().replace(',', '.');
    const lon = parseFloat(lonRaw);
    if (!lonRaw || isNaN(lon) || lon < -180 || lon > 180) {
      highlightErrorInput(manualLon);
      setStatus(
        isEn
          ? 'Error: Longitude is empty or invalid (must be between -180° and +180°).'
          : 'Error: La Longitud está vacía o es inválida (debe ser un número entre -180° y +180°).',
        'error'
      );
      return null;
    }

    const albedoRaw = manualAlbedo.value.trim().replace(',', '.');
    const albedo = parseFloat(albedoRaw);
    if (!albedoRaw || isNaN(albedo) || albedo < 0 || albedo > 1) {
      highlightErrorInput(manualAlbedo);
      setStatus(
        isEn
          ? `Error: Ground Albedo is empty or invalid (must be between ${formatNum(0, 2)} and ${formatNum(1, 2)}).`
          : `Error: El Albedo del suelo está vacío o es inválido (debe ser un número entre ${formatNum(0, 2)} y ${formatNum(1, 2)}).`,
        'error'
      );
      return null;
    }

    const gdm0: number[] = [];
    const temp: number[] = [];

    for (let i = 0; i < 12; i++) {
      const gRaw = (manualGInputs[i]?.value.trim() ?? '').replace(',', '.');
      const gVal = parseFloat(gRaw);
      if (!gRaw || isNaN(gVal) || gVal <= 0 || gVal > 30) {
        if (manualGInputs[i]) highlightErrorInput(manualGInputs[i]);
        setStatus(
          isEn
            ? `Error: Radiation Gdm(0) for ${MONTH_NAMES[i]} cannot be empty, negative or zero.`
            : `Error: La radiación Gdm(0) para ${MONTH_NAMES[i]} no puede estar vacía, contener letras ni ser ≤ 0.`,
          'error'
        );
        return null;
      }
      gdm0.push(gVal);

      const tRaw = (manualTInputs[i]?.value.trim() ?? '').replace(',', '.');
      const tVal = parseFloat(tRaw);
      if (!tRaw || isNaN(tVal) || tVal < -50 || tVal > 65) {
        if (manualTInputs[i]) highlightErrorInput(manualTInputs[i]);
        setStatus(
          isEn
            ? `Error: Temperature Tamb for ${MONTH_NAMES[i]} cannot be empty or outside [-50°C, 65°C].`
            : `Error: La temperatura Tamb para ${MONTH_NAMES[i]} no puede estar vacía, contener letras ni estar fuera de rango [-50°C, 65°C].`,
          'error'
        );
        return null;
      }
      temp.push(tVal);
    }

    return {
      locationName: name,
      latitude: lat,
      longitude: lon,
      elevationM: parseFloat(manualElev.value) || 0,
      country: 'Personalizado',
      albedo,
      monthlyGdm0: gdm0,
      monthlyTemperature: temp,
    };
  }

  validateManualBtn.addEventListener('click', () => {
    const rawRecord = validateManualFormInputs();
    if (!rawRecord) return;

    try {
      const rec = hybridClimateManager.setManualData(rawRecord);
      renderActiveRecord(rec);
      setStatus(
        isEn
          ? `✓ Manual dataset applied for "${rec.locationName}". You can simulate or click "Save to Supabase".`
          : `✓ Datos manuales aplicados para "${rec.locationName}". Puedes simular o hacer clic en "Guardar en Supabase".`,
        'success'
      );
    } catch (err: any) {
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'Los parámetros introducidos no son válidos.',
        'The entered parameters are invalid.'
      );
      setStatus(safeMsg, 'error');
    }
  });

  saveManualBtn?.addEventListener('click', async () => {
    const rawRecord = validateManualFormInputs();
    if (!rawRecord) return;

    saveManualBtn.disabled = true;
    setStatus(isEn ? 'Saving manual emplacement to Supabase...' : 'Guardando emplazamiento manual en Supabase...', 'info');

    try {
      const rec = hybridClimateManager.setManualData(rawRecord);
      renderActiveRecord(rec);

      const reg = await climateDatabaseService.registerEmplacement(rec);
      if (reg.isDuplicate) {
        setStatus(reg.message, 'warning');
      } else {
        await updateSearchableStations();
        const updated = allSearchableStations.find((s) => s.locationName.trim().toLowerCase() === rec.locationName.trim().toLowerCase());
        if (updated) {
          renderActiveRecord(updated);
        }
        const uploadPermissionStatus = reg.isOffline
          ? (isEn ? 'Online upload NOT permitted (Offline Mode) → Stored in local cache.' : 'Carga Online a Supabase: NO PERMITIDA (Modo Offline) → Guardado en caché local para sincronizar después.')
          : (isEn ? 'Online upload to Supabase: PERMITTED → Emplacement successfully registered in datos_mensuales.' : 'Carga Online a Supabase: PERMITIDA → Emplazamiento registrado exitosamente en datos_mensuales.');
        setStatus(`${uploadPermissionStatus} ${reg.message}`, 'success');
      }
    } catch (err: any) {
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'No se pudo completar el registro en el servidor.',
        'Could not complete registration on the server.'
      );
      setStatus(`${isEn ? 'Error:' : 'Error:'} ${safeMsg}`, 'error');
    } finally {
      saveManualBtn.disabled = false;
    }
  });

  // 3. File Upload Actions
  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setStatus(isEn ? `Reading file "${file.name}"...` : `Leyendo archivo "${file.name}"...`, 'info');

    hybridClimateManager
      .parseUploadedClimateFile(file)
      .then(async ({ record, records }) => {
        const listToRegister = records && records.length > 0 ? records : [record];
        pendingUploadedRecords = listToRegister;

        // 1. Guardar de inmediato en la caché local para que los emplazamientos subidos
        // estén disponibles instantáneamente en la búsqueda de la Pestaña 1
        climateDatabaseService.saveUploadedCache(listToRegister);
        await updateSearchableStations();

        // 2. Renderizar el registro activo mostrando únicamente [CACHÉ LOCAL]
        renderActiveRecord(record);

        // Mostrar el selector de estación en Tab 3 y actualizar las píldoras de estaciones detectadas
        if (tab3StationSelectorBox) {
          tab3StationSelectorBox.classList.remove('hidden');
        }
        if (tab3SearchInput) {
          tab3SearchInput.value = record.locationName;
        }
        renderTab3DetectedPills(listToRegister);

        const isOnline = Boolean(typeof navigator !== 'undefined' ? navigator.onLine : true) && climateDatabaseService.isOnline();
        const stationNames = listToRegister.map((r) => r.locationName).join(', ');

        // Reset previous success card
        if (uploadSuccessCard) {
          uploadSuccessCard.classList.add('hidden');
          uploadSuccessCard.innerHTML = '';
        }

        // Render Staging Card with single, prominent "Cargar a Base de Datos" button
        if (uploadStagingCard) {
          uploadStagingCard.innerHTML = `
            <div class="staging-box-content">
              <div class="staging-header">
                <div class="staging-file-info">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  <div>
                    <div class="staging-filename">${escapeHtml(file.name)}</div>
                    <div class="staging-meta">
                      ${listToRegister.length} ${isEn ? 'station(s) ready' : 'emplazamiento(s) detectado(s)'}: <strong>${escapeHtml(stationNames)}</strong>
                    </div>
                  </div>
                </div>
                <div class="staging-status-badge ${isOnline ? 'badge-online' : 'badge-offline'}">
                  ${isOnline 
                    ? (isEn ? '● Online Mode: Supabase DB' : '● Conexión Nube: Supabase DB') 
                    : (isEn ? '● Offline Mode: Local Cache' : '● Modo Offline: Caché Local')}
                </div>
              </div>
              <div class="staging-actions">
                <button type="button" id="btn-staging-save-db" class="btn btn-solar btn-lg" style="gap: 0.55rem; font-weight: 700;">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                  </svg>
                  <span>${isOnline ? (isEn ? 'Upload to Database (Cloud)' : 'Cargar a Base de Datos (Nube)') : (isEn ? 'Save to Local Cache' : 'Guardar en Caché Local')}</span>
                </button>
              </div>
            </div>
          `;
          uploadStagingCard.classList.remove('hidden');

          const stagingBtn = uploadStagingCard.querySelector<HTMLButtonElement>('#btn-staging-save-db');
          stagingBtn?.addEventListener('click', async () => {
            await executeSaveUpload(stagingBtn);
          });
        }

        setStatus(
          isEn
            ? `✓ File "${file.name}" cached locally (${listToRegister.length} station${listToRegister.length > 1 ? 's' : ''}). Available now in Tab 1 under [LOCAL CACHE], or click "Upload to Database" to sync to Supabase.`
            : `✓ Archivo "${file.name}" guardado en caché local (${listToRegister.length} emplazamiento${listToRegister.length > 1 ? 's' : ''}). Disponible en Pestaña 1 como [CACHÉ LOCAL], o pulsa "Cargar a Base de Datos" para subir a Supabase.`,
          'info'
        );
      })
      .catch((err: any) => {
        console.error('[Upload Error]', err);
        setStatus(`Error de lectura: ${err.message}`, 'error');
      });
  }

  async function executeSaveUpload(triggerBtn?: HTMLButtonElement) {
    if (!pendingUploadedRecords || pendingUploadedRecords.length === 0) {
      setStatus(isEn ? 'No uploaded climate records to save.' : 'No hay registros cargados para guardar.', 'error');
      return;
    }

    // Validate all records before saving
    for (const item of pendingUploadedRecords) {
      const val = validateClimateRecordForSaving(item, isEn);
      if (!val.valid) {
        setStatus(`Error en "${item.locationName || 'Sin Nombre'}": ${val.error}`, 'error');
        return;
      }
    }

    if (triggerBtn) triggerBtn.disabled = true;
    setStatus(isEn ? 'Registering uploaded dataset in database...' : 'Registrando dataset en la Base de Datos...', 'info');

    try {
      let dupsCount = 0;
      let newCount = 0;
      let warningMsg = '';

      for (const item of pendingUploadedRecords) {
        const reg = await climateDatabaseService.registerEmplacement(item);
        if (reg.isDuplicate) {
          dupsCount++;
          warningMsg = reg.message;
        } else {
          newCount++;
        }
      }

      const isOnline = Boolean(typeof navigator !== 'undefined' ? navigator.onLine : true) && climateDatabaseService.isOnline();
      const savedNames = pendingUploadedRecords.map((r) => r.locationName);
      const primaryStationName = savedNames[0] || '';

      if (isOnline) {
        // Una vez sincronizados exitosamente en Supabase (datos_mensuales),
        // se retiran de la caché de subidas pendientes y pasan a formar parte de ORIENTSOL
        climateDatabaseService.removeUploadedCache(savedNames);
      } else {
        climateDatabaseService.saveUploadedCache(pendingUploadedRecords);
      }
      await updateSearchableStations();

      // Actualizar de inmediato la tarjeta activa para que refleje la etiqueta [ORIENTSOL]
      if (primaryStationName) {
        const found = allSearchableStations.find((s) => s.locationName.trim().toLowerCase() === primaryStationName.trim().toLowerCase());
        if (found) {
          renderActiveRecord(found);
        }
      }

      // Actualizar el selector en la Pestaña 3 y reflejar el estado oficial [ORIENTSOL] en las píldoras
      if (tab3StationSelectorBox) {
        tab3StationSelectorBox.classList.remove('hidden');
      }
      if (tab3SearchInput && primaryStationName) {
        tab3SearchInput.value = primaryStationName;
      }
      renderTab3DetectedPills(pendingUploadedRecords);

      // Hide staging card
      if (uploadStagingCard) {
        uploadStagingCard.classList.add('hidden');
      }

      // Render Success Card with prominent redirect button to Tab 1
      if (uploadSuccessCard) {
        uploadSuccessCard.innerHTML = `
          <div class="success-card-inner">
            <div class="success-card-top">
              <div class="success-icon-bubble">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#10b981" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div class="success-card-text">
                <h4>${isEn ? 'Dataset Successfully Saved!' : '¡Emplazamientos Registrados con Éxito!'}</h4>
                <p class="success-detail">
                  ${isOnline 
                    ? (isEn 
                        ? `Synchronized with Supabase cloud database (datos_mensuales): <strong>${escapeHtml(savedNames.join(', '))}</strong>.` 
                        : `Se han sincronizado correctamente en la Base de Datos oficial (Supabase, tabla datos_mensuales): <strong>${escapeHtml(savedNames.join(', '))}</strong>.`)
                    : (isEn 
                        ? `Saved in local browser cache: <strong>${escapeHtml(savedNames.join(', '))}</strong> (pending cloud synchronization when online).` 
                        : `Se han guardado en Caché Local del navegador: <strong>${escapeHtml(savedNames.join(', '))}</strong> (se sincronizarán con Supabase al recuperar la conexión).`)
                  }
                </p>
                <p class="success-instruction">
                  ${isEn
                    ? (isOnline
                        ? 'All datasets are now officially integrated in the database and visible in Tab 1 under [ORIENTSOL].'
                        : 'All datasets are temporarily saved in local browser cache tagged with [LOCAL CACHE].')
                    : (isOnline
                        ? 'Todos los datos están ahora integrados en la Base de Datos oficial y disponibles en la Pestaña 1 con la etiqueta [ORIENTSOL].'
                        : 'Todos los datos están guardados temporalmente en la caché local identificados con la etiqueta [CACHÉ LOCAL].')
                  }
                </p>
              </div>
            </div>
            <div class="success-card-actions">
              <button type="button" id="btn-redirect-to-official-catalog" class="btn btn-primary btn-lg" style="gap: 0.6rem; font-weight: 700;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>${isEn ? 'Go to Tab 1 (Official Catalog) and View in Dropdown' : 'Ir a Pestaña 1 (Catálogo Oficial) y Ver en Desplegable'}</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
            </div>
          </div>
        `;
        uploadSuccessCard.classList.remove('hidden');

        const redirectBtn = uploadSuccessCard.querySelector<HTMLButtonElement>('#btn-redirect-to-official-catalog');
        redirectBtn?.addEventListener('click', () => {
          const histTabBtn = container.querySelector<HTMLButtonElement>('.dual-tab-btn[data-tab="historical"]');
          if (histTabBtn) {
            histTabBtn.click();
          }
          if (histSearchInput && primaryStationName) {
            histSearchInput.value = primaryStationName;
            performSearch(primaryStationName);
            histSearchInput.focus();
            histSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      }

      if (pendingUploadedRecords.length === 1) {
        if (dupsCount > 0) {
          setStatus(warningMsg, 'warning');
        } else {
          setStatus(
            isEn
              ? `✓ Emplacement "${pendingUploadedRecords[0].locationName}" registered (${isOnline ? 'Supabase cloud & cache' : 'local cache'}).`
              : `✓ Emplazamiento "${pendingUploadedRecords[0].locationName}" registrado (${isOnline ? 'Base de datos Supabase y caché' : 'caché local'}).`,
            'success'
          );
        }
      } else {
        if (newCount > 0 && dupsCount === 0) {
          setStatus(
            isEn
              ? `✓ All ${newCount} emplacements saved successfully (${isOnline ? 'Supabase cloud & cache' : 'local cache'}).`
              : `✓ Los ${newCount} emplazamientos se guardaron exitosamente (${isOnline ? 'Base de datos Supabase y caché' : 'caché local'}).`,
            'success'
          );
        } else if (newCount > 0 && dupsCount > 0) {
          setStatus(
            isEn
              ? `✓ ${newCount} new emplacements saved (${dupsCount} already registered / duplicates).`
              : `✓ ${newCount} nuevos emplazamientos guardados (${dupsCount} ya registrados / advertencia de duplicado).`,
            'warning'
          );
        } else {
          setStatus(warningMsg || (isEn ? 'All emplacements were already registered.' : 'Todos los emplazamientos ya estaban registrados.'), 'warning');
        }
      }
    } catch (err: any) {
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'Ocurrió un error al procesar el archivo o guardar en el servidor.',
        'An error occurred while processing the file or saving to the server.'
      );
      setStatus(`${isEn ? 'Error:' : 'Error:'} ${safeMsg}`, 'error');
    } finally {
      if (triggerBtn) triggerBtn.disabled = false;
    }
  }

  // Subscribe to Supabase connection state changes to keep online upload banners updated
  climateDatabaseService.subscribe(() => {
    const box1 = container.querySelector('#manual-upload-permission-box');
    const box2 = container.querySelector('#file-upload-permission-box');
    const bannerHtml = renderSupabaseUploadBannerHtml(isEn);
    if (box1) box1.innerHTML = bannerHtml;
    if (box2) box2.innerHTML = bannerHtml;
  });

  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    handleFiles(e.dataTransfer?.files || null);
  });

  downloadCsvBtn.addEventListener('click', () => {
    const csv = generateSampleCSV(false);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_climatica_individual_vertical.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadCsvHorizontalBtn?.addEventListener('click', () => {
    const csv = generateSampleCSVHorizontal();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_climatica_individual_horizontal.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadCsvMultiBtn?.addEventListener('click', () => {
    const csv = generateSampleCSV(true);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_climatica_lote_multi_orientsol.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadJsonBtn.addEventListener('click', () => {
    const json = generateSampleJSON(false);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_climatica_individual_orientsol.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadJsonMultiBtn?.addEventListener('click', () => {
    const json = generateSampleJSON(true);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_climatica_lote_multi_orientsol.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // 4. Run Pyodide Simulation Bridge
  simBtn.addEventListener('click', async () => {
    if (!currentActiveRecord) {
      setStatus(isEn ? 'No active climate dataset available.' : 'No hay dataset meteorológico activo.', 'error');
      return;
    }

    const peakKw = parseFloat(simPeakKw.value.replace(',', '.')) || solarSyncState.getPeakPowerKw();
    const pr = parseFloat(simPr.value.replace(',', '.')) || 0.80;
    const albedo = parseFloat(simAlbedo.value.replace(',', '.')) || 0.20;
    const tonc = parseFloat(simTonc?.value.replace(',', '.')) || solarSyncState.getTonc();

    simBtn.disabled = true;
    simBtn.innerHTML = `
      <span class="spinner-sm"></span>
      <span>${t.hybridLoader.runningSimulationBtn}</span>
    `;
    setStatus(isEn ? 'Executing complete solar simulation with Python/NumPy engine...' : 'Ejecutando simulación solar completa con el motor Python/NumPy...', 'info');

    try {
      const startTime = performance.now();
      const params = hybridClimateManager.prepareForPythonBridge(currentActiveRecord, {
        peakPowerKw: peakKw,
        performanceRatio: pr,
        albedo,
        tonc,
      });

      const result = await executeSolarSimulationFromClimateData(params);
      const elapsed = Math.round(performance.now() - startTime);

      cachedLastSimulationResult = result;
      cachedActiveRecord = currentActiveRecord;
      solarSyncState.setLastSimulationResult(result);

      setStatus(
        isEn
          ? `✓ Simulation completed in ${elapsed}ms via Python WebAssembly engine.`
          : `✓ Simulación finalizada en ${elapsed}ms con el motor Python en WebAssembly.`,
        'success'
      );
      renderResults(result, true);
    } catch (err: any) {
      console.error('[OrientSol Hybrid Simulation] Error:', err);
      const safeMsg = formatSafeUserErrorMessage(
        err,
        'Error durante el cálculo de simulación solar. Compruebe los parámetros de entrada.',
        'Error during solar simulation calculation. Please verify input parameters.'
      );
      setStatus(safeMsg, 'error');
    } finally {
      simBtn.disabled = false;
      simBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>${t.hybridLoader.runSimulationBtn}</span>
      `;
    }
  });

  function renderResults(res: SolarBridgeSimulationResult, shouldScroll: boolean = false) {
    resultsContainer.classList.remove('hidden');

    const getBadgeClass = (category: string) => {
      if (category.includes('2')) return 'badge-2ejes';
      if (category.includes('1')) return 'badge-1eje';
      return 'badge-fija';
    };

    resultsContainer.innerHTML = `
      <div class="results-header">
        <div class="results-header-left">
          <div class="results-badge-row">
            <span class="badge badge-success">${t.results.pythonSuccess}</span>
            <span class="badge badge-neutral">${res.executionTimeMs} ms</span>
            <span class="badge badge-source">${res.source.toUpperCase()}</span>
          </div>
          <h3>${escapeHtml(t.results.resultsFor.replace('{location}', res.locationName).replace('{lat}', formatNum(res.latitude, 2)))}</h3>
        </div>
      </div>

      <!-- 1. RESUMEN DE TEMPERATURAS AMBIENTE Y DE CÉLULA -->
      <div class="temperatures-overview-grid">
        <div class="temp-stat-card">
          <span class="temp-stat-title">${t.results.tempMeanAnnual}</span>
          <div class="temp-stat-value temp-mean">${formatNum(res.temperatures.ambient.annualMeanC, 1)} <small style="font-size:0.9rem">°C</small></div>
          <span class="temp-stat-sub">${t.results.tempMeanAnnualDesc}</span>
        </div>
        <div class="temp-stat-card">
          <span class="temp-stat-title">${t.results.tempMaxAnnual}</span>
          <div class="temp-stat-value temp-warm">${formatNum(res.temperatures.ambient.annualMaxC, 1)} <small style="font-size:0.9rem">°C</small></div>
          <span class="temp-stat-sub">${t.results.tempMaxAnnualDesc}</span>
        </div>
        <div class="temp-stat-card">
          <span class="temp-stat-title">${t.results.tempMinAnnual}</span>
          <div class="temp-stat-value temp-cool">${formatNum(res.temperatures.ambient.annualMinC, 1)} <small style="font-size:0.9rem">°C</small></div>
          <span class="temp-stat-sub">${t.results.tempMinAnnualDesc}</span>
        </div>
        <div class="temp-stat-card">
          <span class="temp-stat-title">${t.results.tempCellOperating}</span>
          <div class="temp-stat-value temp-cell">${formatNum(res.temperatures.cellOperating.meanCellTempOptimalC, 1)} <small style="font-size:0.9rem">°C</small></div>
          <span class="temp-stat-sub">${isEn ? `NOCT / TONC ${formatNum(parseFloat(simTonc?.value) || 47.0, 1)}°C Model (Max: ${formatNum(res.temperatures.cellOperating.maxCellTempOptimalC, 1)}°C)` : `Modelo TONC ${formatNum(parseFloat(simTonc?.value) || 47.0, 1)}°C (Máx: ${formatNum(res.temperatures.cellOperating.maxCellTempOptimalC, 1)}°C)`}</span>
        </div>
      </div>

      <!-- 2. GRÁFICOS VISUALES INTERACTIVOS (SVG) -->
      <div id="app-solar-charts" class="results-charts-section">
        <div class="charts-section-header">
          <div class="charts-badge-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3v18h18"></path>
              <path d="m19 9-5 5-4-4-3 3"></path>
            </svg>
          </div>
          <div>
            <h4>${t.results.chartsTitle}</h4>
            <span class="charts-section-desc">
              ${isEn ? 'High-precision vector solar curves and monthly breakdowns generated by the WebAssembly engine' : 'Curvas solares vectoriales de alta precisión y desgloses mensuales generados por el motor WebAssembly'}
            </span>
          </div>
        </div>
        <div class="charts-grid-2col">
          ${renderRadiationChart(res, isEn)}
          ${renderEnergyAndTemperatureChart(res, isEn)}
        </div>
        <div class="chart-fullwidth-wrapper">
          ${renderSurfacesRankingChart(res, isEn)}
        </div>
      </div>

      <!-- 2. SELECTOR DE OPERACIÓN / ESTUDIO (ORIENTSOL 4.0) -->
      <div class="operation-selector-container">
        <div class="operation-selector-header">
          <label for="study-operation-select" class="operation-selector-label">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
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
            <span>${isEn ? 'Solar Operation & Study Mode:' : 'Operación & Estudio Solar a visualizar:'}</span>
          </label>
          <span class="operation-selector-hint">
            ${isEn
              ? 'Select an optimization or tracking model to view its detailed calculation table, graphics, and energy analysis.'
              : 'Seleccione el modelo de optimización o seguimiento para ver su tabla de cálculo detallada, gráficas y balance energético.'}
          </span>
        </div>
        <div class="operation-dropdown-wrap">
          <select id="study-operation-select" class="form-select operation-dropdown-select">
            <option value="annual" ${cachedActiveStudyOp === 'annual' ? 'selected' : ''}>
              ${isEn ? '1. Annual optimal tilt' : '1. Inclinación óptima anual'}
            </option>
            <option value="monthly" ${cachedActiveStudyOp === 'monthly' ? 'selected' : ''}>
              ${isEn ? '2. Monthly optimization (12 independent positions)' : '2. Optimización mensual (12 posiciones independientes)'}
            </option>
            <option value="seasonal" ${cachedActiveStudyOp === 'seasonal' ? 'selected' : ''}>
              ${isEn ? '3. Seasonal optimal tilt' : '3. Inclinación óptima estacional'}
            </option>
            <option value="polar" ${cachedActiveStudyOp === 'polar' ? 'selected' : ''}>
              ${isEn ? '4. Single-axis polar tracking' : '4. Seg. 1 eje polar'}
            </option>
            <option value="azimuthal" ${cachedActiveStudyOp === 'azimuthal' ? 'selected' : ''}>
              ${isEn ? '5. Single-axis azimuthal tracking' : '5. Seg. 1 eje azimutal'}
            </option>
            <option value="horizontal" ${cachedActiveStudyOp === 'horizontal' ? 'selected' : ''}>
              ${isEn ? '6. Single-axis horizontal tracking' : '6. Seg. 1 eje horizontal'}
            </option>
            <option value="dual" ${cachedActiveStudyOp === 'dual' ? 'selected' : ''}>
              ${isEn ? '7. Two-axis tracking' : '7. Seg. a dos ejes'}
            </option>
            <option value="comparative" ${cachedActiveStudyOp === 'comparative' ? 'selected' : ''}>
              ${isEn ? '8. Comparative study of all models' : '8. Comparativa de todos los tipos de estudios'}
            </option>
          </select>
        </div>

        <!-- Dynamic Operation Data Input & Mathematical Treatment Description Card -->
        <div id="operation-methodology-mount-point"></div>
      </div>

      <!-- Mount point for Active Solar Study Operation -->
      <div id="active-study-mount-point"></div>

      <!-- 3. BALANCE ENERGÉTICO: ENERGÍA RECIBIDA VS ENERGÍA PRODUCIDA -->
      <div class="result-card wide-card" style="margin-bottom: 1.25rem;">
        <div class="result-card-header">
          <h4>${t.results.energyBalanceTitle}</h4>
          <span id="energy-balance-header-badge" class="badge badge-neutral">${formatNum(parseFloat(simPeakKw.value.replace(',', '.')) || 5.0, 1)} kWp | PR=${formatInt(Math.round(parseFloat(simPr.value.replace(',', '.')) * 100))}%</span>
        </div>
        <div class="energy-models-grid">
          <div class="energy-box">
            <span class="energy-title">${t.results.solarReceivedTitle}</span>
            <div id="solar-received-annual-val" class="energy-val-large" style="color: #fbbf24;">
              ${formatInt(res.energyYield.recibida.annualTotalKwh)} <small>kWh/${isEn ? 'yr' : 'año'}</small>
            </div>
            <div class="energy-details" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
              <span>${t.results.collectorArea}</span>
              <div style="display: inline-flex; align-items: center; gap: 6px;">
                <input
                  type="text"
                  inputmode="decimal"
                  id="input-collector-area-interactive"
                  class="form-input form-input-sm"
                  style="width: 78px; text-align: right; padding: 2px 6px; font-weight: 700; height: 28px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); cursor: not-allowed;"
                  value="${formatNum(res.energyYield.collectorAreaM2 ?? 25.0, 1)}"
                  disabled
                />
                <strong>m²</strong>
                <button
                  type="button"
                  id="btn-edit-save-area"
                  class="btn btn-sm"
                  style="padding: 2px 10px; font-size: 0.78rem; font-weight: 600; height: 28px; border-radius: 4px; background: #0284c7; color: #ffffff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;"
                  title="${isEn ? 'Edit / Save & Calculate Area' : 'Editar / Guardar y Calcular Metraje'}"
                >
                  <span id="btn-edit-save-area-label">${isEn ? 'Edit' : 'Editar'}</span>
                </button>
              </div>
            </div>
            <div class="energy-details">
              <span>${t.results.annualIrradiationM2}</span>
              <strong>${formatNum(res.energyYield.recibida.annualKwhM2 ?? 0, 1)} kWh/m²·${isEn ? 'yr' : 'año'}</strong>
            </div>
            <div class="energy-row-track">
              <span>${t.results.dailyMeanResource}</span>
              <strong>${formatNum(res.energyYield.recibida.meanDailyKwhM2 ?? 0, 2)} kWh/m²/${isEn ? 'day' : 'día'}</strong>
            </div>
          </div>

          <div class="energy-box">
            <span class="energy-title">${t.results.solarProducedTitle}</span>
            <div id="solar-produced-annual-val" class="energy-val-large" style="color: #34d399;">
              ${formatInt(res.energyYield.producida.osterwald.annualKwh ?? 0)} <small>kWh/${isEn ? 'yr' : 'año'}</small>
            </div>
            <div class="energy-details">
              <span>${t.results.osterwaldModel}</span>
              <strong>${formatInt(res.energyYield.producida.osterwald.specificYieldKwhKwp ?? 0)} kWh/kWp</strong>
            </div>
            <div class="energy-details">
              <span>${t.results.cellThermalLosses}</span>
              <strong id="solar-thermal-losses-val" style="color: #f87171;">-${formatInt(Math.abs(res.energyYield.producida.osterwald.thermalLossKwh ?? 0))} kWh (-${formatNum(Math.abs(res.energyYield.producida.osterwald.thermalLossPct ?? 0), 2)}%)</strong>
            </div>
            <div class="energy-row-track">
              <span>${t.results.simplifiedModel}</span>
              <strong id="solar-produced-simplified-val">${formatInt(res.energyYield.producida.simplified.annualKwh ?? 0)} kWh/${isEn ? 'yr' : 'año'}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. COMPARATIVA GLOBAL DE SUPERFICIES (8 TOPOLOGÍAS COMPLETAS) -->
      <div class="result-card wide-card">
        <div class="result-card-header">
          <h4>${t.results.surfacesTableTitle}</h4>
          <span class="badge badge-neutral">${t.results.surfacesTableSubtitle}</span>
        </div>
        <div class="tracking-table-wrapper" style="margin-top: 0.75rem;">
          <table class="all-surfaces-table">
            <thead>
              <tr>
                <th>${t.results.thSurface}</th>
                <th>${t.results.thType}</th>
                <th>${t.results.thDailyRad}</th>
                <th>${t.results.thAnnualTotal}</th>
                <th>${t.results.thGainHoriz}</th>
                <th>${t.results.thGainFixedOpt}</th>
                <th>${t.results.thProdOsterwald}</th>
                <th>${t.results.thCellTemp}</th>
              </tr>
            </thead>
            <tbody>
              ${res.surfaceComparison
                .map(
                  (surf) => `
                <tr class="${surf.key === 'tracking_2axis_dual' ? 'highlight-row' : ''}">
                  <td><strong>${getSurfaceDisplayName(surf, isEn)}</strong></td>
                  <td><span class="category-badge ${getBadgeClass(surf.category)}">${getCategoryBadge(surf.category, isEn)}</span></td>
                  <td>${formatNum(surf.meanDailyKwhM2 ?? 0, 3)} kWh/m²/d</td>
                  <td>${formatInt(surf.annualRadiationKwhM2 ?? 0)} kWh/m²</td>
                  <td class="${(surf.gainOverHorizontalPct ?? 0) > 0 ? 'text-gain' : ''}">
                    ${(surf.gainOverHorizontalPct ?? 0) >= 0 ? '+' : ''}${formatNum(surf.gainOverHorizontalPct ?? 0, 2)}%
                  </td>
                  <td class="${(surf.gainOverAnnualFixedPct ?? 0) > 0 ? 'text-gain' : ''}">
                    ${(surf.gainOverAnnualFixedPct ?? 0) >= 0 ? '+' : ''}${formatNum(surf.gainOverAnnualFixedPct ?? 0, 2)}%
                  </td>
                  <td class="cell-val-osterwald">
                    ${formatInt(surf.energyProducedOsterwaldKwhYear ?? 0)} kWh/${isEn ? 'yr' : 'año'}
                  </td>
                  <td class="cell-val-temp">
                    ${formatNum(surf.meanCellTempDegC ?? 0, 1)} °C
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const currentPeakKw = parseFloat(simPeakKw.value.replace(',', '.')) || solarSyncState.getPeakPowerKw();

    // Dynamic Study Operation Mount Manager (Prevents Endless HTML)
    const mountStudyOperation = (op: typeof cachedActiveStudyOp) => {
      cachedActiveStudyOp = op;

      // Update the operation mathematical methodology & data input treatment card
      const methodologyMountPoint = resultsContainer.querySelector<HTMLDivElement>('#operation-methodology-mount-point');
      if (methodologyMountPoint) {
        methodologyMountPoint.innerHTML = '';
        const cardEl = renderOperationMethodologyCard(op as SolarOperationType, isEn, res.latitude, res.locationName);
        methodologyMountPoint.appendChild(cardEl);
      }

      const mountPoint = resultsContainer.querySelector<HTMLDivElement>('#active-study-mount-point');
      if (!mountPoint) return;
      mountPoint.innerHTML = '';

      if (op === 'annual') {
        const p = renderOptimalAnnualStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          peakPowerKw: currentPeakKw,
          onBack: () => {
            resultsContainer.querySelector('.operation-selector-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
          onExit: () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
        });
        mountPoint.appendChild(p);
      } else if (op === 'monthly') {
        const p = renderOptimalMonthlyStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          peakPowerKw: currentPeakKw,
          onBack: () => {
            resultsContainer.querySelector('.operation-selector-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
          onExit: () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
        });
        mountPoint.appendChild(p);
      } else if (op === 'seasonal') {
        const p = renderOptimalSeasonalStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          peakPowerKw: currentPeakKw,
        });
        mountPoint.appendChild(p);
      } else if (op === 'polar') {
        const p = renderTrackingPolarStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          peakPowerKw: currentPeakKw,
          onBack: () => {
            resultsContainer.querySelector('.operation-selector-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
        mountPoint.appendChild(p);
      } else if (op === 'azimuthal') {
        const p = renderTrackingAzimuthalStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          peakPowerKw: currentPeakKw,
          onBack: () => {
            resultsContainer.querySelector('.operation-selector-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
        mountPoint.appendChild(p);
      } else if (op === 'horizontal') {
        const p = renderTrackingHorizontalStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          peakPowerKw: currentPeakKw,
          onBack: () => {
            resultsContainer.querySelector('.operation-selector-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
        mountPoint.appendChild(p);
      } else if (op === 'dual') {
        const p = renderTrackingDualAxisStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          peakPowerKw: currentPeakKw,
          onBack: () => {
            resultsContainer.querySelector('.operation-selector-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
        mountPoint.appendChild(p);
      } else if (op === 'comparative') {
        const p = renderComparativeStudyPanel({
          simulationResult: res,
          locationName: res.locationName,
          latitude: res.latitude,
          onBack: () => {
            resultsContainer.querySelector('.operation-selector-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
        mountPoint.appendChild(p);
      }
    };

    mountStudyOperation(cachedActiveStudyOp);

    // Wire operation dropdown select change
    const opSelect = resultsContainer.querySelector<HTMLSelectElement>('#study-operation-select');
    opSelect?.addEventListener('change', () => {
      const targetOp = (opSelect.value || 'annual') as typeof cachedActiveStudyOp;
      mountStudyOperation(targetOp);
    });

    // Wire Interactive Collector Area Input & Edit/Save Button
    const areaInput = resultsContainer.querySelector<HTMLInputElement>('#input-collector-area-interactive');
    const btnEditSave = resultsContainer.querySelector<HTMLButtonElement>('#btn-edit-save-area');
    const labelEditSave = resultsContainer.querySelector<HTMLSpanElement>('#btn-edit-save-area-label');

    const baseArea = res.energyYield?.collectorAreaM2 ?? 25.0;
    const baseRecibida = res.energyYield?.recibida?.annualTotalKwh ?? 45166;
    const baseOsterwald = res.energyYield?.producida?.osterwald?.annualKwh ?? 7265;
    const baseSimp = res.energyYield?.producida?.simplified?.annualKwh ?? 7215;
    const baseTherm = res.energyYield?.producida?.osterwald?.thermalLossKwh ?? -38;
    const baseThermPct = Math.abs(res.energyYield?.producida?.osterwald?.thermalLossPct ?? 0.53);
    const basePotKw = parseFloat(simPeakKw.value.replace(',', '.')) || 5.0;
    const prPct = formatInt(Math.round(parseFloat(simPr.value.replace(',', '.')) * 100));
    const unitRadM2 = res.energyYield?.recibida?.annualKwhM2 ?? (baseArea > 0 ? baseRecibida / baseArea : 1806.6);

    const applyAreaRecalculation = (newArea: number) => {
      if (newArea <= 0 || isNaN(newArea)) return;
      const ratio = baseArea > 0 ? newArea / baseArea : 1.0;
      const newRecibida = Math.round(newArea * unitRadM2);
      const newOsterwald = Math.round(baseOsterwald * ratio);
      const newSimp = Math.round(baseSimp * ratio);
      const newTherm = Math.round(baseTherm * ratio);
      const newPotKw = formatNum(basePotKw * ratio, 1);

      // 1. Update Energía Solar Recibida
      const elRecibida = resultsContainer.querySelector<HTMLElement>('#solar-received-annual-val');
      if (elRecibida) {
        elRecibida.innerHTML = `${formatInt(newRecibida)} <small>kWh/${isEn ? 'yr' : 'año'}</small>`;
      }

      // 2. Update Energía Solar Producida (Osterwald)
      const elProducida = resultsContainer.querySelector<HTMLElement>('#solar-produced-annual-val');
      if (elProducida) {
        elProducida.innerHTML = `${formatInt(newOsterwald)} <small>kWh/${isEn ? 'yr' : 'año'}</small>`;
      }

      // 3. Update Modelo Simplificado
      const elSimp = resultsContainer.querySelector<HTMLElement>('#solar-produced-simplified-val');
      if (elSimp) {
        elSimp.innerHTML = `${formatInt(newSimp)} kWh/${isEn ? 'yr' : 'año'}`;
      }

      // 4. Update Pérdidas Térmicas Célula
      const elTherm = resultsContainer.querySelector<HTMLElement>('#solar-thermal-losses-val');
      if (elTherm) {
        elTherm.innerHTML = `-${formatInt(Math.abs(newTherm))} kWh (-${formatNum(Math.abs(baseThermPct), 2)}%)`;
      }

      // 5. Update Header Badge (Potencia Pico equivalente)
      const elBadge = resultsContainer.querySelector<HTMLElement>('#energy-balance-header-badge');
      if (elBadge) {
        elBadge.textContent = `${newPotKw} kWp | PR=${prPct}%`;
      }

      // 6. Persist changes in res.energyYield
      if (res.energyYield) {
        res.energyYield.collectorAreaM2 = newArea;
        if (res.energyYield.recibida) {
          res.energyYield.recibida.annualTotalKwh = newRecibida;
        }
        if (res.energyYield.producida?.osterwald) {
          res.energyYield.producida.osterwald.annualKwh = newOsterwald;
          res.energyYield.producida.osterwald.thermalLossKwh = newTherm;
        }
        if (res.energyYield.producida?.simplified) {
          res.energyYield.producida.simplified.annualKwh = newSimp;
        }
      }
    };

    let isEditingArea = false;
    btnEditSave?.addEventListener('click', () => {
      if (!isEditingArea) {
        // Switch to Edit Mode
        isEditingArea = true;
        if (areaInput) {
          areaInput.disabled = false;
          areaInput.style.cursor = 'text';
          areaInput.style.borderColor = '#0284c7';
          areaInput.style.background = 'rgba(2, 132, 199, 0.08)';
          areaInput.focus();
          areaInput.select();
        }
        if (btnEditSave) {
          btnEditSave.style.background = '#059669'; // Emerald Save
        }
        if (labelEditSave) {
          labelEditSave.textContent = isEn ? 'Save & Calculate' : 'Guardar y Calcular';
        }
      } else {
        // Save and Calculate
        isEditingArea = false;
        const enteredVal = parseFloat(areaInput?.value?.replace(',', '.') || '') || baseArea;
        if (areaInput) {
          areaInput.disabled = true;
          areaInput.style.cursor = 'not-allowed';
          areaInput.style.borderColor = 'var(--border-subtle)';
          areaInput.style.background = 'var(--bg-card)';
          areaInput.value = formatNum(enteredVal, 1);
        }
        if (btnEditSave) {
          btnEditSave.style.background = '#0284c7'; // Primary Blue
        }
        if (labelEditSave) {
          labelEditSave.textContent = isEn ? 'Edit' : 'Editar';
        }
        applyAreaRecalculation(enteredVal);
      }
    });

    // Support Enter key inside input to save and calculate
    areaInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnEditSave?.click();
      }
    });

    // Real-time recalculation as user types
    areaInput?.addEventListener('input', () => {
      const liveVal = parseFloat(areaInput.value.replace(',', '.'));
      if (!isNaN(liveVal) && liveVal > 0) {
        applyAreaRecalculation(liveVal);
      }
    });

    // Attach event listeners for saving the 3 main solar charts locally
    attachSolarChartsEventListeners(resultsContainer, res, isEn);

    if (shouldScroll) {
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Initial render with current station
  renderActiveRecord(currentActiveRecord);

  // Automatically refresh charts when user toggles Theme (Dark <-> Light) so SVGs reflect new background colors
  themeManager.subscribe(() => {
    if (cachedLastSimulationResult) {
      renderResults(cachedLastSimulationResult, false);
    }
  });

  if (cachedLastSimulationResult) {
    // If we already have simulation results computed, render them immediately in the selected language!
    renderResults(cachedLastSimulationResult, false);
  } else {
    // Auto-run simulation ONLY ONCE when Pyodide runtime is ready if results have not yet been produced
    const autoUnsub = pyodideService.subscribe((state) => {
      if (state.status === 'ready' && !cachedLastSimulationResult) {
        setTimeout(() => {
          if (!cachedLastSimulationResult) {
            console.log('[OrientSol] Auto-triggering initial simulation for immediate full results');
            simBtn.click();
          }
        }, 150);
        autoUnsub();
      }
    });
  }

  return container;
}
