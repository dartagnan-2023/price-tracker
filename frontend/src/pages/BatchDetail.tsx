import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useBatchLines } from "../hooks/useBatchLines";

export function BatchDetail() {
  const params = useParams();
  const batchId = Number(params.id);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: batch, isLoading, refetch: refetchBatch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const response = await api.get(`/batches/${batchId}`);
      return response.data;
    },
    enabled: Number.isFinite(batchId)
  });

  const {
    data: linesData,
    isLoading: linesLoading,
    isError: linesError,
    refetch: refetchLines
  } = useBatchLines(
    Number.isFinite(batchId) ? batchId : null,
    page,
    pageSize
  );

  const [selectedLine, setSelectedLine] = useState<any | null>(null);
  const [resolution, setResolution] = useState<"accept" | "keep" | "edit">("accept");
  const [finalPartNumber, setFinalPartNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<number | null>(null);
  const [editingLine, setEditingLine] = useState<any | null>(null);
  const [editPartNumber, setEditPartNumber] = useState("");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return <div className="page"><p>Carregando...</p></div>;
  }

  if (!batch) {
    return <div className="page"><p>Batch nao encontrado.</p></div>;
  }

  const totalPages = linesData ? Math.ceil(linesData.total / pageSize) : 1;

  const saveDisabled = isSaving
    || (resolution === "edit" && !finalPartNumber.trim())
    || (resolution === "accept" && !selectedLine?.suggestedPartNumber);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Batch #{batch.id}</h1>
        <p>Status: {batch.status.toLowerCase()}</p>
      </header>

      <section className="panel">
        <h2>Resumo</h2>
          <div className="summary-grid">
            <div><strong>Mes:</strong> {batch.month?.label ?? "-"}</div>
            <div><strong>Ativo:</strong> {batch.isActive ? "Sim" : "Nao"}</div>
            <div><strong>Linhas validas:</strong> {batch.validLines}/{batch.totalLines}</div>
            <div><strong>Arquivo:</strong> {batch.fileAsset?.originalFilename ?? "-"}</div>
            <div><strong>Pending reason:</strong> {batch.pendingReason ?? "-"}</div>
            <div><strong>OCR confidence:</strong> {batch.ocrConfidenceAvg ?? "-"}</div>
            <div><strong>Mapping confidence:</strong> {batch.mappingConfidence ?? "-"}</div>
            <div><strong>Competence source:</strong> {batch.competenceSource ?? "-"}</div>
            <div><strong>Data completa:</strong> {batch.fullDate ?? "-"}</div>
          </div>
        </section>

      {batch.errorLog && (
        <section className="panel">
          <h2>Erros</h2>
          <pre className="log-box">{batch.errorLog}</pre>
        </section>
      )}

      <section className="panel">
        <h2>Planilha (partnumber + preco)</h2>
        {linesLoading && <p>Carregando linhas...</p>}
        {linesError && (
          <p className="muted">
            Nenhuma linha encontrada ou batch ainda pendente. Revise o mapping ou verifique o log.
          </p>
        )}
        {linesData && linesData.total === 0 && (
          <p className="muted">
            Nenhuma linha valida encontrada. Ajuste o mapping ou revise o arquivo.
          </p>
        )}
        {linesData && (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Partnumber</th>
                  <th>Preco</th>
                  <th>Original</th>
                  <th>Status</th>
                  <th>Sugestao</th>
                  <th>Duplicado</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {linesData.lines.map((line: any) => (
                  <tr key={line.id}>
                    <td>{line.partNumber}</td>
                    <td>{line.unitPrice}</td>
                    <td>{line.rawPartNumber}</td>
                    <td>{line.correctionStatus.toLowerCase()}</td>
                    <td>{line.suggestedPartNumber ?? "-"}</td>
                    <td>{line.isDuplicate ? `Sim (${line.duplicateCount})` : "-"}</td>
                    <td>
                      {line.correctionStatus === "NEEDS_REVIEW" && (
                        <button
                          className="link-button"
                          onClick={() => {
                            setSelectedLine(line);
                            setResolution(line.suggestedPartNumber ? "accept" : "keep");
                            setFinalPartNumber("");
                          }}
                        >
                          Revisar
                        </button>
                      )}
                      {line.isDuplicate && (
                        <button
                          className="link-button"
                          onClick={async () => {
                            if (!window.confirm("Excluir esta linha duplicada?")) {
                              return;
                            }
                            setDeletingLineId(line.id);
                            try {
                              await api.delete(`/lines/${line.id}`);
                              await refetchLines();
                              await refetchBatch();
                            } finally {
                              setDeletingLineId(null);
                            }
                          }}
                          disabled={deletingLineId === line.id}
                        >
                          Excluir
                        </button>
                      )}
                      <button
                        className="link-button"
                        onClick={() => {
                          setEditingLine(line);
                          setEditPartNumber(line.partNumber ?? "");
                          setEditUnitPrice(line.unitPrice?.toString() ?? "");
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <button className="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Anterior
              </button>
              <span>Pagina {page} de {totalPages}</span>
              <button className="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Proxima
              </button>
            </div>
          </>
        )}
      </section>

      {selectedLine && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Resolver partnumber</h2>
            <div className="modal__content">
              <p><strong>Raw:</strong> {selectedLine.rawPartNumber}</p>
              <p><strong>Atual:</strong> {selectedLine.partNumber}</p>
              <p><strong>Sugestao:</strong> {selectedLine.suggestedPartNumber ?? "-"}</p>
              <p><strong>Conf:</strong> {selectedLine.correctionConfidence ?? "-"}</p>

              <div className="resolution-actions">
                <button
                  className={resolution === "accept" ? "chip chip--active" : "chip"}
                  onClick={() => setResolution("accept")}
                  disabled={!selectedLine.suggestedPartNumber}
                >
                  Aceitar sugestao
                </button>
                <button
                  className={resolution === "keep" ? "chip chip--active" : "chip"}
                  onClick={() => setResolution("keep")}
                >
                  Manter original
                </button>
                <button
                  className={resolution === "edit" ? "chip chip--active" : "chip"}
                  onClick={() => setResolution("edit")}
                >
                  Editar
                </button>
              </div>

              {resolution === "edit" && (
                <label>
                  Partnumber final
                  <input
                    type="text"
                    value={finalPartNumber}
                    onChange={(event) => setFinalPartNumber(event.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="modal__actions">
              <button className="button" onClick={async () => {
                setIsSaving(true);
                try {
                  await api.patch(`/lines/${selectedLine.id}/resolve-partnumber`, {
                    resolution,
                    finalPartNumber: resolution === "edit" ? finalPartNumber : undefined
                  });
                  await refetchLines();
                  setSelectedLine(null);
                } finally {
                  setIsSaving(false);
                }
              }} disabled={saveDisabled}>
                Salvar
              </button>
              <button className="link-button" onClick={() => setSelectedLine(null)} disabled={isSaving}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingLine && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Editar linha</h2>
            <div className="modal__content">
              <label>
                Partnumber
                <input
                  type="text"
                  value={editPartNumber}
                  onChange={(event) => setEditPartNumber(event.target.value)}
                />
              </label>
              <label>
                Unit price
                <input
                  type="text"
                  value={editUnitPrice}
                  onChange={(event) => setEditUnitPrice(event.target.value)}
                />
              </label>
            </div>
            <div className="modal__actions">
              <button
                className="button"
                onClick={async () => {
                  const trimmedPart = editPartNumber.trim();
                  const trimmedPrice = editUnitPrice.trim();
                  const payload: { partNumber?: string; unitPrice?: string } = {};

                  if (trimmedPart && trimmedPart !== editingLine.partNumber) {
                    payload.partNumber = trimmedPart;
                  }
                  if (trimmedPrice && trimmedPrice !== editingLine.unitPrice?.toString()) {
                    payload.unitPrice = trimmedPrice;
                  }

                  if (!Object.keys(payload).length) {
                    setEditingLine(null);
                    return;
                  }

                  setIsEditing(true);
                  try {
                    await api.patch(`/lines/${editingLine.id}`, payload);
                    await refetchLines();
                    await refetchBatch();
                    setEditingLine(null);
                  } finally {
                    setIsEditing(false);
                  }
                }}
                disabled={isEditing}
              >
                Salvar
              </button>
              <button
                className="link-button"
                onClick={() => setEditingLine(null)}
                disabled={isEditing}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
