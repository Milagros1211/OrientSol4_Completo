import type { ClimateDataRecord } from '@/types/climate';
import { resolveLocationCountry } from '@/services/supabase';

export interface ClimateParseResult {
  success: boolean;
  record?: ClimateDataRecord;
  records?: ClimateDataRecord[];
  error?: string;
  warnings?: string[];
  rawFormat?: 'orientsol_json' | 'pvgis_json' | 'orientsol_vertical_csv' | 'horizontal_csv' | 'pvgis_csv' | 'orientsol_batch_csv';
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Normalizes European decimal comma into standard decimal point.
 */
function parseNum(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return NaN;
  const cleaned = String(val).trim().replace(',', '.');
  return parseFloat(cleaned);
}

/**
 * Parses a single JSON location object into a ClimateDataRecord.
 */
function parseSingleJsonObject(data: any, fileName: string, idx = 0, warnings: string[]): ClimateDataRecord | null {
  const locationName = data.locationName || data.name || data.nombre || data.emplazamiento || `${fileName.replace(/\.[^/.]+$/, '')}_${idx + 1}`;
  const lat = parseNum(data.latitude ?? data.lat ?? data.latitud);
  const lon = parseNum(data.longitude ?? data.lon ?? data.longitud ?? 0.0);
  const elev = parseNum(data.elevationM ?? data.elevation ?? data.altitud ?? 500);

  const gdm0Raw = data.monthlyGdm0 || data.gdm0 || data.radiation || data.radiacion_media;
  const tempRaw = data.monthlyTemperature || data.monthlyTempC || data.temperatures || data.temp || data.temp_media;

  if (!Array.isArray(gdm0Raw) || gdm0Raw.length !== 12) {
    warnings.push(`Emplazamiento "${locationName}": requiere array "monthlyGdm0" con 12 valores numéricos.`);
    return null;
  }

  const gdm0 = gdm0Raw.map((v: any, mIdx: number) => {
    let num = parseNum(v);
    if (isNaN(num) || num < 0) {
      warnings.push(`"${locationName}" Mes ${mIdx + 1}: Radiación no válida (${v}), ajustada a 0.`);
      return 0;
    }
    // If > 25, it's monthly accumulated radiation (kWh/m²/mes); convert to daily average
    if (num > 25) {
      num = num / DAYS_IN_MONTH[mIdx];
    }
    return Number(num.toFixed(3));
  });

  let tamb: number[];
  if (Array.isArray(tempRaw) && tempRaw.length === 12) {
    tamb = tempRaw.map((t: any) => Number(parseNum(t).toFixed(2)));
  } else {
    warnings.push(`"${locationName}": sin 12 temperaturas mensuales; asignado perfil estándar de 15°C.`);
    tamb = [6.0, 7.5, 10.5, 13.0, 17.0, 22.0, 25.5, 25.0, 21.0, 16.0, 10.0, 6.5];
  }

  return {
    id: `json-import-${Date.now()}-${idx}`,
    source: 'file_upload',
    locationName: String(locationName).trim().slice(0, 200),
    country: resolveLocationCountry(String(locationName).trim(), lat, lon, data.country || data.pais),
    latitude: isNaN(lat) ? 40.0 : Math.max(-90.0, Math.min(90.0, lat)),
    longitude: isNaN(lon) ? 0.0 : Math.max(-180.0, Math.min(180.0, lon)),
    elevationM: isNaN(elev) ? 500 : Math.max(-500, Math.min(9000, elev)),
    monthlyGdm0: gdm0,
    monthlyTemperature: tamb,
    fetchedAt: new Date().toISOString(),
    metadata: {
      rawFormat: 'orientsol_json',
      originalFile: fileName,
      albedo: parseNum(data.albedo ?? 0.20),
    },
  };
}

/**
 * Parses climate data from a JSON string.
 * Supports OrientSol native single/multi JSON format and PVGIS monthly output JSON.
 */
export function parseClimateJSON(jsonString: string, fileName = 'documento.json'): ClimateParseResult {
  const warnings: string[] = [];

  try {
    const data = JSON.parse(jsonString);

    // 1. Array of Multiple Locations
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return { success: false, error: 'El archivo JSON contiene un array vacío de emplazamientos.' };
      }
      const records: ClimateDataRecord[] = [];
      for (let i = 0; i < data.length; i++) {
        const rec = parseSingleJsonObject(data[i], fileName, i, warnings);
        if (rec) records.push(rec);
      }
      if (records.length === 0) {
        return { success: false, error: 'No se encontraron emplazamientos válidos con 12 meses en el array JSON.' };
      }
      return {
        success: true,
        record: records[0],
        records,
        warnings,
        rawFormat: 'orientsol_json',
      };
    }

    // 2. PVGIS API JSON format
    if (data.outputs && Array.isArray(data.outputs.monthly)) {
      const monthly = data.outputs.monthly;
      if (monthly.length < 12) {
        return {
          success: false,
          error: `El JSON de PVGIS contiene solo ${monthly.length} meses (se requieren al menos 12).`,
        };
      }

      // Handle multi-year or direct 12-month
      const monthBuckets: Record<number, { rad: number[]; temp: number[] }> = {};
      for (let m = 1; m <= 12; m++) monthBuckets[m] = { rad: [], temp: [] };

      for (const item of monthly) {
        const m = Number(item.month);
        if (m >= 1 && m <= 12) {
          const hVal = parseNum(item['H(h)_m'] ?? item['H(h)'] ?? item.H_m ?? item.Gdm0);
          const tVal = parseNum(item.T2m ?? item.Ta ?? item.temp ?? 15.0);
          if (!isNaN(hVal)) monthBuckets[m].rad.push(hVal);
          if (!isNaN(tVal)) monthBuckets[m].temp.push(tVal);
        }
      }

      const gdm0: number[] = [];
      const tamb: number[] = [];

      for (let i = 0; i < 12; i++) {
        const m = i + 1;
        const bucket = monthBuckets[m];
        const days = DAYS_IN_MONTH[i];
        const avgRad = bucket.rad.length > 0 ? bucket.rad.reduce((a, b) => a + b, 0) / bucket.rad.length : 0;
        const dailyG = avgRad > 25 ? avgRad / days : avgRad;
        const avgT = bucket.temp.length > 0 ? bucket.temp.reduce((a, b) => a + b, 0) / bucket.temp.length : 15.0;

        gdm0.push(Number(dailyG.toFixed(3)));
        tamb.push(Number(avgT.toFixed(2)));
      }

      const lat = parseNum(data.inputs?.location?.latitude ?? 40.4168);
      const lon = parseNum(data.inputs?.location?.longitude ?? -3.7038);
      const elev = parseNum(data.inputs?.location?.elevation ?? 600);

      const record: ClimateDataRecord = {
        id: `pvgis-import-${Date.now()}`,
        source: 'file_upload',
        locationName: data.inputs?.location?.name || `PVGIS Import (${fileName})`,
        country: 'Importado',
        latitude: lat,
        longitude: lon,
        elevationM: elev,
        monthlyGdm0: gdm0,
        monthlyTemperature: tamb,
        fetchedAt: new Date().toISOString(),
        metadata: {
          rawFormat: 'pvgis_json',
          originalFile: fileName,
        },
      };

      return { success: true, record, records: [record], warnings, rawFormat: 'pvgis_json' };
    }

    // 3. Single Location JSON
    const rec = parseSingleJsonObject(data, fileName, 0, warnings);
    if (!rec) {
      return {
        success: false,
        error: 'El formato JSON no contiene las propiedades requeridas ("monthlyGdm0" con 12 meses).',
      };
    }

    return { success: true, record: rec, records: [rec], warnings, rawFormat: 'orientsol_json' };
  } catch (err: any) {
    return {
      success: false,
      error: `Error de sintaxis JSON: ${err.message}`,
    };
  }
}

/**
 * Parses climate data from a CSV or TXT file string.
 * Supports:
 * 1. Batch multi-location tabular CSV (emplazamiento, pais, latitud, longitud, mes, radiacion, temp)
 * 2. Single-location horizontal CSV (Meses en cabecera, filas de Gdm0 y Tamb)
 * 3. Single-location vertical CSV (12 filas: Mes, Gdm0, Tamb) con cabeceras de metadatos #
 */
export function parseClimateCSV(csvString: string, fileName = 'documento.csv'): ClimateParseResult {
  const warnings: string[] = [];
  const lines = csvString
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      success: false,
      error: 'El archivo CSV está vacío o contiene menos de 2 líneas válidas.',
    };
  }

  // Extract metadata headers starting with #
  let locationName = fileName.replace(/\.[^/.]+$/, '');
  let country = 'España';
  let lat = 40.4168;
  let lon = -3.7038;
  let elev = 600;
  let albedo = 0.20;

  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) {
      const lower = line.toLowerCase();
      if (lower.includes('localidad:') || lower.includes('location:') || lower.includes('emplazamiento:')) {
        locationName = line.split(':')[1]?.trim() || locationName;
      } else if (lower.includes('pais:') || lower.includes('country:')) {
        country = line.split(':')[1]?.trim() || country;
      } else if (lower.includes('latitud:') || lower.includes('lat:')) {
        lat = parseNum(line.split(':')[1]);
      } else if (lower.includes('longitud:') || lower.includes('lon:')) {
        lon = parseNum(line.split(':')[1]);
      } else if (lower.includes('altitud:') || lower.includes('elevation:')) {
        elev = parseNum(line.split(':')[1]);
      } else if (lower.includes('albedo:')) {
        albedo = parseNum(line.split(':')[1]);
      }
    } else {
      dataLines.push(line);
    }
  }

  if (dataLines.length === 0) {
    return { success: false, error: 'No se encontraron filas de datos en el CSV tras filtrar los comentarios.' };
  }

  // Detect delimiter (, or ;)
  const sample = dataLines[0];
  const delimiter = sample.split(';').length > sample.split(',').length ? ';' : ',';

  // Check if this is a Multi-Location Batch CSV
  // Header contains 'emplazamiento' or 'localidad' or 'location' AND 'mes' or 'month'
  const headerCols = dataLines[0].split(delimiter).map((c) => c.trim().toLowerCase());
  const locColIdx = headerCols.findIndex((c) =>
    ['emplazamiento', 'localidad', 'location', 'nombre', 'ciudad'].some((k) => c.includes(k))
  );
  const mesColIdx = headerCols.findIndex((c) =>
    ['mes', 'month', 'm'].some((k) => c === k || c.startsWith('mes'))
  );

  if (locColIdx !== -1 && mesColIdx !== -1 && dataLines.length >= 13) {
    // Multi-location tabular batch!
    const radColIdx = headerCols.findIndex((c) =>
      ['radiacion', 'gdm0', 'radiation', 'irrad', 'g0'].some((k) => c.includes(k))
    );
    const tempColIdx = headerCols.findIndex((c) =>
      ['temp', 'temperatura', 'tamb', 't2m'].some((k) => c.includes(k))
    );
    const latColIdx = headerCols.findIndex((c) => c.includes('lat'));
    const lonColIdx = headerCols.findIndex((c) => c.includes('lon'));
    const paisColIdx = headerCols.findIndex((c) => c.includes('pais') || c.includes('country'));

    const grouped = new Map<string, Array<{ mes: number; rad: number; temp: number; lat: number; lon: number; pais: string }>>();

    for (let i = 1; i < dataLines.length; i++) {
      const parts = dataLines[i].split(delimiter).map((p) => p.trim());
      const name = parts[locColIdx];
      if (!name) continue;

      const mes = parseNum(parts[mesColIdx]);
      const rad = radColIdx !== -1 ? parseNum(parts[radColIdx]) : 3.0;
      const temp = tempColIdx !== -1 ? parseNum(parts[tempColIdx]) : 15.0;
      const rLat = latColIdx !== -1 ? parseNum(parts[latColIdx]) : 40.0;
      const rLon = lonColIdx !== -1 ? parseNum(parts[lonColIdx]) : 0.0;
      const rPais = paisColIdx !== -1 && parts[paisColIdx] ? parts[paisColIdx] : 'España';

      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push({ mes, rad, temp, lat: rLat, lon: rLon, pais: rPais });
    }

    const records: ClimateDataRecord[] = [];
    for (const [name, rows] of grouped.entries()) {
      const gdm0 = new Array(12).fill(0);
      const tamb = new Array(12).fill(15.0);
      let rLat = 40.0;
      let rLon = 0.0;
      let rPais = 'España';

      for (const row of rows) {
        if (!isNaN(row.lat)) rLat = row.lat;
        if (!isNaN(row.lon)) rLon = row.lon;
        if (row.pais) rPais = row.pais;

        if (row.mes >= 1 && row.mes <= 12) {
          const idx = row.mes - 1;
          let rVal = isNaN(row.rad) ? 0 : row.rad;
          if (rVal > 25) rVal = rVal / DAYS_IN_MONTH[idx];
          gdm0[idx] = Number(rVal.toFixed(3));
          tamb[idx] = isNaN(row.temp) ? 15.0 : Number(row.temp.toFixed(2));
        }
      }

      records.push({
        id: `batch-csv-${Date.now()}-${records.length}`,
        source: 'file_upload',
        locationName: String(name).trim().slice(0, 200),
        country: resolveLocationCountry(name, rLat, rLon, rPais),
        latitude: isNaN(rLat) ? 40.0 : Math.max(-90.0, Math.min(90.0, rLat)),
        longitude: isNaN(rLon) ? 0.0 : Math.max(-180.0, Math.min(180.0, rLon)),
        elevationM: 500,
        monthlyGdm0: gdm0,
        monthlyTemperature: tamb,
        fetchedAt: new Date().toISOString(),
        metadata: { rawFormat: 'orientsol_batch_csv', originalFile: fileName },
      });
    }

    if (records.length > 0) {
      return { success: true, record: records[0], records, warnings, rawFormat: 'orientsol_batch_csv' };
    }
  }

  // Format 1: Horizontal CSV (Header with 12 months, row 1 = Gdm0, row 2 = Tamb)
  if (dataLines.length >= 2 && dataLines.length <= 4) {
    const row0 = dataLines[0].split(delimiter).map((c) => c.trim().toLowerCase());
    const hasMonthHeaders = row0.some((col) =>
      ['ene', 'jan', '1', 'mes 1', 'enero', 'january'].some((m) => col.includes(m))
    );

    if (hasMonthHeaders || dataLines.length === 2 || dataLines.length === 3) {
      let gdm0Row: string[] = [];
      let tambRow: string[] = [];

      for (let i = 1; i < dataLines.length; i++) {
        const parts = dataLines[i].split(delimiter).map((p) => p.trim());
        const label = parts[0].toLowerCase();
        if (label.includes('rad') || label.includes('gdm0') || label.includes('g0') || label.includes('global') || i === 1) {
          if (gdm0Row.length === 0) gdm0Row = parts.slice(1);
        }
        if (label.includes('temp') || label.includes('tamb') || label.includes('t2m') || i === 2) {
          if (tambRow.length === 0) tambRow = parts.slice(1);
        }
      }

      if (gdm0Row.length >= 12) {
        const monthlyGdm0 = gdm0Row.slice(0, 12).map((val, idx) => {
          let num = parseNum(val);
          if (num > 25) num = num / DAYS_IN_MONTH[idx];
          return Number(num.toFixed(3));
        });
        const monthlyTemp = tambRow.length >= 12
          ? tambRow.slice(0, 12).map((val) => Number(parseNum(val).toFixed(2)))
          : [6.0, 7.5, 10.5, 13.0, 17.0, 22.0, 25.5, 25.0, 21.0, 16.0, 10.0, 6.5];

        const record: ClimateDataRecord = {
          id: `csv-horizontal-${Date.now()}`,
          source: 'file_upload',
          locationName,
          country,
          latitude: isNaN(lat) ? 40.0 : lat,
          longitude: isNaN(lon) ? 0.0 : lon,
          elevationM: isNaN(elev) ? 500 : elev,
          monthlyGdm0,
          monthlyTemperature: monthlyTemp,
          fetchedAt: new Date().toISOString(),
          metadata: { rawFormat: 'horizontal_csv', originalFile: fileName, albedo },
        };
        return { success: true, record, records: [record], warnings, rawFormat: 'horizontal_csv' };
      }
    }
  }

  // Format 2: Single-location Vertical CSV (12 rows, 1 per month: Mes, Gdm0, Tamb)
  let startIndex = 0;
  const firstCols = dataLines[0].split(delimiter);
  if (isNaN(parseNum(firstCols[0])) && isNaN(parseNum(firstCols[1]))) {
    startIndex = 1;
  }

  const verticalRows = dataLines.slice(startIndex).filter((r) => r.trim().length > 0);
  if (verticalRows.length >= 12) {
    const monthlyGdm0: number[] = [];
    const monthlyTemp: number[] = [];

    for (let i = 0; i < 12; i++) {
      const parts = verticalRows[i].split(delimiter).map((p) => p.trim());
      let gVal: number;
      let tVal: number;

      if (parts.length >= 3) {
        gVal = parseNum(parts[1]);
        tVal = parseNum(parts[2]);
      } else if (parts.length === 2) {
        gVal = parseNum(parts[0]);
        tVal = parseNum(parts[1]);
      } else {
        gVal = parseNum(parts[0]);
        tVal = 15.0;
      }

      if (isNaN(gVal) || gVal < 0) {
        warnings.push(`Fila ${i + 1}: Radiación no válida (${parts[1] ?? parts[0]}), asignado valor 3.0.`);
        gVal = 3.0;
      }
      if (gVal > 25) {
        gVal = gVal / DAYS_IN_MONTH[i];
      }
      if (isNaN(tVal)) {
        tVal = 15.0;
      }

      monthlyGdm0.push(Number(gVal.toFixed(3)));
      monthlyTemp.push(Number(tVal.toFixed(2)));
    }

    const record: ClimateDataRecord = {
      id: `csv-vertical-${Date.now()}`,
      source: 'file_upload',
      locationName,
      country,
      latitude: isNaN(lat) ? 40.0 : lat,
      longitude: isNaN(lon) ? 0.0 : lon,
      elevationM: isNaN(elev) ? 500 : elev,
      monthlyGdm0,
      monthlyTemperature: monthlyTemp,
      fetchedAt: new Date().toISOString(),
      metadata: { rawFormat: 'orientsol_vertical_csv', originalFile: fileName, albedo },
    };

    return { success: true, record, records: [record], warnings, rawFormat: 'orientsol_vertical_csv' };
  }

  return {
    success: false,
    error: `No se pudieron extraer 12 meses del CSV. Se detectaron ${verticalRows.length} filas válidas. Utilice una de las plantillas descargables.`,
  };
}

/**
 * Generates sample CSV template for download.
 * If isMulti is true, generates a multi-location batch template.
 */
export function generateSampleCSV(isMulti = false): string {
  if (isMulti) {
    return `# OrientSol 4.0 - Plantilla de Lote Multi-Emplazamiento (Batch)
# Formato: emplazamiento;latitud;longitud;mes;radiacion_media;temp_media
# Radiación: en kWh/m²/día (ej: 2.58) o mensual en kWh/m²/mes (se convierte automáticamente)
emplazamiento;latitud;longitud;mes;radiacion_media;temp_media
Jaén;37.77;-3.78;1;2.45;9.2
Jaén;37.77;-3.78;2;3.31;10.5
Jaén;37.77;-3.78;3;4.68;13.8
Jaén;37.77;-3.78;4;5.82;16.5
Jaén;37.77;-3.78;5;6.95;20.8
Jaén;37.77;-3.78;6;7.92;26.1
Jaén;37.77;-3.78;7;8.10;29.4
Jaén;37.77;-3.78;8;7.25;28.9
Jaén;37.77;-3.78;9;5.54;24.5
Jaén;37.77;-3.78;10;3.95;19.1
Jaén;37.77;-3.78;11;2.75;13.2
Jaén;37.77;-3.78;12;2.18;10.0
Madrid;40.41;-3.70;1;2.14;6.1
Madrid;40.41;-3.70;2;3.15;7.9
Madrid;40.41;-3.70;3;4.48;11.2
Madrid;40.41;-3.70;4;5.51;13.5
Madrid;40.41;-3.70;5;6.62;17.8
Madrid;40.41;-3.70;6;7.54;23.3
Madrid;40.41;-3.70;7;7.78;27.8
Madrid;40.41;-3.70;8;6.84;26.7
Madrid;40.41;-3.70;9;5.25;22.0
Madrid;40.41;-3.70;10;3.52;15.9
Madrid;40.41;-3.70;11;2.36;10.1
Madrid;40.41;-3.70;12;1.84;6.9
`;
  }

  return `# OrientSol 4.0 - Plantilla de Climatología Individual
# Localidad: Jaén
# Latitud: 37.7796
# Longitud: -3.7849
# Radiación: en kWh/m²/día (ej: 2.45) o mensual en kWh/m²/mes (se convierte automáticamente)
mes;radiacion_media;temp_media
1;2.45;9.2
2;3.31;10.5
3;4.68;13.8
4;5.82;16.5
5;6.95;20.8
6;7.92;26.1
7;8.10;29.4
8;7.25;28.9
9;5.54;24.5
10;3.95;19.1
11;2.75;13.2
12;2.18;10.0
`;
}

/**
 * Generates sample JSON template for download.
 * If isMulti is true, generates a multi-location array template.
 */
export function generateSampleJSON(isMulti = false): string {
  if (isMulti) {
    return JSON.stringify(
      [
        {
          locationName: 'Jaén',
          latitude: 37.7796,
          longitude: -3.7849,
          monthlyGdm0: [2.45, 3.31, 4.68, 5.82, 6.95, 7.92, 8.10, 7.25, 5.54, 3.95, 2.75, 2.18],
          monthlyTemperature: [9.2, 10.5, 13.8, 16.5, 20.8, 26.1, 29.4, 28.9, 24.5, 19.1, 13.2, 10.0]
        },
        {
          locationName: 'Madrid',
          latitude: 40.4168,
          longitude: -3.7038,
          monthlyGdm0: [2.14, 3.15, 4.48, 5.51, 6.62, 7.54, 7.78, 6.84, 5.25, 3.52, 2.36, 1.84],
          monthlyTemperature: [6.1, 7.9, 11.2, 13.5, 17.8, 23.3, 27.8, 26.7, 22.0, 15.9, 10.1, 6.9]
        }
      ],
      null,
      2
    );
  }

  return JSON.stringify(
    {
      locationName: 'Jaén',
      latitude: 37.7796,
      longitude: -3.7849,
      monthlyGdm0: [2.45, 3.31, 4.68, 5.82, 6.95, 7.92, 8.10, 7.25, 5.54, 3.95, 2.75, 2.18],
      monthlyTemperature: [9.2, 10.5, 13.8, 16.5, 20.8, 26.1, 29.4, 28.9, 24.5, 19.1, 13.2, 10.0]
    },
    null,
    2
  );
}
