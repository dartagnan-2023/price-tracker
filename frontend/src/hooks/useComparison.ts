import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useComparison(monthA: number | null, monthB: number | null, filter: string) {
  return useQuery({
    queryKey: ["comparison", monthA, monthB, filter],
    queryFn: async () => {
      if (!monthA || !monthB) {
        return null;
      }
      const response = await api.get("/compare", {
        params: { month_a: monthA, month_b: monthB, filter }
      });
      return response.data;
    },
    enabled: Boolean(monthA && monthB)
  });
}
