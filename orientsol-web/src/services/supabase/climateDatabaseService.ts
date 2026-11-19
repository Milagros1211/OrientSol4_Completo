import {
  getSupabaseClient,
  isSupabaseConfigured,
  testSupabaseConnection,
  getBackendApiUrl,
  isBackendProxyConfigured,
} from './supabaseClient';
import type { ClimateDataRecord } from '@/types/climate';
import { LOCATIONS_DATABASE } from '@/database/locations';
import { i18n } from '@/i18n';
import { securityAuditLogger } from '@/services/monitoring/securityAuditLogger';


const LOCAL_STORAGE_CACHE_KEY = 'orientsol_climate_datasets_cache';
const OFFLINE_SYNC_QUEUE_KEY = 'orientsol_supabase_offline_queue';

/** Days in each month for calculating monthly accumulated radiation <-> daily Gdm(0) */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface SimilarityResult {
  isDuplicate: boolean;
  duplicateReason?: 'coordinates' | 'name' | 'data' | 'validation';
  similarityPct: number;
  matchedRecord?: ClimateDataRecord;
  message?: string;
}

export interface RegisterEmplacementResult {
  success: boolean;
  isDuplicate: boolean;
  isOffline: boolean;
  duplicateReason?: 'coordinates' | 'name' | 'data' | 'validation';
  similarityPct?: number;
  matchedRecord?: ClimateDataRecord;
  message: string;
  record: ClimateDataRecord;
}

export interface SyncSummary {
  total: number;
  inserted: number;
  duplicates: number;
  errors: number;
  details: Array<{
    name: string;
    status: 'inserted' | 'duplicate' | 'error';
    message: string;
    similarityPct?: number;
  }>;
}

type DatabaseStateListener = () => void;

/**
 * Calculates string similarity percentage (0 to 100%) between two emplacement names
 * using normalized Levenshtein edit distance.
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const s2 = str2.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s1 === s2) return 100;

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  const distance = track[s2.length][s1.length];
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;
  const sim = Math.max(0, (1 - distance / maxLen) * 100);
  return Math.round(sim * 10) / 10;
}

/**
 * Intelligently resolves the country for a given location, avoiding falsely defaulting to 'España'.
 * 1. If explicitCountry is provided and not a falsely forced 'España' when coordinates are outside Spain, uses it.
 * 2. If name contains a country or region in parentheses, e.g. "Lima (Perú)", "Quito (Ecuador)", extracts it.
 * 3. Checks geographic coordinates bounding box: if coordinates are inside Spain [lat 27.0..44.5, lon -19.0..5.0], defaults to 'España'.
 * 4. If coordinates are outside Spain or unknown, returns '' or the extracted country, never forcing 'España'.
 */
export function resolveLocationCountry(
  name: string,
  lat?: number,
  lon?: number,
  explicitCountry?: any
): string {
  const explicit = (explicitCountry || '').toString().trim();

  // 1. Extract from parentheses in locationName if present: e.g. "Lima (Perú)"
  const parenMatch = (name || '').match(/\(([^)]+)\)$/);
  if (parenMatch) {
    const inside = parenMatch[1].trim();
    if (inside) return inside;
  }

  const validLat = lat !== undefined && lat !== null && !isNaN(Number(lat));
  const validLon = lon !== undefined && lon !== null && !isNaN(Number(lon));
  const nLat = validLat ? Number(lat) : 0;
  const nLon = validLon ? Number(lon) : 0;

  // 2. Check if coordinates are provided
  if (validLat && validLon && (nLat !== 0 || nLon !== 0)) {
    const isInsideSpain = nLat >= 27.0 && nLat <= 44.5 && nLon >= -19.0 && nLon <= 5.0;
    if (isInsideSpain) {
      return explicit || 'España';
    }
    // Outside Spain: if explicit was 'España' or 'Spain', ignore it!
    if (explicit && explicit.toLowerCase() !== 'españa' && explicit.toLowerCase() !== 'spain') {
      return explicit;
    }
    return '';
  }

  // 3. If no coordinates, only use explicit if not generic España
  return explicit && explicit.toLowerCase() !== 'españa' ? explicit : '';
}

/**
 * Formats a location name with its country safely without duplicating parenthetical countries.
 * e.g.:
 * - "Lima (Perú)", "Perú" -> "Lima (Perú)"
 * - "Lima (Perú)", "España" -> "Lima (Perú)"
 * - "Madrid", "España" -> "Madrid (España)"
 * - "Paris", "" -> "Paris"
 */
export function formatLocationWithCountry(name: string, country?: string): string {
  const cleanName = (name || '').trim();
  const c = (country || '').trim();
  if (!c) return cleanName;
  const nLower = cleanName.toLowerCase();
  const cLower = c.toLowerCase();
  if (nLower.includes(cLower)) {
    return cleanName;
  }
  // If name already ends with parentheses containing text, do not append another set of parentheses
  if (/\([^)]+\)$/.test(cleanName)) {
    return cleanName;
  }
  return `${cleanName} (${c})`;
}

/**
 * Validates that all fields of a climate record are non-empty, physically valid,
 * and complete before attempting upload to Supabase.
 */
export function validateClimateRecordForSaving(
  record: Partial<ClimateDataRecord> | null | undefined,
  isEn: boolean = i18n.getLocale() === 'en'
): { valid: boolean; error?: string } {
  if (!record) {
    return {
      valid: false,
      error: isEn ? 'No climate record provided.' : 'No se han proporcionado datos del emplazamiento.',
    };
  }

  // 1. Emplacement name
  const name = (record.locationName || '').trim();
  if (!name) {
    return {
      valid: false,
      error: isEn
        ? 'The emplacement name is empty. Please enter a valid name.'
        : 'El nombre del emplazamiento está vacío. Por favor, introduce un nombre válido.',
    };
  }
  if (name.length > 200) {
    return {
      valid: false,
      error: isEn
        ? `The emplacement name is too long (${name.length} characters). Maximum allowed is 200.`
        : `El nombre del emplazamiento es demasiado largo (${name.length} caracteres). El máximo permitido es 200.`,
    };
  }

  // Suspicious pattern check (SQLi, XSS, Path Traversal)
  if (securityAuditLogger.inspectInputForSuspiciousActivity(name, 'climate-emplacement-name')) {
    return {
      valid: false,
      error: isEn
        ? 'Suspicious or invalid characters detected in the emplacement name.'
        : 'Se han detectado caracteres o patrones no permitidos en el nombre del emplazamiento.',
    };
  }


  // 2. Latitude
  if (record.latitude === undefined || record.latitude === null || isNaN(Number(record.latitude))) {
    return {
      valid: false,
      error: isEn
        ? 'Latitude is empty or not a valid number.'
        : 'La latitud está vacía o no es un número válido.',
    };
  }
  const lat = Number(record.latitude);
  if (lat < -90 || lat > 90) {
    return {
      valid: false,
      error: isEn
        ? `Latitude (${lat}°) is out of range [-90°, +90°].`
        : `La latitud (${lat}°) está fuera del rango permitido [-90°, +90°].`,
    };
  }

  // 3. Longitude
  if (record.longitude === undefined || record.longitude === null || isNaN(Number(record.longitude))) {
    return {
      valid: false,
      error: isEn
        ? 'Longitude is empty or not a valid number.'
        : 'La longitud está vacía o no es un número válido.',
    };
  }
  const lon = Number(record.longitude);
  if (lon < -180 || lon > 180) {
    return {
      valid: false,
      error: isEn
        ? `Longitude (${lon}°) is out of range [-180°, +180°].`
        : `La longitud (${lon}°) está fuera del rango permitido [-180°, +180°].`,
    };
  }

  // 4. Monthly Gdm0 (12 months)
  if (!Array.isArray(record.monthlyGdm0) || record.monthlyGdm0.length < 12) {
    return {
      valid: false,
      error: isEn
        ? `Solar radiation Gdm(0) data is incomplete. Exactly 12 monthly values are required (received ${record.monthlyGdm0?.length ?? 0}).`
        : `Los datos de radiación Gdm(0) están incompletos. Se requieren exactamente 12 valores mensuales (se recibieron ${record.monthlyGdm0?.length ?? 0}).`,
    };
  }

  let totalRad = 0;
  for (let m = 0; m < 12; m++) {
    const val = record.monthlyGdm0[m];
    if (val === undefined || val === null || isNaN(Number(val))) {
      return {
        valid: false,
        error: isEn
          ? `Gdm(0) radiation value is empty or not a number in month ${m + 1}.`
          : `El valor de radiación Gdm(0) está vacío o no es un número válido en el mes ${m + 1}.`,
      };
    }
    const num = Number(val);
    if (num < 0) {
      return {
        valid: false,
        error: isEn
          ? `Gdm(0) radiation cannot be negative in month ${m + 1} (${num}).`
          : `La radiación Gdm(0) no puede ser negativa en el mes ${m + 1} (${num}).`,
      };
    }
    if (num > 15.0) {
      return {
        valid: false,
        error: isEn
          ? `Gdm(0) radiation (${num} kWh/m²/day) in month ${m + 1} exceeds physical solar limits (max 15.0 kWh/m²/day).`
          : `La radiación Gdm(0) (${num} kWh/m²/día) en el mes ${m + 1} excede el límite físico solar admisible (máximo 15.0 kWh/m²/día).`,
      };
    }
    totalRad += num;
  }
  if (totalRad === 0) {
    return {
      valid: false,
      error: isEn
        ? 'Gdm(0) solar radiation values cannot be all zero across the year.'
        : 'La radiación solar Gdm(0) no puede ser cero en todos los meses del año.',
    };
  }

  // 5. Monthly Temperature (12 months)
  if (!Array.isArray(record.monthlyTemperature) || record.monthlyTemperature.length < 12) {
    return {
      valid: false,
      error: isEn
        ? `Temperature Tamb data is incomplete. Exactly 12 monthly values are required (received ${record.monthlyTemperature?.length ?? 0}).`
        : `Los datos de temperatura Tamb están incompletos. Se requieren exactamente 12 valores mensuales (se recibieron ${record.monthlyTemperature?.length ?? 0}).`,
    };
  }

  for (let m = 0; m < 12; m++) {
    const val = record.monthlyTemperature[m];
    if (val === undefined || val === null || isNaN(Number(val))) {
      return {
        valid: false,
        error: isEn
          ? `Tamb temperature value is empty or not a number in month ${m + 1}.`
          : `El valor de temperatura Tamb está vacío o no es un número válido en el mes ${m + 1}.`,
      };
    }
    const num = Number(val);
    if (num < -60 || num > 65) {
      return {
        valid: false,
        error: isEn
          ? `Tamb temperature (${num}°C) in month ${m + 1} is unrealistic.`
          : `La temperatura Tamb (${num}°C) en el mes ${m + 1} está fuera del rango físico razonable (-60°C a +65°C).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Calculates similarity percentage (0 to 100%) between two climate data records
 * strictly based on numerical data (12-month Gdm0, 12-month Tamb, and geographic coordinates).
 */
export function calculateDataSimilarity(recA: ClimateDataRecord, recB: ClimateDataRecord): number {
  if (!recA || !recB) return 0;

  // 1. Monthly solar radiation similarity (50% weight)
  let radSimSum = 0;
  for (let m = 0; m < 12; m++) {
    const valA = recA.monthlyGdm0?.[m] ?? 0;
    const valB = recB.monthlyGdm0?.[m] ?? 0;
    const maxVal = Math.max(valA, valB, 0.1);
    const diff = Math.abs(valA - valB);
    const mSim = Math.max(0, 1 - diff / maxVal);
    radSimSum += mSim;
  }
  const radSim = radSimSum / 12;

  // 2. Monthly temperature similarity (30% weight)
  let tempSimSum = 0;
  for (let m = 0; m < 12; m++) {
    const valA = recA.monthlyTemperature?.[m] ?? 0;
    const valB = recB.monthlyTemperature?.[m] ?? 0;
    const diff = Math.abs(valA - valB);
    // 35°C typical annual regional variation window
    const mSim = Math.max(0, 1 - diff / 35.0);
    tempSimSum += mSim;
  }
  const tempSim = tempSimSum / 12;

  // 3. Geographic coordinates proximity (20% weight)
  const latDiff = Math.abs(recA.latitude - recB.latitude);
  const lonDiff = Math.abs(recA.longitude - recB.longitude);
  const coordDist = Math.hypot(latDiff, lonDiff);

  let coordSim = 1.0;
  if (coordDist > 0.05) {
    coordSim = Math.max(0, 1 - coordDist / 10.0);
  }

  // Combined score: 50% Gdm0 + 30% Tamb + 20% Coords
  const total = (radSim * 0.50 + tempSim * 0.30 + coordSim * 0.20) * 100;
  return Math.round(total * 10) / 10;
}

/**
 * Service to manage climate datasets in Supabase with automatic online ingestion,
 * offline caching, similarity duplicate detection (>=90%), and manual sync.
 */
export class ClimateDatabaseService {
  private static instance: ClimateDatabaseService | null = null;
  private listeners: Set<DatabaseStateListener> = new Set();
  private _isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setOnline(true);
      });
      window.addEventListener('offline', () => {
        this.setOnline(false);
      });

      // Electron native connectivity updates
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.onNetworkStatusChanged) {
        electronAPI.onNetworkStatusChanged((onlineState: boolean) => {
          this.setOnline(onlineState);
        });
      }

      // Periodic sanity check every 5 seconds to detect live drops
      setInterval(() => {
        const currentNav = typeof navigator !== 'undefined' ? navigator.onLine : true;
        if (currentNav !== this._isOnline) {
          this.setOnline(currentNav);
        }
      }, 5000);
    }
  }

  public static getInstance(): ClimateDatabaseService {
    if (!ClimateDatabaseService.instance) {
      ClimateDatabaseService.instance = new ClimateDatabaseService();
    }
    return ClimateDatabaseService.instance;
  }

  public isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  public isOnline(): boolean {
    return this._isOnline;
  }

  public setOnline(status: boolean): void {
    if (this._isOnline !== status) {
      this._isOnline = status;
      console.log(`[Supabase Service] Network connectivity changed -> ${status ? 'ONLINE (Connected)' : 'OFFLINE (Disconnected)'}`);
      this.notify();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orientsol:network-changed', { detail: { isOnline: status } }));
      }
    }
  }

  public subscribe(listener: DatabaseStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[Supabase Service] Listener error:', err);
      }
    });
  }

  /**
   * Fetches climate data for a specific location ID or returns the first available record.
   */
  public async fetchClimateData(locationId?: string): Promise<ClimateDataRecord | null> {
    const all = await this.getClimateDatasets();
    if (!locationId) return all[0] || null;
    const found = all.find((r) => r.id === locationId || r.locationName.toLowerCase().includes(locationId.toLowerCase()));
    return found || all[0] || null;
  }

  /**
   * Searches for a location by coordinates with tolerance.
   */
  public async findLocationByCoords(latitude: number, longitude: number, toleranceDeg: number = 0.5): Promise<ClimateDataRecord | null> {
    const all = await this.getClimateDatasets();
    let bestMatch: ClimateDataRecord | null = null;
    let minDistance = Infinity;

    for (const item of all) {
      const dist = Math.hypot(item.latitude - latitude, item.longitude - longitude);
      if (dist <= toleranceDeg && dist < minDistance) {
        minDistance = dist;
        bestMatch = item;
      }
    }

    return bestMatch;
  }

  /**
   * Fetches all climate datasets from Supabase (or offline cache if offline).
   */
  public async getClimateDatasets(): Promise<ClimateDataRecord[]> {
    // Option A: If mobile app is configured to call dedicated backend proxy gateway
    if (isBackendProxyConfigured() && this.isOnline()) {
      try {
        const backendUrl = getBackendApiUrl();
        const res = await fetch(`${backendUrl}/api/climate/datasets`);
        if (res.ok) {
          const datasets = await res.json();
          if (Array.isArray(datasets) && datasets.length > 0) {
            this.saveToCache(datasets);
            return datasets;
          }
        }
      } catch (backendErr) {
        console.warn('[OrientSol Backend Proxy] Error fetching datasets from backend gateway, falling back to direct:', backendErr);
      }
    }

    const supabase = getSupabaseClient();

    if (supabase && this.isOnline()) {
      try {
        // Paginate through Supabase to retrieve all rows beyond default 1000-row limit
        const allRows: any[] = [];
        let from = 0;
        const PAGE_SIZE = 1000;

        while (true) {
          // Consulta explícita y recortada (Principio de mínima exposición de datos: OWASP API3:2023)
          // Se solicitan estrictamente las columnas requeridas por el modelo de cálculo y visualización
          const { data: page, error: pageErr } = await supabase
            .from('datos_mensuales')
            .select('nombre_emplazamiento, latitud, longitud, mes, radiacion_media, temp_media, es_oficial, creado_en')
            .range(from, from + PAGE_SIZE - 1);

          if (pageErr || !page || page.length === 0) break;
          allRows.push(...page);
          if (page.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        const data = allRows;

        if (Array.isArray(data) && data.length > 0) {
          // Check if table contains monthly normalized rows (nombre_emplazamiento, mes, radiacion_media, temp_media)
          const isMonthlyRows = data.some((r: any) => r.nombre_emplazamiento !== undefined || r.mes !== undefined);

          let records: ClimateDataRecord[] = [];

          if (isMonthlyRows) {
            // Group rows by location name and coordinates
            const grouped = new Map<string, any[]>();
            for (const row of data) {
              const name = (row.nombre_emplazamiento || row.name || row.nombre || 'Emplazamiento').trim();
              const key = `${name.toLowerCase()}_${row.latitud ?? row.latitude ?? 0}_${row.longitud ?? row.longitude ?? 0}`;
              if (!grouped.has(key)) {
                grouped.set(key, []);
              }
              grouped.get(key)!.push(row);
            }

            for (const [, rows] of grouped.entries()) {
              const first = rows[0];
              const locName = (first.nombre_emplazamiento || first.name || first.nombre || 'Emplazamiento').trim();
              const lat = Number(first.latitud ?? first.latitude ?? 0);
              const lon = Number(first.longitud ?? first.longitude ?? 0);

              const monthlyGdm0 = new Array(12).fill(0);
              const monthlyTemp = new Array(12).fill(0);

              for (const r of rows) {
                const m = Number(r.mes);
                if (m >= 1 && m <= 12) {
                  const idx = m - 1;
                  const rawRad = Number(r.radiacion_media ?? r.gdm0 ?? 0);
                  const days = DAYS_IN_MONTH[idx];
                  // If rawRad > 15, it is monthly accumulated radiation (kWh/m²/mes); convert to daily average Gdm(0) (kWh/m²/día)
                  const dailyGdm0 = rawRad > 15 ? Number((rawRad / days).toFixed(2)) : rawRad;
                  monthlyGdm0[idx] = dailyGdm0;
                  monthlyTemp[idx] = Number(r.temp_media ?? r.temperatura ?? 0);
                }
              }

              records.push({
                id: `supabase-${locName.toLowerCase().replace(/\s+/g, '-')}`,
                source: 'supabase',
                locationName: locName,
                country: resolveLocationCountry(locName, lat, lon, first.country || first.pais),
                latitude: lat,
                longitude: lon,
                monthlyGdm0,
                monthlyTemperature: monthlyTemp,
                fetchedAt: first.created_at || new Date().toISOString(),
                metadata: {
                  sourceTable: 'datos_mensuales',
                  totalMonthsRecorded: rows.length,
                  isOfficial: first.es_oficial !== false,
                },
              });
            }

            // Deduplication: if a location has a version with _VersionOriginal (exact BBDD.xlsx data),
            // it supersedes the raw collected location
            const versionOriginalBases = new Set<string>();
            for (const r of records) {
              if (r.locationName.endsWith('_VersionOriginal')) {
                const base = r.locationName.replace('_VersionOriginal', '').trim().toLowerCase();
                versionOriginalBases.add(base);
              }
            }

            records = records.filter((r) => {
              if (r.locationName.endsWith('_VersionOriginal')) return true;
              const base = r.locationName.trim().toLowerCase();
              return !versionOriginalBases.has(base);
            });
          } else {
            // Fallback for wide format
            records = data.map((row: any) => {
              const rowName = row.name || row.nombre || 'Ubicación Supabase';
              const rowLat = Number(row.latitude ?? row.latitud ?? 0);
              const rowLon = Number(row.longitude ?? row.longitud ?? 0);
              return {
                id: row.id ? String(row.id) : `supabase-${rowName.toLowerCase().replace(/\s+/g, '-')}`,
                source: 'supabase',
                locationName: rowName,
                country: resolveLocationCountry(rowName, rowLat, rowLon, row.country || row.pais),
                latitude: rowLat,
                longitude: rowLon,
                elevationM: row.elevation_m != null ? Number(row.elevation_m) : undefined,
                monthlyGdm0: (row.monthly_gdm0 || row.gdm0 || []).map(Number),
                monthlyTemperature: (row.monthly_temperature || row.temperatura || []).map(Number),
                fetchedAt: row.created_at || new Date().toISOString(),
                metadata: { notes: row.notes, tonc: row.tonc },
              };
            });
          }

          if (records.length > 0) {
            this.saveToCache(records);
            return records;
          }
        }
      } catch (err) {
        console.warn('[Supabase Climate] Error fetching records from cloud:', err);
      }
    }

    // Fallback to offline localStorage cache
    const cached = this.getFromCache();
    if (cached && cached.length > 0) {
      return cached;
    }

    // Fallback to IDAE / OrientSol base records
    return this.getDefaultLocationsAsRecords();
  }

  /**
   * Checks whether an emplacement already exists:
   * 1. Same coordinates (regardless of name): REJECT with warning.
   * 2. Name similarity >= 90%: REJECT with warning.
   * 3. Numerical data similarity >= 90%: REJECT with warning.
   */
  public async findSimilarEmplacement(
    target: ClimateDataRecord,
    thresholdPct: number = 90.0
  ): Promise<SimilarityResult> {
    const isEn = i18n.getLocale() === 'en';
    const allRecords = await this.getClimateDatasets();
    let highestSim = 0;
    let bestMatch: ClimateDataRecord | undefined = undefined;

    for (const existing of allRecords) {
      // Si ambos emplazamientos indican años diferentes explícitos (ej. Lima 2025 vs Lima 2026 o Lima2025 vs Lima2026),
      // se trata de una serie anual temporal legítima en la misma localidad y no de una colisión errónea.
      const targetYearMatch = (target.locationName || '').match(/(19\d{2}|20\d{2})/);
      const existingYearMatch = (existing.locationName || '').match(/(19\d{2}|20\d{2})/);
      const isDifferentYearSeries = Boolean(
        targetYearMatch && existingYearMatch && targetYearMatch[1] !== existingYearMatch[1]
      );

      if (!isDifferentYearSeries) {
        // 1. Same geographic coordinates check (tolerance ~0.005° ≈ 500m)
        const latDiff = Math.abs(target.latitude - existing.latitude);
        const lonDiff = Math.abs(target.longitude - existing.longitude);
        if (latDiff < 0.005 && lonDiff < 0.005) {
          return {
            isDuplicate: true,
            duplicateReason: 'coordinates',
            similarityPct: 100,
            matchedRecord: existing,
            message: isEn
              ? `Cannot register: An emplacement ("${existing.locationName}") is already registered with the exact same geographic coordinates (Lat: ${existing.latitude.toFixed(3)}°, Lon: ${existing.longitude.toFixed(3)}°), even though the name is different.`
              : `No se puede registrar: Ya existe un emplazamiento registrado ("${existing.locationName}") con las mismas coordenadas geográficas (Lat: ${existing.latitude.toFixed(3)}°, Lon: ${existing.longitude.toFixed(3)}°), aunque el nombre sea diferente.`,
          };
        }

        // 2. Name similarity >= 90% check
        const nameSim = calculateStringSimilarity(target.locationName, existing.locationName);
        if (nameSim >= thresholdPct) {
          return {
            isDuplicate: true,
            duplicateReason: 'name',
            similarityPct: nameSim,
            matchedRecord: existing,
            message: isEn
              ? `Cannot register: The name "${target.locationName}" has a ${nameSim}% similarity (≥ 90%) with existing emplacement "${existing.locationName}".`
              : `No se puede registrar: El nombre "${target.locationName}" presenta una similitud del ${nameSim}% (≥ 90%) con el emplazamiento existente "${existing.locationName}".`,
          };
        }
      }

      // 3. Numerical data similarity
      const sim = calculateDataSimilarity(target, existing);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatch = existing;
      }
    }

    if (highestSim >= thresholdPct && bestMatch) {
      return {
        isDuplicate: true,
        duplicateReason: 'data',
        similarityPct: highestSim,
        matchedRecord: bestMatch,
        message: isEn
          ? `The emplacement was already registered previously with ${highestSim}% numerical data match with "${bestMatch.locationName}".`
          : `El emplazamiento ya ha sido registrado previamente con ${highestSim}% de coincidencia en datos numéricos con "${bestMatch.locationName}".`,
      };
    }

    return {
      isDuplicate: false,
      similarityPct: highestSim,
      matchedRecord: bestMatch,
    };
  }

  /**
   * Registers a new emplacement:
   * 1. Validates that all fields are non-empty and physically valid.
   * 2. Checks for coordinate duplicates, name similarity >= 90%, and data similarity >= 90%.
   * 3. If valid and not duplicate, inserts into Supabase (or offline sync queue).
   */
  public async registerEmplacement(record: ClimateDataRecord): Promise<RegisterEmplacementResult> {
    // 1. Pre-validation of empty / invalid data
    const val = validateClimateRecordForSaving(record);
    if (!val.valid) {
      return {
        success: false,
        isDuplicate: false,
        duplicateReason: 'validation',
        isOffline: !this.isOnline() || !this.isConfigured(),
        message: val.error || 'Error de validación en los datos ingresados.',
        record,
      };
    }

    // 2. Duplicate check (Coordinates, Name >= 90%, Data >= 90%)
    const check = await this.findSimilarEmplacement(record, 90.0);
    if (check.isDuplicate) {
      return {
        success: false,
        isDuplicate: true,
        isOffline: !this.isOnline() || !this.isConfigured(),
        duplicateReason: check.duplicateReason,
        similarityPct: check.similarityPct,
        matchedRecord: check.matchedRecord,
        message: check.message!,
        record,
      };
    }

    // 2. Online insertion: Option A: Backend Proxy Gateway (Zero client credentials)
    if (isBackendProxyConfigured() && this.isOnline()) {
      try {
        const backendUrl = getBackendApiUrl();
        const res = await fetch(`${backendUrl}/api/climate/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (res.ok) {
          const result = await res.json();
          const savedRecord: ClimateDataRecord = {
            ...record,
            id: `server-${record.locationName.toLowerCase().replace(/\s+/g, '-')}`,
            source: 'supabase',
          };
          const existing = this.getFromCache() || this.getDefaultLocationsAsRecords();
          this.saveToCache([savedRecord, ...existing.filter((r) => r.locationName !== savedRecord.locationName)]);
          this.notify();

          return {
            success: true,
            isDuplicate: result.isDuplicate || false,
            isOffline: false,
            message: result.message || `✓ Emplazamiento "${record.locationName}" registrado con éxito a través del servidor backend seguro.`,
            record: savedRecord,
          };
        }
      } catch (backendErr) {
        console.warn('[OrientSol Backend Proxy] Register failed via backend gateway, checking direct connection:', backendErr);
      }
    }

    // 2. Online insertion: Option B: Direct Supabase client
    const supabase = getSupabaseClient();
    if (supabase && this.isOnline()) {
      try {
        // Build 12 monthly rows matching the table: nombre_emplazamiento, latitud, longitud, mes, radiacion_media, temp_media
        const monthlyRows = [];
        for (let m = 1; m <= 12; m++) {
          const idx = m - 1;
          const days = DAYS_IN_MONTH[idx];
          const gdm0Daily = record.monthlyGdm0[idx] ?? 0;
          const radMensual = Number((gdm0Daily * days).toFixed(2));
          const tempMedia = Number((record.monthlyTemperature[idx] ?? 0).toFixed(2));

          monthlyRows.push({
            nombre_emplazamiento: (record.locationName || '').trim().slice(0, 200),
            latitud: Math.max(-90.0, Math.min(90.0, Number(record.latitude))),
            longitud: Math.max(-180.0, Math.min(180.0, Number(record.longitude))),
            mes: m,
            radiacion_media: Math.max(0.0, Math.min(450.0, radMensual)),
            temp_media: Math.max(-90.0, Math.min(70.0, tempMedia)),
            es_oficial: false,
          });
        }

        // Inserción comunitaria estándar (requiere sólo privilegios SELECT e INSERT otorgados al rol anon)
        const { error } = await supabase
          .from('datos_mensuales')
          .insert(monthlyRows);

        if (!error) {
          const savedRecord: ClimateDataRecord = {
            ...record,
            id: `supabase-${record.locationName.toLowerCase().replace(/\s+/g, '-')}`,
            source: 'supabase',
            metadata: {
              ...record.metadata,
              isOfficial: false,
            },
          };

          // Cache locally
          const existing = this.getFromCache() || this.getDefaultLocationsAsRecords();
          this.saveToCache([savedRecord, ...existing.filter((r) => r.locationName !== savedRecord.locationName)]);
          this.notify();

          return {
            success: true,
            isDuplicate: false,
            isOffline: false,
            message: `✓ Emplazamiento "${record.locationName}" registrado con éxito en Supabase (12 meses en datos_mensuales).`,
            record: savedRecord,
          };
        } else if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          // Manejo limpio de colisión de unicidad sin crashear la aplicación
          console.info('[Supabase Info] Registro duplicado detectado por restricción UNIQUE de base de datos:', error.message);
          return {
            success: false,
            isDuplicate: true,
            isOffline: false,
            duplicateReason: 'name',
            similarityPct: 100,
            message: `ℹ El emplazamiento "${record.locationName}" ya existe en la base de datos comunitaria de Supabase. No se requieren duplicados.`,
            record,
          };
        } else {
          console.warn('[Supabase Insert Error]', error.message);
        }
      } catch (err: any) {
        console.warn('[Supabase Network/Insert Error]', err);
      }
    }

    // 3. Offline storage in sync queue
    this.addToOfflineQueue(record);
    this.notify();

    return {
      success: true,
      isDuplicate: false,
      isOffline: true,
      message: `Modo Offline: Emplazamiento guardado en caché local (pendiente de sincronización con Supabase).`,
      record,
    };
  }

  // =========================================================================
  // USER UPLOADED STATIONS LOCAL CACHE
  // =========================================================================

  public getUploadedCache(): ClimateDataRecord[] {
    try {
      const raw = localStorage.getItem('orientsol_user_uploaded_stations_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  public saveUploadedCache(records: ClimateDataRecord[]): void {
    try {
      const existing = this.getUploadedCache();
      const merged = [...existing];
      for (const rec of records) {
        const key = rec.locationName.trim().toLowerCase();
        const idx = merged.findIndex((e) => e.locationName.trim().toLowerCase() === key);
        const item: ClimateDataRecord = {
          ...rec,
          id: rec.id || `cache-${key.replace(/\s+/g, '-')}`,
          source: 'offline_cache' as any,
          metadata: {
            ...rec.metadata,
            isOfficial: false,
          },
        };
        if (idx >= 0) {
          merged[idx] = item;
        } else {
          merged.push(item);
        }
      }
      localStorage.setItem('orientsol_user_uploaded_stations_v1', JSON.stringify(merged));
      this.notify();
    } catch (err) {
      console.warn('[Supabase Service] Could not save uploaded stations to local cache:', err);
    }
  }

  public removeUploadedCache(locationNames: string[]): void {
    try {
      const keysToRemove = new Set(locationNames.map((n) => n.trim().toLowerCase()));
      const existing = this.getUploadedCache();
      const filtered = existing.filter((rec) => !keysToRemove.has(rec.locationName.trim().toLowerCase()));
      localStorage.setItem('orientsol_user_uploaded_stations_v1', JSON.stringify(filtered));
      this.notify();
    } catch (err) {
      console.warn('[Supabase Service] Could not remove uploaded stations from local cache:', err);
    }
  }

  // =========================================================================
  // OFFLINE QUEUE MANAGEMENT
  // =========================================================================

  public getOfflineQueue(): ClimateDataRecord[] {
    try {
      const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  public addToOfflineQueue(record: ClimateDataRecord): void {
    const queue = this.getOfflineQueue();
    // Avoid exact duplicate additions to queue
    const exists = queue.some((r) => calculateDataSimilarity(r, record) >= 95.0);
    if (!exists) {
      queue.push({
        ...record,
        id: record.id || `offline-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fetchedAt: new Date().toISOString(),
      });
      try {
        localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(queue));
      } catch {}
      this.notify();
    }
  }

  public removeFromOfflineQueue(idOrName: string): void {
    const queue = this.getOfflineQueue().filter((r) => r.id !== idOrName && r.locationName !== idOrName);
    try {
      localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch {}
    this.notify();
  }

  public clearOfflineQueue(): void {
    try {
      localStorage.removeItem(OFFLINE_SYNC_QUEUE_KEY);
    } catch {}
    this.notify();
  }

  public getOfflineQueueCount(): number {
    return this.getOfflineQueue().length;
  }

  /**
   * Sincroniza la cola offline completa con Supabase:
   * - Compara cada registro con la base de datos de Supabase.
   * - Si encuentra datos iguales (>=90%), lo marca como ya registrado y lo retira de la cola.
   * - Si es nuevo (<90%), lo inserta en Supabase y lo retira de la cola.
   */
  public async syncOfflineQueue(): Promise<SyncSummary> {
    const queue = this.getOfflineQueue();
    const summary: SyncSummary = {
      total: queue.length,
      inserted: 0,
      duplicates: 0,
      errors: 0,
      details: [],
    };

    if (queue.length === 0) {
      return summary;
    }

    if (!this.isConfigured()) {
      throw new Error('Supabase no está configurado. Por favor, introduce la URL del proyecto y la Anon Key.');
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('No se pudo inicializar la conexión con Supabase.');
    }

    const test = await testSupabaseConnection();
    if (!test.ok) {
      throw new Error(`Fallo de conexión con Supabase: ${test.message}`);
    }

    // Fetch existing records from Supabase for similarity check
    const existingCloudRecords = await this.getClimateDatasets();
    const remainingQueue: ClimateDataRecord[] = [];

    for (const item of queue) {
      // Check similarity >= 90%
      let highestSim = 0;
      let matchedRecord: ClimateDataRecord | undefined = undefined;

      for (const existing of existingCloudRecords) {
        const sim = calculateDataSimilarity(item, existing);
        if (sim > highestSim) {
          highestSim = sim;
          matchedRecord = existing;
        }
      }

      if (highestSim >= 90.0 && matchedRecord) {
        // Already registered in Supabase
        summary.duplicates++;
        summary.details.push({
          name: item.locationName,
          status: 'duplicate',
          similarityPct: highestSim,
          message: `El emplazamiento "${item.locationName}" ya está registrado en Supabase (${highestSim}% coincidencia con "${matchedRecord.locationName}").`,
        });
        // Removed from queue
      } else {
        // Insert new record (12 monthly rows)
        try {
          const monthlyRows = [];
          for (let m = 1; m <= 12; m++) {
            const idx = m - 1;
            const days = DAYS_IN_MONTH[idx];
            const gdm0Daily = item.monthlyGdm0[idx] ?? 0;
            const radMensual = Number((gdm0Daily * days).toFixed(2));
            const tempMedia = Number((item.monthlyTemperature[idx] ?? 0).toFixed(2));

            monthlyRows.push({
              nombre_emplazamiento: (item.locationName || '').trim().slice(0, 200),
              latitud: Math.max(-90.0, Math.min(90.0, Number(item.latitude))),
              longitud: Math.max(-180.0, Math.min(180.0, Number(item.longitude))),
              mes: m,
              radiacion_media: Math.max(0.0, Math.min(450.0, radMensual)),
              temp_media: Math.max(-90.0, Math.min(70.0, tempMedia)),
              es_oficial: false,
            });
          }

          // Inserción comunitaria estándar (requiere sólo privilegios SELECT e INSERT otorgados al rol anon)
          const { error } = await supabase
            .from('datos_mensuales')
            .insert(monthlyRows);

          if (!error) {
            summary.inserted++;
            summary.details.push({
              name: item.locationName,
              status: 'inserted',
              message: `✓ Emplazamiento "${item.locationName}" ingresado con éxito en Supabase (12 meses).`,
            });
            existingCloudRecords.push({ ...item, id: `supabase-${item.locationName.toLowerCase().replace(/\s+/g, '-')}` });
          } else if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
            // Ya existía en Supabase: se considera sincronizado/descartado pacíficamente
            summary.duplicates++;
            summary.details.push({
              name: item.locationName,
              status: 'duplicate',
              message: `ℹ Omitido: "${item.locationName}" ya existía en la base de datos Supabase.`,
            });
          } else {
            summary.errors++;
            summary.details.push({
              name: item.locationName,
              status: 'error',
              message: `Error al sincronizar: ${error?.message || 'Error desconocido'}`,
            });
            remainingQueue.push(item);
          }
        } catch (err: any) {
          summary.errors++;
          summary.details.push({
            name: item.locationName,
            status: 'error',
            message: `Fallo de red: ${err.message || String(err)}`,
          });
          remainingQueue.push(item);
        }
      }
    }

    // Update offline queue with only failed items (if any)
    try {
      localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch {}

    this.notify();
    return summary;
  }

  // =========================================================================
  // CACHE HELPERS
  // =========================================================================

  private saveToCache(records: ClimateDataRecord[]): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(records));
    } catch {}
  }

  private getFromCache(): ClimateDataRecord[] | null {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((r: any) => ({
            ...r,
            country: resolveLocationCountry(r.locationName, r.latitude, r.longitude, r.country),
          }));
        }
      }
    } catch {}
    return null;
  }

  private getDefaultLocationsAsRecords(): ClimateDataRecord[] {
    return LOCATIONS_DATABASE.map((loc) => ({
      id: loc.id,
      source: 'local_database',
      locationName: loc.name,
      country: loc.country,
      latitude: loc.latitude,
      longitude: loc.longitude || 0.0,
      elevationM: loc.elevationM,
      monthlyGdm0: loc.monthlyGdm0,
      monthlyTemperature: loc.monthlyTempC,
      fetchedAt: new Date().toISOString(),
      metadata: { region: loc.region },
    }));
  }
}

export const climateDatabaseService = ClimateDatabaseService.getInstance();

/**
 * Formats an emplacement name with the required source DB and timestamp suffix.
 * e.g. "Madrid (PVGIS - 2026-10-10 21:20)"
 */
export function formatEmplacementNameWithSuffix(baseName: string, source: string): string {
  let clean = baseName
    .replace(/\s*\([^)]*\b(?:pvgis|nasa|meteonorm|supabase|era5|local|db)\b[^)]*\)/gi, '')
    .trim();

  if (!clean) clean = 'Emplazamiento Solar';

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let sourceTag = 'DB';
  const s = source.toLowerCase();
  if (s.includes('pvgis')) sourceTag = 'PVGIS';
  else if (s.includes('nasa')) sourceTag = 'NASA POWER';
  else if (s.includes('meteo')) sourceTag = 'METEONORM';
  else if (s.includes('supa')) sourceTag = 'SUPABASE';
  else sourceTag = source.toUpperCase();

  return `${clean} (${sourceTag} - ${dateStr})`;
}
