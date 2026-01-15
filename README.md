# Price Tracker

Sistema local para importar planilhas/imagens de preços por mês e comparar unit prices entre competências. O foco é acompanhar variação de cada partnumber ao longo do tempo, com histórico de batches, revisão manual e suporte a OCR.

## Estrutura

- `backend/`: Fastify + Prisma + SQLite.
- `frontend/`: React (Vite) + TanStack Table + Tailwind.
- `desktop/`: versão empacotada (por exemplo, Tauri/Electron, expõe o frontend).
- `inbox/`: folder monitorado pelo watcher (entrada de CSV/XLSX/PNG/JPG).
- `processed/`, `pending_review/`, `failed/`: destinos gerenciados após ingestão.
- `data/price_tracker.db`: banco SQLite.

## Setup rápido

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

### Prisma

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
```

### Desenvolvimento

```bash
npm run dev
```

Backend roda em `http://localhost:3100` e frontend em `http://localhost:5174`.

## Workflow de ingestão

1. Coloque CSV/XLSX/PNG/JPG em `inbox/` (ou use a interface para selecionar o arquivo e enviar).
2. O watcher detecta e aciona o worker.
3. O worker calcula hash (evita duplicatas), parseia o arquivo (CSV/XLSX ou OCR), detecta competência e mapeia colunas (partnumber/price).
4. Registra `ImportBatch`, `FileAsset`, `ProductLine` e aplica validações (status, confidências e pending reasons).
5. Se precisar de intervenção (competência/mapping/ocr baixos), o batch vai para `pending_review/` e ganha o status `PENDING_REVIEW`.
6. Usuário revisa mapeamento ou resolve partnumbers na interface `/review/:batch_id` e confirma.
7. Batches com status `COMPLETED` ficam ativos por mês; ativações são únicas via endpoint `/batches/:id/activate`.

## Revisão de partnumbers

- Linhas com `CorrectionStatus` em `NEEDS_REVIEW` podem ser resolvidas com o modal (aceitar sugerido, manter bruto ou editar manualmente).
- `PATCH /api/lines/:id/resolve-partnumber` atualiza o partnumber, marca `CorrectionStatus=RESOLVED` e registra `resolvedAt`, `resolvedBy` e `resolutionNote`.
- A comparação usa sempre o `partnumber` final, garantindo consistência.

## Comparação

- `GET /api/compare?month_a=&month_b=&filter=` retorna parte/resumo completo e filtrado, tratando `nulls` e `deltaPercent` (null quando priceA ausente ou zero).
- Exportações CSV/XLSX respeitam filtros ativos (colunas: `partNumber`, `unitPriceA`, `unitPriceB`, `deltaCents`, `deltaPercent`, `status`).
- Totais completos (`totals_full_a/b`) e filtrados (`totals_filtered_a/b`) acompanham a resposta.

## Observações

- Uma única importação ativa é permitida por mês; nova ingestão cria batch adicional sem apagar histórico.
- ImportBatch registra `pendingReason`, `ocrConfidenceAvg`, `mappingConfidence` e `competenceSource` para transparência.
- O worker move arquivos de `inbox/` para `processed/`, `pending_review/` ou `failed/` conforme resultado, e mantém `FileAsset.filePath` atualizado.

## Scripts de validação

- `backend/scripts/test-activate.ts`
- `backend/scripts/test-resolve.ts`
- `backend/scripts/test-compare.ts`
