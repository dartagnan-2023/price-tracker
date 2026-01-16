import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function usePartNumberHistory(partNumber: string | null) {
  return useQuery({
    queryKey: ["partNumberHistory", partNumber],
    queryFn: async () => {
      if (!partNumber) {
        throw new Error("partNumber missing");
      }
      const response = await api.get("/lines/history", {
        params: { partNumber }
      });
      return response.data;
    },
    enabled: Boolean(partNumber),
    staleTime: 60_000
  });
}
