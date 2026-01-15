import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useBatches() {
  return useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const response = await api.get("/batches");
      return response.data;
    },
    refetchInterval: 5000
  });
}
