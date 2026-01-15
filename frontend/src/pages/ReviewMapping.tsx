import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useBatchPreview } from "../hooks/useBatchPreview";

const months = Array.from({ length: 12 }, (_, index) => index + 1);

export function ReviewMapping() {
  const params = useParams();
  const navigate = useNavigate();
  const batchId = Number(params.batch_id);

  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const response = await api.get(`/batches/${batchId}`);
      return response.data;
    },
    enabled: Number.isFinite(batchId)
  });

  const previewQuery = useBatchPreview(Number.isFinite(batchId) ? batchId : null);
  const preview = previewQuery.data;

  const headers = useMemo(() => preview?.headers ?? [], [preview]);
  const sampleRows = useMemo(() => preview?.sampleRows ?? [], [preview]);

  const [year, setYear] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [partNumberHeader, setPartNumberHeader] = useState("");
  const [unitPriceHeader, setUnitPriceHeader] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!batch || !preview) {
      return;
    }

    const suggested = preview.mappingSuggestion;
    if (suggested?.partNumber) {
      setPartNumberHeader(suggested.partNumber);
    }
    if (suggested?.unitPrice) {
      setUnitPriceHeader(suggested.unitPrice);
    }

    if (batch.month) {
      const [yearPart, monthPart] = batch.month.label.split("-");
      setYear(Number(yearPart));
      setMonth(Number(monthPart));
      return;
    }

    if (preview.competence) {
      setYear(preview.competence.year);
      setMonth(preview.competence.month);
    }
  }, [batch, preview]);

  const canEditCompetence = !batch?.monthId;
  const confirmDisabled = isSaving
    || !partNumberHeader
    || !unitPriceHeader
    || typeof year !== "number"
    || typeof month !== "number";

  const handleConfirm = async () => {
    if (!batch) {
      return;
    }
    if (!partNumberHeader || !unitPriceHeader) {
      return;
    }
    const yearValue = typeof year === "number" ? year : null;
    const monthValue = typeof month === "number" ? month : null;

    if (!yearValue || !monthValue) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await api.post(`/batches/${batch.id}/review`, {
        year: yearValue,
        month: monthValue,
        mapping: {
          partNumber: partNumberHeader,
          unitPrice: unitPriceHeader
        }
      });
      navigate(`/batches/${batch.id}`);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.error ?? "Falha ao processar batch.");
    } finally {
      setIsSaving(false);
    }
  };

  if (batchLoading || previewQuery.isLoading) {
    return <div className="page"><p>Carregando...</p></div>;
  }

  if (!batch || !preview) {
    return <div className="page"><p>Batch nao encontrado.</p></div>;
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Revisao de batch #{batch.id}</h1>
        <p>Corrija competencia e mapeamento antes de confirmar.</p>
      </header>

      <section className="panel">
        <h2>Motivo da pendencia</h2>
        <div className="summary-grid">
          <div><strong>Pending reason:</strong> {batch.pendingReason ?? "-"}</div>
          <div><strong>OCR confidence:</strong> {batch.ocrConfidenceAvg ?? "-"}</div>
          <div><strong>Mapping confidence:</strong> {batch.mappingConfidence ?? "-"}</div>
          <div><strong>Competence source:</strong> {batch.competenceSource ?? preview.competenceSource ?? "-"}</div>
        </div>
      </section>

      <section className="panel">
        <h2>Competencia</h2>
        {!canEditCompetence && batch.month ? (
          <p>Competencia detectada: {batch.month.label}</p>
        ) : (
          <div className="compare-controls">
            <label>
              Ano
              <input
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value) || "")}
              />
            </label>
            <label>
              Mes
              <select value={month} onChange={(event) => setMonth(Number(event.target.value) || "")}>
                <option value="">Selecione</option>
                {months.map((value) => (
                  <option key={value} value={value}>
                    {value.toString().padStart(2, "0")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Mapeamento de colunas</h2>
        <div className="compare-controls">
          <label>
            Partnumber
            <select value={partNumberHeader} onChange={(event) => setPartNumberHeader(event.target.value)}>
              <option value="">Selecione</option>
              {headers.map((header: string) => (
                <option key={header} value={header}>{header}</option>
              ))}
            </select>
          </label>
          <label>
            Unit price
            <select value={unitPriceHeader} onChange={(event) => setUnitPriceHeader(event.target.value)}>
              <option value="">Selecione</option>
              {headers.map((header: string) => (
                <option key={header} value={header}>{header}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Preview</h2>
        {headers.length === 0 ? (
          <p>Nenhum dado identificado.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  {headers.map((header: string) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row: any, index: number) => (
                  <tr key={index}>
                    {headers.map((header: string) => (
                      <td key={header}>{row[header] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <button className="button" onClick={handleConfirm} disabled={confirmDisabled}>
          Confirmar
        </button>
        {errorMessage && <p className="muted">{errorMessage}</p>}
      </section>
    </div>
  );
}
