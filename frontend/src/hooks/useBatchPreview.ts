import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useBatchPreview(batchId: number | null) {
  return useQuery({
    queryKey: ["batch-preview", batchId],
    queryFn: async () => {
      if (!batchId) {
        return null;
      }
      const response = await api.get(`/batches/${batchId}/preview`);
      return response.data;
    },
    enabled: Boolean(batchId)
  });
}
