<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Carta de Ruta uses `carta-ruta.ts` for extraction, dispatch conflict decisions and document-only references; persist dispatch with an optimistic guard and sync the existing declaration editor only after success to preserve unsaved drafts.
- Email purchases use invoker RPC `convertir_correo_cotizacion`, retained attachments and manual same-client links. Copy total/currency, not FOB; re-read legacy proformas; preserve linked edits.
- Purchase/expediente numbers use `siguiente_numero_operacion` with a locked monthly counter; conversion triggers inherit source numbers and cross-table guards reject unrelated collisions and linked renumbering.
Apply transitions via `estados-expediente.ts` and `validar_transicion_expediente()` for shared manual/automatic requirements.
- Operations email KPI uses `correos-pendientes-kpi.ts` for RLS-bound reads and unique active-expediente counts, excluding delivered confirmations so queue and dashboard semantics remain consistent.
Red IDs: `expediente-numero`/`--brand-red`.
Payment slips: linked transport first, reserved TR next; TF last.
Share expediente/quote PDF. e-CF: factura-venta-referencias keeps fiscal lines, OCR in notas; factura-ecf-vinculacion shares links.
Headers: desktop slots/More, mobile rows. New-expediente: two fixed action rows, portaled submits; retain validation, no floating panels.
Detail headers: content-sized rows, client label/value together, wrap IDs, warnings below Description; shared deadlines.
- Endoso de consignatario lives in `expediente_endosos` (one active row per expediente); never overwrite `expedientes.cliente_id` — SIGA XML swaps in the endorsed client and portal visibility unions both clients, keeping commercial traceability.
- Deadlines use plazo-presentacion.ts with regime days + expediente override, never sla_dias/ETA. Require real arrival/regime; show business days, classify overdue by calendar date including weekends.
- Header: ETA until arrival, then arrival/calendar transit; presentation next, no duplicate transit. Mount deadline override only while open to prevent overlap.
- From verification onward, shared state ordering replaces deadlines with compliance from fecha_presentado; omit when date/deadline is missing, never fabricate dates.
- Both header menus open Endoso via parent request counter; retain one form/persistence path.
- Evaluate detail warnings with scoped evidence queries; invoice links and persisted reception incidents prevent unrelated debt alerts and recomputed tolerances.
- Use the shared expediente alert evaluator for list and detail short/long text; keep PIN timestamp countdown separate from business-day presentation deadlines, and batch list evidence reads to avoid per-row requests.
- Group PIN/presentation warnings in one list-only deadline entry with both short texts; retain independent clocks and full detail warnings.
- Export DR-CAFTA from the editable preview with jsPDF text/vector borders; measure cells/text to preserve official layouts, annexes and saved edits without rasterization.
- Inspection stays in canal_riesgo; portal the form-owned selector to the header to share drafts/validation without migrating historical values.
- Use consignatario-efectivo.ts (active endorsement, else original) for documents/new invoices; issued invoices stay frozen.
- Resolve the dispatch-date modal asynchronously within the existing state mutation and reuse fechasDespachoFaltantes for detail-only preventive alerts, preserving permission checks and audit payloads.
- Share entry suggestions via buscarSugerenciasProducto/resolverSugerenciasProducto (not historical/Real); explicit DGA selections use datosProductoHistorico. Tariff CSV uses staff-checked server import and atomic invoker RPC; no product override writes.
- Chapter notes: separate read-only panel, admin invoker import; preserve tariff suggestions/import.
- Liquidation: independent Radix collapsibles retain draft handlers; ImporteLiquidacionInput/liquidacion-moneda edit RD$, store USD. Shared UI/PDF totals and batch markup; no billing writes.
- Service fees use `servicio-aduanero-calculo.ts` for line limits and totals in both UI and PDFs; identify fee rules by catalog unit to keep other dispatch types unchanged.
- Copiloto selects real eight-digit leaves, normalizes nature/ranks alternatives. OCR uses it only for blank codes; strip draft warnings before insert. Manual choices affect unsaved results; snapshots/export never recalculate.
- Resolve certificate parties via `terceros-certificado`; `rol_siga` classifies commercial records, never permissions, separating identities by SIGA role.
- Package menus share tab locks/replacement and e-CF: require PDF to generate, email e-NCF without PDFs, skip other missing sources.
- Both expediente document menus share the editable rectification oficio generator with an oficio-scoped generation lock and replacement repository; keep one canonical document row so the complete package uses the saved oficio as its first source without generating another oficio.
- Rectification packages use rectificacion-pdf with password-aware PDF loading to preserve vector pages from empty-password encrypted sources; never skip required sources or overwrite originals.
- Payment OCR: labels via pago-puerto-ocr; confirm/replace by SIGA/invoice; e-CF updates only pdf_url. Costs dedupe OCR; management uses precioBase/tax-free base, never gross. Transport/reimbursements: costos-automaticos-liquidacion.
- DGA fills blanks; permiso-vuce replaces documentary fields and links PDFs on save. VUCE payments share pago-vuce accumulation by verified permit; PIN/receipt markers preserve both sources, preventing duplicate costs.
- VUCE product rows use permiso-vuce-productos for shared extraction validation and editable documentary storage in permisos.productos; never sync them into liquidation merchandise, keeping independent corrections and original precision.
- Editors retain drafts/global saves. DGA origin uses declaracion-origen-context for conditional sync; references stay in document observations.
- Sync draft Description via observaciones-expediente on observation changes, not save; preserve manual edits.
- Liquidation OCR: liquidacion-dga-documento extracts labels/conflicts/comparison-only totals and prepares one guarded UPDATE for the entire mapping; liquidacion-dga-context syncs only after success without losing drafts. Manifest/inspection are read-only references.
- Subdirectories have their own `AGENTS.md` (e.g. `src/lib/AGENTS.md` for the email-intake pipeline); read it before changing files there.
