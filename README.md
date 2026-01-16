# Price Tracker

Sistema local para importar planilhas/imagens de preÃ§os por mÃªs e comparar unit prices entre competÃªncias. O foco Ã© acompanhar variaÃ§Ã£o de cada partnumber ao longo do tempo, com histÃ³rico de batches, revisÃ£o manual e suporte a OCR.

## Estrutura

- `backend/`: Fastify + Prisma + SQLite.
- `frontend/`: React (Vite) + TanStack Table + Tailwind.
- `desktop/`: versÃ£o empacotada (por exemplo, Tauri/Electron, expÃµe o frontend).
- `inbox/`: folder monitorado pelo watcher (entrada de CSV/XLSX/PNG/JPG).
- `processed/`, `pending_review/`, `failed/`: destinos gerenciados apÃ³s ingestÃ£o.
- `data/price_tracker.db`: banco SQLite.

## Setup rÃ¡pido

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

O frontend lÃª `VITE_API_BASE_URL` para decidir para onde mandar as requisiÃ§Ãµes; por padrÃ£o ele usa `/api`, entÃ£o a versÃ£o hospedada junto ao backend funciona sem ajustes, mas em ambientes separados (Render, etc.) defina `VITE_API_BASE_URL=https://<seu-servico>.onrender.com/api`. Em desenvolvimento hÃ¡ um `.env.development` no `frontend/` com `VITE_API_BASE_URL=http://localhost:3100/api`.

### Variáveis de ambiente

- DATABASE_URL: string de conexão usada pelo Prisma (encontre-a no .env e nos secrets do Render).
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET: credenciais do bucket que guarda os arquivos importados; defina tudo para usar Supabase Storage (pode permanecer em branco em ambientes locais sem bucket).
- AUTH_USER, AUTH_PASSWORD, AUTH_SECRET: credenciais do login.
- AUTH_ALLOW_UNAUTH=true: permite consultar /api/* sem token (útil para testes rápidos ou quando o dashboard precisar ficar aberto sem autenticação).
- VITE_API_BASE_URL: URL base para o frontend (omitido se o domínio já serve /api).

## Workflow de ingestÃ£o

1. Coloque CSV/XLSX/PNG/JPG em `inbox/` (ou use a interface para selecionar o arquivo e enviar).
2. O watcher detecta e aciona o worker.
3. O worker calcula hash (evita duplicatas), parseia o arquivo (CSV/XLSX ou OCR), detecta competÃªncia e mapeia colunas (partnumber/price).
4. Registra `ImportBatch`, `FileAsset`, `ProductLine` e aplica validaÃ§Ãµes (status, confidÃªncias e pending reasons).
5. Se precisar de intervenÃ§Ã£o (competÃªncia/mapping/ocr baixos), o batch vai para `pending_review/` e ganha o status `PENDING_REVIEW`.
6. UsuÃ¡rio revisa mapeamento ou resolve partnumbers na interface `/review/:batch_id` e confirma.
7. Batches com status `COMPLETED` ficam ativos por mÃªs; ativaÃ§Ãµes sÃ£o Ãºnicas via endpoint `/batches/:id/activate`.

## RevisÃ£o de partnumbers

- Linhas com `CorrectionStatus` em `NEEDS_REVIEW` podem ser resolvidas com o modal (aceitar sugerido, manter bruto ou editar manualmente).
- `PATCH /api/lines/:id/resolve-partnumber` atualiza o partnumber, marca `CorrectionStatus=RESOLVED` e registra `resolvedAt`, `resolvedBy` e `resolutionNote`.
- A comparaÃ§Ã£o usa sempre o `partnumber` final, garantindo consistÃªncia.

## ComparaÃ§Ã£o

- `GET /api/compare?month_a=&month_b=&filter=` retorna parte/resumo completo e filtrado, tratando `nulls` e `deltaPercent` (null quando priceA ausente ou zero).
- ExportaÃ§Ãµes CSV/XLSX respeitam filtros ativos (colunas: `partNumber`, `unitPriceA`, `unitPriceB`, `deltaCents`, `deltaPercent`, `status`).
- Totais completos (`totals_full_a/b`) e filtrados (`totals_filtered_a/b`) acompanham a resposta.

## ObservaÃ§Ãµes

- Uma Ãºnica importaÃ§Ã£o ativa Ã© permitida por mÃªs; nova ingestÃ£o cria batch adicional sem apagar histÃ³rico.
- ImportBatch registra `pendingReason`, `ocrConfidenceAvg`, `mappingConfidence` e `competenceSource` para transparÃªncia.
- O worker move arquivos de `inbox/` para `processed/`, `pending_review/` ou `failed/` conforme resultado, e mantÃ©m `FileAsset.filePath` atualizado.

## Scripts de validaÃ§Ã£o

- `backend/scripts/test-activate.ts`
- `backend/scripts/test-resolve.ts`
- `backend/scripts/test-compare.ts`
