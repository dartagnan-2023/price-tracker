import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useComparison } from "../hooks/useComparison";
import { useMonths } from "../hooks/useMonths";
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

  const comparison = useComparison(monthA, monthB, filter);

  const handleExport = (format: "csv" | "xlsx") => {
    if (!comparison.data) {
      return;
    }

    const rows = comparison.data.comparison.map((row: any) => {
      const deltaCents = row.unitPriceA !== null && row.unitPriceB !== null
        ? Math.round((row.unitPriceB - row.unitPriceA) * 100)
        : null;

      return {
        partNumber: row.partNumber,
        unitPriceA: row.unitPriceA,
        unitPriceB: row.unitPriceB,
        deltaCents,
        deltaPercent: row.priceDiffPercent,
        status: row.status
      };
    });

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

  return (
    <div className="page">
      <header className="page__header">
        <h1>Comparacao</h1>
        <p>Analise variacoes de preco por partnumber.</p>
      </header>

      <section className="panel">
        <div className="compare-controls">
          <label>
            Mes A
            <select
              value={monthA ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value) || null;
                setMonthA(value);
                updateQuery(value, monthB);
              }}
            >
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
            <select
              value={monthB ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value) || null;
                setMonthB(value);
                updateQuery(monthA, value);
              }}
            >
              <option value="">Selecione</option>
              {months.map((month: any) => (
                <option key={month.id} value={month.id}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
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
      </section>

      {comparison.isLoading && <p>Carregando comparacao...</p>}
      {comparison.data && (
        <section className="panel">
          <h2>Totais</h2>
          <div className="totals-grid">
            <div>
              <strong>Filtrado A (SKUs):</strong> {comparison.data.totals_filtered_a.totalSkus}
            </div>
            <div>
              <strong>Filtrado A (preco medio):</strong> {comparison.data.totals_filtered_a.avgUnitPrice}
            </div>
            <div>
              <strong>Filtrado B (SKUs):</strong> {comparison.data.totals_filtered_b.totalSkus}
            </div>
            <div>
              <strong>Filtrado B (preco medio):</strong> {comparison.data.totals_filtered_b.avgUnitPrice}
            </div>
            <div>
              <strong>Total A (SKUs):</strong> {comparison.data.totals_full_a.totalSkus}
            </div>
            <div>
              <strong>Total A (preco medio):</strong> {comparison.data.totals_full_a.avgUnitPrice}
            </div>
            <div>
              <strong>Total B (SKUs):</strong> {comparison.data.totals_full_b.totalSkus}
            </div>
            <div>
              <strong>Total B (preco medio):</strong> {comparison.data.totals_full_b.avgUnitPrice}
            </div>
          </div>
        </section>
      )}

      {comparison.data && (
        <section className="panel">
          <h2>Comparacao</h2>
          <div className="table-toolbar">
            <button className="button" onClick={() => handleExport("csv")}>Exportar CSV</button>
            <button className="button button--ghost" onClick={() => handleExport("xlsx")}>Exportar XLSX</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Partnumber</th>
                <th>Preco A</th>
                <th>Preco B</th>
                <th>Delta</th>
                <th>Delta %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {comparison.data.comparison.map((row: any) => (
                <tr key={row.partNumber} className={`status-${row.status}`}>
                  <td>{row.partNumber}</td>
                  <td>{row.unitPriceA ?? "-"}</td>
                  <td>{row.unitPriceB ?? "-"}</td>
                  <td>{row.priceDiff ?? "-"}</td>
                  <td>{row.priceDiffPercent ?? "-"}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!comparison.data && !comparison.isLoading && (
        <section className="panel">
          <p>Selecione dois meses para comparar.</p>
        </section>
      )}
    </div>
  );
}
