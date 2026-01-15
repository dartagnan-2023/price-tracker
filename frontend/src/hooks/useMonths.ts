import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useMonths() {
  return useQuery({
    queryKey: ["months"],
    queryFn: async () => {
      const response = await api.get("/months");
      return response.data;
    },
    refetchInterval: 5000
  });
}
