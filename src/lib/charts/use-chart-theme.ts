import { useTheme } from "@/lib/theme";

export interface ChartTheme {
  tooltip: {
    backgroundColor: string;
    border: string;
    borderRadius: number;
    color: string;
    fontSize: number;
    boxShadow: string;
  };
  axisTick: string;
  axisLine: string;
  gridStroke: string;
  cursorFill: string;
  /** Borda das fatias/células (= cor da superfície atrás). */
  cellStroke: string;
}

// Cores de gráfico que acompanham o tema (corrige tooltip ilegível no claro).
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return {
    tooltip: {
      backgroundColor: dark ? "#1E2329" : "#FFFFFF",
      border: `1px solid ${dark ? "#2A3038" : "#E2E6EC"}`,
      borderRadius: 10,
      color: dark ? "#F5F6F8" : "#16191B",
      fontSize: 12,
      boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.45)" : "0 8px 24px rgba(16,25,40,0.12)",
    },
    axisTick: dark ? "#9AA4B2" : "#5B6472",
    axisLine: dark ? "#2A3038" : "#E2E6EC",
    gridStroke: dark ? "#2A3038" : "#E2E6EC",
    cursorFill: dark ? "rgba(42,48,56,0.35)" : "rgba(31,79,214,0.06)",
    cellStroke: dark ? "#16191B" : "#FFFFFF",
  };
}
