import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useComparison } from "../hooks/useComparison";
import { useMonths } from "../hooks/useMonths";
import { usePartNumberHistory } from "../hooks/usePartNumberHistory";
import * as XLSX from "xlsx";

const filters = [
  { label: "Todos", value: "all" },
  { label: "Alterados", value: "changed" },
  { label: "Novos", value: "new" },
  { label: "Removidos", value: "removed" },
  { label: "Iguais", value: "equal" }
];

export function Comparison() {
  const { data: monthsData } = useMonths();
  const months = useMemo(() => monthsData ?? [], [monthsData]);
  const [searchParams, setSearchParams] = useSearchParams();

  const initialA = Number(searchParams.get("a")) || null;
  const initialB = Number(searchParams.get("b")) || null;

  const [monthA, setMonthA] = useState<number | null>(initialA);
  const [monthB, setMonthB] = useState<number | null>(initialB);
  const [filter, setFilter] = useState("all");
  const [partNumberFilter, setPartNumberFilter] = useState("");

  const comparison = useComparison(monthA, monthB, filter);
  const historyQuery = usePartNumberHistory(partNumberFilter.trim() || null);

  const handleExport = (format: "csv" | "xlsx") => {
    if (!comparison.data) return;

    const rows = comparison.data.comparison.map((row: any) => ({
      partNumber: row.partNumber,
      unitPriceA: row.unitPriceA,
      unitPriceB: row.unitPriceB,
      delta: row.priceDiff,
      deltaPercent: row.priceDiffPercent,
      status: row.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Comparacao");

    const labelA = comparison.data.monthA?.label ?? "mesA";
    const labelB = comparison.data.monthB?.label ?? "mesB";
    const fileName = `comparacao_${labelA}_${labelB}_${filter}.${format}`;

    XLSX.writeFile(workbook, fileName, { bookType: format });
  };

  const updateQuery = (nextA: number | null, nextB: number | null) => {
    const params = new URLSearchParams();
    if (nextA) params.set("a", String(nextA));
    if (nextB) params.set("b", String(nextB));
    setSearchParams(params);
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const getPriceChangeIndicator = (value: number | null) => {
    if (value === null || value === 0) return null;
    if (value > 0) return <span style={{ color: "var(--error)", marginLeft: "4px" }}>▲</span>;
    return <span style={{ color: "var(--success)", marginLeft: "4px" }}>▼</span>;
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Comparação de Preços</h1>
        <p>Analise variações de custo entre períodos.</p>
      </header>

      <div className="panel">
        <div className="compare-controls">
          <label>
            Período A (Referência)
            <select
              value={monthA ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value) || null;
                setMonthA(value);
                updateQuery(value, monthB);
              }}
            >
              <option value="">Selecione um mês</option>
              {months.map((month: any) => (
                <option key={month.id} value={month.id}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Período B (Comparação)
            <select
              value={monthB ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value) || null;
                setMonthB(value);
                updateQuery(monthA, value);
              }}
            >
              <option value="">Selecione um mês</option>
              {months.map((month: any) => (
                <option key={month.id} value={month.id}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="panel">
        <h2>Filtros e Busca</h2>
        <div className="compare-controls" style={{ marginBottom: "20px" }}>
          <input
            type="text"
            className="search-input"
            value={partNumberFilter}
            onChange={(event) => setPartNumberFilter(event.target.value)}
            placeholder="Buscar partnumber..."
            style={{ flex: 1, minWidth: "250px" }}
          />
        </div>
        <div className="filter-bar">
          {filters.map((option) => (
            <button
              key={option.value}
              className={filter === option.value ? "chip chip--active" : "chip"}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {comparison.isLoading && <p className="muted">Carregando dados da comparação...</p>}

      {comparison.data && (
        <>
          <div className="panel">
            <h2>Resumo da Comparação</h2>
            <div className="totals-grid">
              <div className="total-item">
                <label>SKUs em A</label>
                <span>{comparison.data.totals_full_a.totalSkus}</span>
              </div>
              <div className="total-item">
                <label>Preço Médio A</label>
                <span>{formatCurrency(comparison.data.totals_full_a.avgUnitPrice)}</span>
              </div>
              <div className="total-item">
                <label>SKUs em B</label>
                <span>{comparison.data.totals_full_b.totalSkus}</span>
              </div>
              <div className="total-item">
                <label>Preço Médio B</label>
                <span>{formatCurrency(comparison.data.totals_full_b.avgUnitPrice)}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2>Resultados</h2>
              <div className="table-toolbar" style={{ margin: 0 }}>
                <button className="button" onClick={() => handleExport("csv")}>Exportar CSV</button>
                <button className="button button--ghost" onClick={() => handleExport("xlsx")}>Exportar XLSX</button>
              </div>
            </div>

            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Partnumber</th>
                    <th>Preço A</th>
                    <th>Preço B</th>
                    <th>Variação ($)</th>
                    <th>Variação (%)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.data.comparison.map((row: any) => {
                    const diff = row.priceDiff;
                    const diffPercent = row.priceDiffPercent;

                    return (
                      <tr key={row.partNumber} className={`status-${row.status}`}>
                        <td style={{ fontWeight: 600 }}>{row.partNumber}</td>
                        <td>{formatCurrency(row.unitPriceA)}</td>
                        <td>{formatCurrency(row.unitPriceB)}</td>
                        <td>
                          {diff !== null ? (
                            <span style={{ color: diff > 0 ? "var(--error)" : diff < 0 ? "var(--success)" : "inherit" }}>
                              {formatCurrency(diff)}
                            </span>
                          ) : "-"}
                        </td>
                        <td>
                          {diffPercent !== null ? (
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              fontWeight: Math.abs(diffPercent) > 0 ? 600 : 400,
                              color: diffPercent > 0 ? "var(--error)" : diffPercent < 0 ? "var(--success)" : "inherit"
                            }}>
                              {formatPercent(diffPercent)}
                              {getPriceChangeIndicator(diffPercent)}
                            </span>
                          ) : "-"}
                        </td>
                        <td>
                          <span className="chip" style={{ fontSize: "0.7rem", pointerEvents: "none" }}>
                            {row.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="panel">
        <h2>Histórico Detalhado</h2>
        <p className="muted" style={{ marginBottom: "16px" }}>Consulte o histórico completo de um partnumber específico.</p>

        {historyQuery.isLoading && <p className="muted">Carregando histórico...</p>}
        {!historyQuery.isLoading && partNumberFilter.trim() && historyQuery.data?.history?.length === 0 && (
          <p className="muted">Nenhum registro encontrado para "{partNumberFilter}".</p>
        )}
        {!historyQuery.isLoading && !partNumberFilter.trim() && (
          <p className="muted">Digite um partnumber no campo de busca acima para ver o histórico.</p>
        )}

        {!historyQuery.isLoading && historyQuery.data?.history?.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Mês</th>
                  <th>Batch ID</th>
                  <th>Valor Unitário</th>
                  <th>Status do Batch</th>
                </tr>
              </thead>
              <tbody>
                {historyQuery.data.history.map((entry: any) => (
                  <tr key={`${entry.batchId}-${entry.fullDate ?? entry.importedAt}`}>
                    <td>{entry.fullDate ?? (entry.importedAt ? new Date(entry.importedAt).toLocaleDateString() : "-")}</td>
                    <td>{entry.monthLabel ?? "-"}</td>
                    <td><span className="muted">#{entry.batchId}</span></td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(entry.unitPrice)}</td>
                    <td>
                      <span className="chip" style={{ fontSize: "0.7rem", pointerEvents: "none" }}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
