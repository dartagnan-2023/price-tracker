import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useMonths } from "../hooks/useMonths";

export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useMonths();
  const months = useMemo(() => data ?? [], [data]);
  const [monthA, setMonthA] = useState<number | null>(null);
  const [monthB, setMonthB] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleCompare = () => {
    if (!monthA || !monthB) {
      return;
    }
    navigate(`/compare?a=${monthA}&b=${monthB}`);
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadMessage("Selecione um arquivo primeiro.");
      return;
    }

    setUploading(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const response = await api.post("/ingest/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setUploadMessage(response.data.message ?? "Arquivo enviado.");
      setUploadFile(null);
      await refetch();
    } catch (error: any) {
      setUploadMessage(error?.response?.data?.error ?? "Falha ao enviar arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMonth = async (monthId: number, label: string) => {
    if (!window.confirm(`Excluir o mes ${label}? Isso remove batches e linhas.`)) {
      return;
    }
    setDeletingId(monthId);
    try {
      await api.delete(`/months/${monthId}`);
      await refetch();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Dashboard</h1>
        <p>Meses importados e batches ativos.</p>
      </header>

      <section className="panel">
        <h2>Comparar meses</h2>
        <div className="compare-controls">
          <label>
            Mes A
            <select value={monthA ?? ""} onChange={(event) => setMonthA(Number(event.target.value) || null)}>
              <option value="">Selecione</option>
              {months.map((month: any) => (
                <option key={month.id} value={month.id}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mes B
            <select value={monthB ?? ""} onChange={(event) => setMonthB(Number(event.target.value) || null)}>
              <option value="">Selecione</option>
              {months.map((month: any) => (
                <option key={month.id} value={month.id}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" onClick={handleCompare} disabled={!monthA || !monthB}>
            Comparar
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Importar arquivo</h2>
        <div className="upload-controls">
          <input
            type="file"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
          <button className="button" onClick={handleUpload} disabled={uploading}>
            {uploading ? "Enviando..." : "Enviar para inbox"}
          </button>
          {uploadMessage && <span className="muted">{uploadMessage}</span>}
        </div>
      </section>

      <section className="panel">
        <h2>Meses importados</h2>
        {isLoading && <p>Carregando...</p>}
        {!isLoading && months.length === 0 && (
          <p>Nenhum mes importado. Coloque arquivos em inbox/.</p>
        )}
        <div className="month-grid">
          {months.map((month: any) => {
            const activeBatch = month.batches.find((batch: any) => batch.isActive);
            const primaryBatch = activeBatch ?? month.batches[0];
            const monthTitle = month.fullDate ?? month.label;
            const primaryFullDate = primaryBatch?.fullDate ?? "-";

            return (
              <div key={month.id} className="month-card">
                <div className="month-card__title">{monthTitle}</div>
                <div className="month-card__meta">Batches: {month.batches.length}</div>
                <div className="month-card__meta">Date: {primaryFullDate}</div>
                <div className="month-card__actions">
                  {primaryBatch && (
                    <Link to={`/batches/${primaryBatch.id}`}>
                      Ver planilha
                    </Link>
                  )}
                  <button
                    className="link-button"
                    onClick={() => handleDeleteMonth(month.id, month.label)}
                    disabled={deletingId === month.id}
                  >
                    Excluir mes
                  </button>
                </div>
                <ul className="month-card__list">
                  {month.batches.map((batch: any) => (
                    <li key={batch.id}>
                      #{batch.id} - {batch.status.toLowerCase()} {batch.isActive ? "(ativo)" : ""}{" "}
                      {batch.status === "PENDING_REVIEW" && (
                        <Link to={`/review/${batch.id}`}>Revisar</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
