import { pyodideService } from '@/services/pyodide';
import type { ClimateDataRecord } from '@/types/climate';

export interface SolarBridgeSimulationParams {
  climateData: ClimateDataRecord;
  albedo?: number;
  peakPowerKw?: number;
  performanceRatio?: number;
  tempCoefficient?: number;
  tonc?: number;
}

export interface MonthlyCaptureLossMap {
  monthIndex: number;
  monthName: string;
  optimalPoint: {
    betaDeg: number;
    alphaDeg: number;
    maxDailyRadiationKwh: number;
  };
  radiationMatrixKwhM2Day: number[][];
  lossPercentageMatrix: number[][];
  cteZones: {
    generalPctCompliant: number;
    superpositionPctCompliant: number;
    integrationPctCompliant: number;
  };
}

export interface SeasonalCaptureLossMap {
  seasonIndex: number;
  seasonKey: 'winter' | 'spring' | 'summer' | 'autumn';
  seasonName: string;
  seasonNameEn: string;
  monthsIncluded: string;
  monthsIncludedEn?: string;
  optimalPoint: {
    betaDeg: number;
    alphaDeg: number;
    maxDailyRadiationKwh: number;
  };
  radiationMatrixKwhM2Day: number[][];
  lossPercentageMatrix: number[][];
  cteZones: {
    generalPctCompliant: number;
    superpositionPctCompliant: number;
    integrationPctCompliant: number;
  };
}

export interface CaptureLossMapResult {
  betasDeg: number[];
  alphasDeg: number[];
  radiationMatrixKwhM2Day: number[][];
  lossPercentageMatrix: number[][];
  optimalPoint: {
    betaDeg: number;
    alphaDeg: number;
    maxDailyRadiationKwh: number;
    maxAnnualRadiationKwhM2: number;
  };
  cteZones: {
    generalPctCompliant: number;
    superpositionPctCompliant: number;
    integrationPctCompliant: number;
  };
  monthlyMaps?: MonthlyCaptureLossMap[];
  seasonalMaps?: SeasonalCaptureLossMap[];
}

export interface SolarBridgeSimulationResult {
  source: string;
  locationName: string;
  latitude: number;
  longitude: number;
  executionTimeMs: number;

  // Temperatures
  temperatures: {
    ambient: {
      annualMeanC: number;
      annualMaxC: number;
      annualMinC: number;
      monthlyMeanC: number[];
      monthlyMaxC: number[];
      monthlyMinC: number[];
    };
    cellOperating: {
      meanCellTempOptimalC: number;
      maxCellTempOptimalC: number;
      minCellTempOptimalC: number;
      monthlyCellTempOptimalC: number[];
    };
  };

  // Horizontal baseline
  horizontal: {
    gdm0: number[];
    bdm0: number[];
    ddm0: number[];
    bod0: number[];
    ktm: number[];
    annualMeanDailyKwh: number;
    annualTotalKwh: number;
  };

  // Fixed Optimal Annual Tilt
  optimalAnnual: {
    optimalTiltDeg: number;
    monthlyDailyKwh: number[];
    annualMeanDailyKwh: number;
    annualTotalKwh: number;
    gainOverHorizontalPct: number;
    components91?: {
      global: number[][];
      beam: number[][];
      diffuse: number[][];
      albedo: number[][];
    };
    horizontalComponents?: {
      global: number[];
      beam: number[];
      diffuse: number[];
      albedo: number[];
    };
  };

  // 4-Season Optimization
  seasonal: {
    winterTiltDeg: number;
    winterMeanDailyKwh: number;
    springTiltDeg: number;
    springMeanDailyKwh: number;
    summerTiltDeg: number;
    summerMeanDailyKwh: number;
    autumnTiltDeg: number;
    autumnMeanDailyKwh: number;
    monthlyDailyKwh: number[];
    annualMeanDailyKwh: number;
    annualTotalKwh: number;
    gainOverHorizontalPct: number;
    gainOverOptimalAnnualPct: number;
  };

  // 12 Monthly Optimum Positions
  monthlyOptimum12: {
    optimalTiltsDeg: number[];
    monthlyDailyKwh: number[];
    annualMeanDailyKwh: number;
    annualTotalKwh: number;
    gainOverHorizontalPct: number;
    gainOverOptimalAnnualPct: number;
  };

  // Tracking Systems
  tracking: {
    horizontalAxis: {
      annualMeanDailyKwh: number;
      annualTotalKwh: number;
      gainOverHorizontalPct: number;
      gainOverOptimalAnnualPct: number;
      monthlyDailyKwh: number[];
      components?: {
        global: number[];
        beam: number[];
        diffuse: number[];
        albedo: number[];
      };
    };
    azimuthalAxis: {
      annualMeanDailyKwh: number;
      annualTotalKwh: number;
      gainOverHorizontalPct: number;
      gainOverOptimalAnnualPct: number;
      monthlyDailyKwh: number[];
      components?: {
        global: number[];
        beam: number[];
        diffuse: number[];
        albedo: number[];
      };
    };
    polarAxis: {
      annualMeanDailyKwh: number;
      annualTotalKwh: number;
      gainOverHorizontalPct: number;
      gainOverOptimalAnnualPct: number;
      monthlyDailyKwh: number[];
      components?: {
        global: number[];
        beam: number[];
        diffuse: number[];
        albedo: number[];
      };
    };
    dualAxis: {
      annualMeanDailyKwh: number;
      annualTotalKwh: number;
      gainOverHorizontalPct: number;
      gainOverOptimalAnnualPct: number;
      monthlyDailyKwh: number[];
      components?: {
        global: number[];
        beam: number[];
        diffuse: number[];
        albedo: number[];
      };
    };
  };

  // Energy Yield Balance (Recibida vs Producida)
  energyYield: {
    collectorAreaM2: number;
    recibida: {
      annualTotalKwh: number;
      annualKwhM2: number;
      meanDailyKwhM2: number;
      monthlyTotalKwh: number[];
    };
    producida: {
      simplified: {
        annualKwh: number;
        specificYieldKwhKwp: number;
        monthlyKwh: number[];
      };
      osterwald: {
        annualKwh: number;
        specificYieldKwhKwp: number;
        thermalLossKwh: number;
        thermalLossPct: number;
        meanCellTempDegC: number;
        monthlyKwh: number[];
      };
    };
  };

  // 2D Capture Loss Map (CTE DB-HE4)
  captureLossMap: CaptureLossMapResult;


  // Global Surface Comparison across all 8 surfaces
  surfaceComparison: Array<{
    key: string;
    name: string;
    category: string;
    meanDailyKwhM2: number;
    annualRadiationKwhM2: number;
    gainOverHorizontalPct: number;
    gainOverAnnualFixedPct: number;
    energyProducedSimplifiedKwh: number;
    energyProducedOsterwaldKwhYear: number;
    meanCellTempDegC: number;
    thermalLossPct: number;
  }>;

  // PV Energy Generation (Backward compatibility)
  energy: {
    simplified: {
      horizontalKwh: number;
      optimalAnnualKwh: number;
      seasonalKwh: number;
      dualAxisKwh: number;
    };
    osterwald: {
      horizontalKwh: number;
      optimalAnnualKwh: number;
      seasonalKwh: number;
      dualAxisKwh: number;
      meanCellTempHorizontalC: number;
      meanCellTempOptimalC: number;
      meanCellTempDualAxisC: number;
      monthlyEnergyOptimalKwh: number[];
    };
  };
}

/**
 * Executes full OrientSol solar simulation inside Pyodide using data fetched from TypeScript.
 */
export async function executeSolarSimulationFromClimateData(
  params: SolarBridgeSimulationParams
): Promise<SolarBridgeSimulationResult> {
  const {
    climateData,
    albedo = 0.20,
    peakPowerKw = 5.0,
    performanceRatio = 0.80,
    tempCoefficient = -0.004,
    tonc = 47.0,
  } = params;

  const lat = climateData.latitude;
  const gdm0Json = JSON.stringify(climateData.monthlyGdm0);
  const tempJson = JSON.stringify(climateData.monthlyTemperature);

  const pythonScript = `
import json
import sys
if '/orient' not in sys.path:
    sys.path.insert(0, '/orient')

import numpy as np
from core.constants import CHARACTERISTIC_DAYS
from core.conversions import deg2rad
from core.declination import matriz_declinacion
from core.sunset_angles import angulos_salida
from core.hour_angles import angulos, angulos2
from core.solar_position import altura_solar, azimut_solar
from radiation.extraterrestrial import bod0
from radiation.horizontal_decomposition import bdm0, clearness_index
from radiation.hourly_radiation import gh0, dh0, bh0
from radiation.transposition import transpose_to_inclined_surfaces
from optimization.seasonal_optimum import optimize_seasonal_tilts
from optimization.monthly_optimum import optimize_monthly_tilts
from optimization.loss_maps import generate_capture_loss_map
from optimization.surface_optimizer import run_full_surface_optimization
from tracking.dual_axis import simulate_dual_axis_tracking
from tracking.polar_axis import simulate_polar_axis_tracking
from tracking.azimuthal_axis import simulate_azimuthal_axis_tracking
from tracking.horizontal_axis import simulate_horizontal_axis_tracking
from energy.simplified import calculate_simplified_energy
from energy.osterwald import calculate_osterwald_energy
from energy.temperatures import calculate_ambient_temperatures, calculate_cell_operating_temperatures
from energy.energy_yield import calculate_energy_yield

lat_deg = ${lat}
lat_rad = float(deg2rad(lat_deg))
gdm0 = np.array(${gdm0Json}, dtype=np.float64)
ambient_temp = np.array(${tempJson}, dtype=np.float64)
albedo = float(${albedo})
peak_power_kw = float(${peakPowerKw})
pr = float(${performanceRatio})
temp_coeff = float(${tempCoefficient})
tonc = float(${tonc})

# 1. Base Solar Geometry
val_decli = matriz_declinacion(CHARACTERISTIC_DAYS)
ang_sal1, ang_salida = angulos_salida(lat_rad, CHARACTERISTIC_DAYS)
numero_n, matriz_angulos = angulos(ang_sal1)
numero_n2, matriz_angulos2 = angulos2(ang_salida)
alt_solar = altura_solar(lat_rad, val_decli, numero_n, matriz_angulos)
azim_solar = azimut_solar(alt_solar, lat_rad, val_decli, numero_n)

# 2. Horizontal Decomposition
val_bod = bod0(CHARACTERISTIC_DAYS, lat_rad, val_decli, ang_sal1)
val_bdm0, val_ddm0 = bdm0(val_bod, gdm0)
ktm = clearness_index(gdm0, val_bod)

gh_mat, _ = gh0(matriz_angulos, ang_sal1, numero_n, gdm0)
dh_mat, _ = dh0(matriz_angulos, ang_sal1, numero_n, val_ddm0)
bh_mat = bh0(gh_mat, dh_mat, numero_n)

# 3. Transposition & Optimal Annual Tilt
transp = transpose_to_inclined_surfaces(
    lat_rad=lat_rad,
    val_decli=val_decli,
    numero_n2=numero_n2,
    matriz_angulos2=matriz_angulos2,
    bh_matriz=bh_mat,
    dh_matriz=dh_mat,
    gh_matriz=gh_mat,
    val_bdm0=val_bdm0,
    val_ddm0=val_ddm0,
    datos_or_gdm0=gdm0,
    albedo=albedo,
)

opt_beta = int(transp["opt_angle_deg"])
gd_opt_ann = transp["radiacion_global_opt"]
mean_g0 = float(np.mean(gdm0))
mean_opt = float(transp["media_global_opt"])

# 4. Seasonal Tilt Optimization (4 positions)
seasonal_opt = optimize_seasonal_tilts(
    gd_beta_total=transp["gd_beta_total"],
    datos_or_gdm0=gdm0,
)
seasons = seasonal_opt["seasons"]
gd_opt_seas = seasonal_opt["gd_opt_seasonal"]
mean_seas = float(seasonal_opt["annual_mean_kwh"])

# 5. Monthly Optimum Tilt (12 positions)
monthly_opt = optimize_monthly_tilts(transp["gd_beta_total"], gdm0)

# 6. Tracking Systems
res_horiz_track = simulate_horizontal_axis_tracking(lat_rad, val_decli, numero_n, matriz_angulos, alt_solar, azim_solar, bh_mat, dh_mat, gh_mat, albedo)
res_azim_track = simulate_azimuthal_axis_tracking(lat_rad, val_decli, numero_n, matriz_angulos, azim_solar, bh_mat, dh_mat, gh_mat, albedo)
res_polar_track = simulate_polar_axis_tracking(lat_rad, val_decli, numero_n, matriz_angulos, alt_solar, bh_mat, dh_mat, gh_mat, albedo)
res_2axis = simulate_dual_axis_tracking(lat_rad, val_decli, numero_n, matriz_angulos, alt_solar, azim_solar, bh_mat, dh_mat, gh_mat, albedo)

# 7. Temperatures (Ambient Max/Min/Mean and Operating Cell)
t_amb_metrics = calculate_ambient_temperatures(ambient_temp, diurnal_range_c=10.0)
t_cell_opt = calculate_cell_operating_temperatures(gd_opt_ann, ambient_temp, tonc=tonc, surface_name="Fija Óptima Anual")

# 8. Energy Balance (Recibida vs Producida)
yield_opt = calculate_energy_yield(
    gdm_daily_kwh=gd_opt_ann,
    gdm_horizontal_kwh=gdm0,
    ambient_temp_c=ambient_temp,
    peak_power_kw=peak_power_kw,
    performance_ratio=pr,
    temp_coefficient=temp_coeff,
    tonc=tonc,
)

# 9. 2D Capture Loss Map (CTE DB-HE4)
seasonal_opt_dict = {
    "winter": {"opt_angle_deg": float(seasons["winter"]["opt_angle_deg"]), "mean_daily_kwh": float(seasons["winter"]["mean_daily_kwh"])},
    "spring": {"opt_angle_deg": float(seasons["spring"]["opt_angle_deg"]), "mean_daily_kwh": float(seasons["spring"]["mean_daily_kwh"])},
    "summer": {"opt_angle_deg": float(seasons["summer"]["opt_angle_deg"]), "mean_daily_kwh": float(seasons["summer"]["mean_daily_kwh"])},
    "autumn": {"opt_angle_deg": float(seasons["autumn"]["opt_angle_deg"]), "mean_daily_kwh": float(seasons["autumn"]["mean_daily_kwh"])},
}

loss_map = generate_capture_loss_map(
    lat_deg=lat_deg,
    gdm0=gdm0,
    val_bdm0=val_bdm0,
    val_ddm0=val_ddm0,
    bh_matriz=bh_mat,
    dh_matriz=dh_mat,
    gh_matriz=gh_mat,
    albedo=albedo,
    beta_step_deg=5,
    alpha_step_deg=7.5,
    alpha_range_deg=(-90, 90),
    annual_opt_tilt_deg=float(opt_beta),
    monthly_opt_tilts_deg=[float(v) for v in monthly_opt["optimal_tilts_deg"]],
    seasonal_optima=seasonal_opt_dict,
)

# 10. Comparative Surface Optimization Engine
full_opt = run_full_surface_optimization(
    lat_rad=lat_rad,
    val_decli=val_decli,
    numero_n=numero_n,
    numero_n2=numero_n2,
    matriz_angulos=matriz_angulos,
    matriz_angulos2=matriz_angulos2,
    alt_solar=alt_solar,
    azim_solar=azim_solar,
    bh_matriz=bh_mat,
    dh_matriz=dh_mat,
    gh_matriz=gh_mat,
    val_bdm0=val_bdm0,
    val_ddm0=val_ddm0,
    gdm0=gdm0,
    ambient_temp_c=ambient_temp,
    albedo=albedo,
    peak_power_kw=peak_power_kw,
    performance_ratio=pr,
    temp_coefficient=temp_coeff,
    tonc=tonc,
)

# Legacy Models for backward compatibility
sim_h = calculate_simplified_energy(gdm0, gdm0, peak_power_kw, pr)
sim_opt = calculate_simplified_energy(gd_opt_ann, gdm0, peak_power_kw, pr)
sim_seas = calculate_simplified_energy(gd_opt_seas, gdm0, peak_power_kw, pr)
sim_2ax = calculate_simplified_energy(res_2axis["gd_daily"], gdm0, peak_power_kw, pr)

ost_h = calculate_osterwald_energy(gdm0, gdm0, ambient_temp, peak_power_kw, temp_coeff, tonc)
ost_opt = calculate_osterwald_energy(gd_opt_ann, gdm0, ambient_temp, peak_power_kw, temp_coeff, tonc)
ost_seas = calculate_osterwald_energy(gd_opt_seas, gdm0, ambient_temp, peak_power_kw, temp_coeff, tonc)
ost_2ax = calculate_osterwald_energy(res_2axis["gd_daily"], gdm0, ambient_temp, peak_power_kw, temp_coeff, tonc)

output_data = {
    "temperatures": {
        "ambient": {
            "annualMeanC": round(float(t_amb_metrics["annual_mean_c"]), 1),
            "annualMaxC": round(float(t_amb_metrics["annual_max_c"]), 1),
            "annualMinC": round(float(t_amb_metrics["annual_min_c"]), 1),
            "monthlyMeanC": [round(float(v), 1) for v in t_amb_metrics["monthly_mean_c"]],
            "monthlyMaxC": [round(float(v), 1) for v in t_amb_metrics["monthly_max_c"]],
            "monthlyMinC": [round(float(v), 1) for v in t_amb_metrics["monthly_min_c"]],
        },
        "cellOperating": {
            "meanCellTempOptimalC": round(float(t_cell_opt["mean_cell_temp_c"]), 1),
            "maxCellTempOptimalC": round(float(t_cell_opt["max_cell_temp_c"]), 1),
            "minCellTempOptimalC": round(float(t_cell_opt["min_cell_temp_c"]), 1),
            "monthlyCellTempOptimalC": [round(float(v), 1) for v in t_cell_opt["monthly_cell_temp_c"]],
        },
    },
    "horizontal": {
        "gdm0": [round(float(v), 3) for v in gdm0],
        "bdm0": [round(float(v), 3) for v in val_bdm0],
        "ddm0": [round(float(v), 3) for v in val_ddm0],
        "bod0": [round(float(v), 1) for v in val_bod],
        "ktm": [round(float(v), 3) for v in ktm],
        "annualMeanDailyKwh": round(mean_g0, 3),
        "annualTotalKwh": round(mean_g0 * 365.0, 1),
    },
    "optimalAnnual": {
        "optimalTiltDeg": opt_beta,
        "monthlyDailyKwh": [round(float(v), 3) for v in gd_opt_ann],
        "annualMeanDailyKwh": round(mean_opt, 3),
        "annualTotalKwh": round(mean_opt * 365.0, 1),
        "gainOverHorizontalPct": round(((mean_opt - mean_g0) / mean_g0) * 100.0, 2),
        "components91": {
            "global": [[round(float(v), 2) for v in row] for row in transp["gd_beta_total"]],
            "beam": [[round(float(v), 2) for v in row] for row in transp["bd_beta_total"]],
            "diffuse": [[round(float(v), 2) for v in row] for row in transp["dd_beta_total"]],
            "albedo": [[round(float(v), 2) for v in row] for row in transp["rd_beta_total"]],
        },
        "horizontalComponents": {
            "global": [round(float(v), 2) for v in gdm0],
            "beam": [round(float(v), 2) for v in val_bdm0],
            "diffuse": [round(float(v), 2) for v in val_ddm0],
            "albedo": [0.0] * 12,
        },
    },
    "seasonal": {
        "winterTiltDeg": int(seasons["winter"]["opt_angle_deg"]),
        "winterMeanDailyKwh": round(float(seasons["winter"]["mean_daily_kwh"]), 3),
        "springTiltDeg": int(seasons["spring"]["opt_angle_deg"]),
        "springMeanDailyKwh": round(float(seasons["spring"]["mean_daily_kwh"]), 3),
        "summerTiltDeg": int(seasons["summer"]["opt_angle_deg"]),
        "summerMeanDailyKwh": round(float(seasons["summer"]["mean_daily_kwh"]), 3),
        "autumnTiltDeg": int(seasons["autumn"]["opt_angle_deg"]),
        "autumnMeanDailyKwh": round(float(seasons["autumn"]["mean_daily_kwh"]), 3),
        "monthlyDailyKwh": [round(float(v), 3) for v in gd_opt_seas],
        "annualMeanDailyKwh": round(mean_seas, 3),
        "annualTotalKwh": round(mean_seas * 365.0, 1),
        "gainOverHorizontalPct": round(((mean_seas - mean_g0) / mean_g0) * 100.0, 2),
        "gainOverOptimalAnnualPct": round(((mean_seas - mean_opt) / mean_opt) * 100.0, 2),
    },
    "monthlyOptimum12": {
        "optimalTiltsDeg": [int(v) for v in monthly_opt["optimal_tilts_deg"]],
        "monthlyDailyKwh": [round(float(v), 3) for v in monthly_opt["monthly_daily_kwh"]],
        "annualMeanDailyKwh": round(float(monthly_opt["annual_mean_daily_kwh"]), 3),
        "annualTotalKwh": round(float(monthly_opt["annual_total_kwh_m2"]), 1),
        "gainOverHorizontalPct": round(float(monthly_opt["gain_over_horizontal_pct"]), 2),
        "gainOverOptimalAnnualPct": round(float(monthly_opt["gain_over_annual_fixed_pct"]), 2),
    },
    "tracking": {
        "horizontalAxis": {
            "annualMeanDailyKwh": round(float(res_horiz_track["media_gd"]), 3),
            "annualTotalKwh": round(float(res_horiz_track["media_gd"]) * 365.0, 1),
            "gainOverHorizontalPct": round(((res_horiz_track["media_gd"] - mean_g0) / mean_g0) * 100.0, 2),
            "gainOverOptimalAnnualPct": round(((res_horiz_track["media_gd"] - mean_opt) / mean_opt) * 100.0, 2),
            "monthlyDailyKwh": [round(float(v), 3) for v in res_horiz_track["gd_daily"]],
            "components": {
                "global": [round(float(v), 3) for v in res_horiz_track["gd_daily"]],
                "beam": [round(float(v), 3) for v in res_horiz_track["bd_daily"]],
                "diffuse": [round(float(v), 3) for v in res_horiz_track["dd_daily"]],
                "albedo": [round(float(v), 3) for v in res_horiz_track["rd_daily"]],
            },
        },
        "azimuthalAxis": {
            "annualMeanDailyKwh": round(float(res_azim_track["media_gd"]), 3),
            "annualTotalKwh": round(float(res_azim_track["media_gd"]) * 365.0, 1),
            "gainOverHorizontalPct": round(((res_azim_track["media_gd"] - mean_g0) / mean_g0) * 100.0, 2),
            "gainOverOptimalAnnualPct": round(((res_azim_track["media_gd"] - mean_opt) / mean_opt) * 100.0, 2),
            "monthlyDailyKwh": [round(float(v), 3) for v in res_azim_track["gd_daily"]],
            "components": {
                "global": [round(float(v), 3) for v in res_azim_track["gd_daily"]],
                "beam": [round(float(v), 3) for v in res_azim_track["bd_daily"]],
                "diffuse": [round(float(v), 3) for v in res_azim_track["dd_daily"]],
                "albedo": [round(float(v), 3) for v in res_azim_track["rd_daily"]],
            },
        },
        "polarAxis": {
            "annualMeanDailyKwh": round(float(res_polar_track["media_gd"]), 3),
            "annualTotalKwh": round(float(res_polar_track["media_gd"]) * 365.0, 1),
            "gainOverHorizontalPct": round(((res_polar_track["media_gd"] - mean_g0) / mean_g0) * 100.0, 2),
            "gainOverOptimalAnnualPct": round(((res_polar_track["media_gd"] - mean_opt) / mean_opt) * 100.0, 2),
            "monthlyDailyKwh": [round(float(v), 3) for v in res_polar_track["gd_daily"]],
            "components": {
                "global": [round(float(v), 3) for v in res_polar_track["gd_daily"]],
                "beam": [round(float(v), 3) for v in res_polar_track["bd_daily"]],
                "diffuse": [round(float(v), 3) for v in res_polar_track["dd_daily"]],
                "albedo": [round(float(v), 3) for v in res_polar_track["rd_daily"]],
            },
        },
        "dualAxis": {
            "annualMeanDailyKwh": round(float(res_2axis["media_gd"]), 3),
            "annualTotalKwh": round(float(res_2axis["media_gd"]) * 365.0, 1),
            "gainOverHorizontalPct": round(((res_2axis["media_gd"] - mean_g0) / mean_g0) * 100.0, 2),
            "gainOverOptimalAnnualPct": round(((res_2axis["media_gd"] - mean_opt) / mean_opt) * 100.0, 2),
            "monthlyDailyKwh": [round(float(v), 3) for v in res_2axis["gd_daily"]],
            "components": {
                "global": [round(float(v), 3) for v in res_2axis["gd_daily"]],
                "beam": [round(float(v), 3) for v in res_2axis["bd_daily"]],
                "diffuse": [round(float(v), 3) for v in res_2axis["dd_daily"]],
                "albedo": [round(float(v), 3) for v in res_2axis["rd_daily"]],
            },
        },
    },
    "energyYield": {
        "collectorAreaM2": round(float(yield_opt["collector_area_m2"]), 1),
        "recibida": {
            "annualTotalKwh": round(float(yield_opt["recibida"]["annual_total_kwh"]), 1),
            "annualKwhM2": round(float(yield_opt["recibida"]["annual_kwh_m2"]), 1),
            "meanDailyKwhM2": round(float(yield_opt["recibida"].get("mean_daily_kwh_m2", mean_opt)), 3),
            "monthlyTotalKwh": [round(float(v), 1) for v in yield_opt["recibida"]["monthly_total_kwh"]],
        },
        "producida": {
            "simplified": {
                "annualKwh": round(float(yield_opt["producida"]["simplified"]["annual_kwh"]), 1),
                "specificYieldKwhKwp": round(float(yield_opt["producida"]["simplified"]["specific_yield_kwh_kwp"]), 1),
                "monthlyKwh": [round(float(v), 1) for v in yield_opt["producida"]["simplified"]["monthly_kwh"]],
            },
            "osterwald": {
                "annualKwh": round(float(yield_opt["producida"]["osterwald"]["annual_kwh"]), 1),
                "specificYieldKwhKwp": round(float(yield_opt["producida"]["osterwald"]["specific_yield_kwh_kwp"]), 1),
                "thermalLossKwh": round(float(yield_opt["producida"]["osterwald"]["thermal_loss_kwh"]), 1),
                "thermalLossPct": round(float(yield_opt["producida"]["osterwald"]["thermal_loss_pct"]), 2),
                "meanCellTempDegC": round(float(yield_opt["producida"]["osterwald"]["mean_cell_temp_c"]), 1),
                "monthlyKwh": [round(float(v), 1) for v in yield_opt["producida"]["osterwald"]["monthly_kwh"]],
            },
        },
    },
    "captureLossMap": {
        "betasDeg": loss_map["betas_deg"],
        "alphasDeg": loss_map["alphas_deg"],
        "radiationMatrixKwhM2Day": loss_map["radiation_matrix_kwh_m2_day"],
        "lossPercentageMatrix": loss_map["loss_percentage_matrix"],
        "optimalPoint": {
            "betaDeg": float(loss_map["optimal_point"].get("betaDeg", loss_map["optimal_point"].get("beta_deg", 0.0))),
            "alphaDeg": float(loss_map["optimal_point"].get("alphaDeg", loss_map["optimal_point"].get("alpha_deg", 0.0))),
            "maxDailyRadiationKwh": round(float(loss_map["optimal_point"].get("maxDailyRadiationKwh", loss_map["optimal_point"].get("max_daily_radiation_kwh", 0.0))), 3),
            "maxAnnualRadiationKwhM2": round(float(loss_map["optimal_point"].get("maxAnnualRadiationKwhM2", loss_map["optimal_point"].get("annual_irradiation_kwh_m2", 0.0))), 1),
        },
        "cteZones": {
            "generalPctCompliant": round(float(loss_map.get("cte_zones", {}).get("generalPctCompliant", loss_map.get("cte_zones", {}).get("general_pct_compliant", 0.0))), 1),
            "superpositionPctCompliant": round(float(loss_map.get("cte_zones", {}).get("superpositionPctCompliant", loss_map.get("cte_zones", {}).get("superposition_pct_compliant", 0.0))), 1),
            "integrationPctCompliant": round(float(loss_map.get("cte_zones", {}).get("integrationPctCompliant", loss_map.get("cte_zones", {}).get("integration_pct_compliant", 0.0))), 1),
        },
        "monthlyMaps": loss_map.get("monthly_maps", []),
        "seasonalMaps": loss_map.get("seasonal_maps", []),
    },
    "surfaceComparison": [
        {
            "key": item.get("key", ""),
            "name": item.get("name", ""),
            "category": item.get("category", ""),
            "meanDailyKwhM2": round(float(item.get("meanDailyKwhM2", item.get("mean_daily_kwh_m2", 0.0))), 3),
            "annualRadiationKwhM2": round(float(item.get("annualRadiationKwhM2", item.get("annual_irradiation_kwh_m2", 0.0))), 1),
            "gainOverHorizontalPct": round(float(item.get("gainOverHorizontalPct", item.get("gain_over_horizontal_pct", 0.0))), 2),
            "gainOverAnnualFixedPct": round(float(item.get("gainOverAnnualFixedPct", item.get("gain_over_optimal_annual_pct", 0.0))), 2),
            "energyProducedSimplifiedKwh": round(float(item.get("energyProducedSimplifiedKwh", item.get("energy_produced_simplified_kwh_year", 0.0))), 1),
            "energyProducedOsterwaldKwhYear": round(float(item.get("energyProducedOsterwaldKwhYear", item.get("energy_produced_osterwald_kwh_year", 0.0))), 1),
            "meanCellTempDegC": round(float(item.get("meanCellTempDegC", item.get("mean_cell_temp_c", 0.0))), 1),
            "thermalLossPct": round(float(item.get("thermalLossPct", item.get("thermal_loss_pct", 0.0))), 2),
        }
        for item in full_opt.get("comparison_table", [])
    ],
    "energy": {
        "simplified": {
            "horizontalKwh": round(float(sim_h["annual_energy_eval_kwh"]), 2),
            "optimalAnnualKwh": round(float(sim_opt["annual_energy_eval_kwh"]), 2),
            "seasonalKwh": round(float(sim_seas["annual_energy_eval_kwh"]), 2),
            "dualAxisKwh": round(float(sim_2ax["annual_energy_eval_kwh"]), 2),
        },
        "osterwald": {
            "horizontalKwh": round(float(ost_h["annual_energy_eval_kwh"]), 2),
            "optimalAnnualKwh": round(float(ost_opt["annual_energy_eval_kwh"]), 2),
            "seasonalKwh": round(float(ost_seas["annual_energy_eval_kwh"]), 2),
            "dualAxisKwh": round(float(ost_2ax["annual_energy_eval_kwh"]), 2),
            "meanCellTempHorizontalC": round(float(ost_h["mean_cell_temp_eval_degc"]), 1),
            "meanCellTempOptimalC": round(float(ost_opt["mean_cell_temp_eval_degc"]), 1),
            "meanCellTempDualAxisC": round(float(ost_2ax["mean_cell_temp_eval_degc"]), 1),
            "monthlyEnergyOptimalKwh": [round(float(v), 2) for v in ost_opt["monthly_energy_eval_kwh"]],
        },
    },
}

json.dumps(output_data)
`;

  const runResult = await pyodideService.runPython<string>(pythonScript);

  if (!runResult.success || !runResult.result) {
    throw new Error(`Pyodide bridge calculation error: ${runResult.error}\n${runResult.stderr}`);
  }

  const parsed = JSON.parse(runResult.result);

  return {
    source: climateData.source,
    locationName: climateData.locationName,
    latitude: climateData.latitude,
    longitude: climateData.longitude,
    executionTimeMs: runResult.executionTimeMs,
    ...parsed,
  };
}
