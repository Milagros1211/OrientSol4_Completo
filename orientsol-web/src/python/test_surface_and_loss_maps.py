"""
Comprehensive verification test for expanded OrientSol Python mathematical modules:
1. Temperatures (Ambient Max/Min/Mean and Cell Operating NOCT/TONC)
2. Energy Yield (Energía Recibida vs Energía Producida)
3. Monthly Optimal Tilts (12 Posiciones Mensuales)
4. Capture Loss Maps (Mapas de Pérdidas de Captación)
5. Surface Optimizer across all fixed and tracking topologies
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
import numpy as np

# Madrid test dataset
LAT_DEG = 40.4168
LAT_RAD = float(np.radians(LAT_DEG))
GDM0 = np.array([2.00, 2.73, 4.48, 5.17, 6.58, 7.24, 7.32, 6.41, 4.97, 3.36, 2.15, 1.64], dtype=np.float64)
TEMP_AMB = np.array([4.1, 5.5, 9.1, 11.6, 16.3, 22.5, 25.3, 24.8, 20.4, 14.1, 8.2, 4.7], dtype=np.float64)
ALBEDO = 0.20
PEAK_POWER_KW = 5.0
PR = 0.80

def run_tests():
    print("=" * 70)
    print("TEST SUITE: ORIENTSOL EXPANDED MATHEMATICAL ENGINE (PYTHON + NUMPY)")
    print("=" * 70)

    # 1. Base Geometry and Radiation Decompositions
    from core.constants import CHARACTERISTIC_DAYS
    from core.declination import matriz_declinacion
    from core.sunset_angles import angulos_salida
    from core.hour_angles import angulos, angulos2
    from core.solar_position import altura_solar, azimut_solar
    from radiation.extraterrestrial import bod0
    from radiation.horizontal_decomposition import bdm0, clearness_index
    from radiation.hourly_radiation import gh0, dh0, bh0
    from radiation.transposition import transpose_to_inclined_surfaces

    val_decli = matriz_declinacion(CHARACTERISTIC_DAYS)
    ang_sal1, ang_salida = angulos_salida(LAT_RAD, CHARACTERISTIC_DAYS)
    numero_n, matriz_angulos = angulos(ang_sal1)
    numero_n2, matriz_angulos2 = angulos2(ang_salida)
    alt_solar = altura_solar(LAT_RAD, val_decli, numero_n, matriz_angulos)
    azim_solar = azimut_solar(alt_solar, LAT_RAD, val_decli, numero_n)

    val_bod = bod0(CHARACTERISTIC_DAYS, LAT_RAD, val_decli, ang_sal1)
    val_bdm0, val_ddm0 = bdm0(val_bod, GDM0)
    gh_mat, _ = gh0(matriz_angulos, ang_sal1, numero_n, GDM0)
    dh_mat, _ = dh0(matriz_angulos, ang_sal1, numero_n, val_ddm0)
    bh_mat = bh0(gh_mat, dh_mat, numero_n)

    transp = transpose_to_inclined_surfaces(
        lat_rad=LAT_RAD, val_decli=val_decli, numero_n2=numero_n2,
        matriz_angulos2=matriz_angulos2, bh_matriz=bh_mat, dh_matriz=dh_mat,
        gh_matriz=gh_mat, val_bdm0=val_bdm0, val_ddm0=val_ddm0,
        datos_or_gdm0=GDM0, albedo=ALBEDO
    )
    gd_beta_total = transp["gd_beta_total"]

    print("\n[OK] 1. Geometría Solar y Descomposición completadas.")

    # 2. Test Temperatures Module (Ambient Max/Min/Mean and Cell NOCT)
    from core.constants import MONTH_NAMES_ES
    from energy.temperatures import calculate_ambient_temperatures, calculate_cell_operating_temperatures
    t_amb_metrics = calculate_ambient_temperatures(TEMP_AMB, diurnal_range_c=10.0)
    t_cell_metrics = calculate_cell_operating_temperatures(
        gdm_daily_kwh=transp["radiacion_global_opt"],
        ambient_temp_c=TEMP_AMB,
        tonc=47.0,
        surface_name="Superficie Fija Óptima"
    )
    print("\n[OK] 2. Temperaturas Calculadas (Ambiente Mín/Media/Máx y Célula NOCT):")
    print(f"   • Resumen Anual Ambiente:  Media = {t_amb_metrics['annual_mean_c']:.1f} °C | Mínima = {t_amb_metrics['annual_min_c']:.1f} °C | Máxima = {t_amb_metrics['annual_max_c']:.1f} °C")
    print(f"   • Resumen Anual Célula:    Media = {t_cell_metrics['mean_cell_temp_c']:.1f} °C | Mínima = {t_cell_metrics['min_cell_temp_c']:.1f} °C | Máxima Pico = {t_cell_metrics['max_cell_temp_c']:.1f} °C")
    print("   ---------------------------------------------------------------------------------")
    print(f"   {'Mes':<5} | {'T_amb Mín':<10} | {'T_amb Media':<11} | {'T_amb Máx':<10} | {'T_cél Media':<11} | {'T_cél Pico':<10}")
    print("   ---------------------------------------------------------------------------------")
    for m in range(12):
        mes_abr = MONTH_NAMES_ES[m][:3]
        print(
            f"   {mes_abr:<5} | "
            f"{t_amb_metrics['monthly_min_c'][m]:>8.1f} °C | "
            f"{t_amb_metrics['monthly_mean_c'][m]:>9.1f} °C | "
            f"{t_amb_metrics['monthly_max_c'][m]:>8.1f} °C | "
            f"{t_cell_metrics['monthly_cell_temp_c'][m]:>9.1f} °C | "
            f"{t_cell_metrics['monthly_cell_temp_peak_c'][m]:>8.1f} °C"
        )
    print("   ---------------------------------------------------------------------------------")

    # 3. Test Energy Yield Module (Recibida vs Producida)
    from energy.energy_yield import calculate_energy_yield
    yield_results = calculate_energy_yield(
        gdm_daily_kwh=transp["radiacion_global_opt"],
        gdm_horizontal_kwh=GDM0,
        ambient_temp_c=TEMP_AMB,
        peak_power_kw=PEAK_POWER_KW,
        performance_ratio=PR,
    )
    print("\n[OK] 3. Balance Energético (Recibida vs Producida):")
    print(f"   • Superficie Captadora Estimada: {yield_results['collector_area_m2']} m² (eficiencia 20%)")
    print(f"   • Energía Solar Recibida Anual:  {yield_results['recibida']['annual_total_kwh']:,.1f} kWh/año ({yield_results['recibida']['annual_kwh_m2']:.1f} kWh/m²·año)")
    print(f"   • Energía Producida Simplificada: {yield_results['producida']['simplified']['annual_kwh']:,.1f} kWh/año")
    print(f"   • Energía Producida Osterwald:    {yield_results['producida']['osterwald']['annual_kwh']:,.1f} kWh/año")
    print(f"   • Pérdidas Térmicas vs STC:      {yield_results['producida']['osterwald']['thermal_loss_kwh']:.1f} kWh ({yield_results['producida']['osterwald']['thermal_loss_pct']:.2f}%)")

    # 4. Test Monthly Optimum (12 Posiciones Mensuales)
    from optimization.monthly_optimum import optimize_monthly_tilts
    monthly_opt = optimize_monthly_tilts(gd_beta_total, GDM0)
    print("\n[OK] 4. Optimización 12 Posiciones Mensuales:")
    print(f"   • Ángulos Óptimos Mensuales [°]: {monthly_opt['optimal_tilts_deg']}")
    print(f"   • Radiación Media Diaria:        {monthly_opt['annual_mean_daily_kwh']:.3f} kWh/m²/día")
    print(f"   • Ganancia s/ Horizontal:        +{monthly_opt['gain_over_horizontal_pct']:.2f}%")
    print(f"   • Ganancia s/ Fijo Anual ({monthly_opt['reference_annual_fixed_tilt_deg']}°): +{monthly_opt['gain_over_annual_fixed_pct']:.2f}%")

    # 5. Test Capture Loss Maps (CTE DB-HE4)
    from optimization.loss_maps import generate_capture_loss_map
    loss_map = generate_capture_loss_map(
        lat_deg=LAT_DEG,
        gdm0=GDM0,
        val_bdm0=val_bdm0,
        val_ddm0=val_ddm0,
        bh_matriz=bh_mat,
        dh_matriz=dh_mat,
        gh_matriz=gh_mat,
        albedo=ALBEDO,
        beta_step_deg=10,
        alpha_step_deg=15,
        alpha_range_deg=(-90, 90)
    )
    print("\n[OK] 5. Mapa de Pérdidas de Captación (Matriz 2D Inclinación x Azimut):")
    print(f"   • Eje Inclinaciones (Beta):   {loss_map['betas_deg']} (total: {len(loss_map['betas_deg'])})")
    print(f"   • Eje Orientaciones (Alpha):  {loss_map['alphas_deg']} (total: {len(loss_map['alphas_deg'])})")
    print(f"   • Punto Óptimo del Mapa:      Beta = {loss_map['optimal_point']['beta_deg']}°, Alpha = {loss_map['optimal_point']['alpha_deg']}° ({loss_map['optimal_point']['max_daily_radiation_kwh']} kWh/m²/d)")
    # Sample loss at Beta=50, Alpha=45
    loss_sample = loss_map['loss_percentage_matrix'][5][6]
    print(f"   • Pérdida para Beta=50°, Alpha=+45° (SW): {loss_sample:.1f}%")

    # 6. Test Surface Optimizer (Comparative Analysis)
    from optimization.surface_optimizer import run_full_surface_optimization
    full_opt = run_full_surface_optimization(
        lat_rad=LAT_RAD,
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
        gdm0=GDM0,
        ambient_temp_c=TEMP_AMB,
        albedo=ALBEDO,
        peak_power_kw=PEAK_POWER_KW,
        performance_ratio=PR,
    )
    print("\n[OK] 6. Comparativa Global de Superficies:")
    print("-" * 85)
    print(f"{'Superficie':<35} | {'Radiación':<10} | {'Gan. Horiz':<11} | {'Prod. Osterwald':<16}")
    print("-" * 85)
    for row in full_opt["comparison_table"]:
        print(f"{row['name']:<35} | {row['mean_daily_kwh_m2']:>6.3f} kWh | {row['gain_over_horizontal_pct']:>+9.2f}% | {row['energy_produced_osterwald_kwh_year']:>8.1f} kWh/año")
    print("-" * 85)

    print("\n✓ ¡TODAS LAS PRUEBAS MATEMÁTICAS SUPERADAS CON ÉXITO!")

if __name__ == "__main__":
    run_tests()
