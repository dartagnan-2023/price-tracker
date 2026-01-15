import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useBatches } from "../hooks/useBatches";

export function Batches() {
  const { data, isLoading, refetch } = useBatches();
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleActivate = async (batchId: number) => {
    try {
      setActivatingId(batchId);
      await api.post(`/batches/${batchId}/activate`);
      await refetch();
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (batchId: number) => {
    if (!window.confirm("Excluir este batch?")) {
      return;
    }
    setDeletingId(batchId);
    try {
      await api.delete(`/batches/${batchId}`);
      await refetch();
    } finally {
      setDeletingId(null);
    }
  };

  const batches = data ?? [];

  return (
    <div className="page">
      <header className="page__header">
        <h1>Batches</h1>
        <p>Historico de importacoes.</p>
      </header>

      <section className="panel">
        {isLoading && <p>Carregando...</p>}
        {!isLoading && batches.length === 0 && <p>Nenhum batch encontrado.</p>}
        {!isLoading && batches.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Mes</th>
                <th>Status</th>
                <th>Validos/Total</th>
                <th>Ativo</th>
                <th>Data</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch: any) => (
                <tr key={batch.id}>
                  <td>#{batch.id}</td>
                  <td>{batch.month?.label ?? "-"}</td>
                  <td>{batch.status.toLowerCase()}</td>
                  <td>{batch.validLines}/{batch.totalLines}</td>
                  <td>{batch.isActive ? "Sim" : "Nao"}</td>
                  <td>{new Date(batch.importedAt).toLocaleString()}</td>
                  <td className="table__actions">
                    <Link to={`/batches/${batch.id}`}>Revisar</Link>
                    {batch.status === "PENDING_REVIEW" && (
                      <Link to={`/review/${batch.id}`}>Revisar</Link>
                    )}
                    <button
                      className="link-button"
                      onClick={() => handleActivate(batch.id)}
                      disabled={activatingId === batch.id || !batch.month}
                    >
                      Ativar
                    </button>
                    {(batch.status === "FAILED" || batch.status === "PENDING_REVIEW") && (
                      <button
                        className="link-button"
                        onClick={() => handleDelete(batch.id)}
                        disabled={deletingId === batch.id}
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
