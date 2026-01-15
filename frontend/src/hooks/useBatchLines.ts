import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useBatchLines(batchId: number | null, page: number, pageSize: number) {
  return useQuery({
    queryKey: ["batch-lines", batchId, page, pageSize],
    queryFn: async () => {
      if (!batchId) {
        return null;
      }
      const response = await api.get(`/batches/${batchId}/lines`, {
        params: { page, pageSize }
      });
      return response.data;
    }, 
    enabled: Boolean(batchId)
  });
}
