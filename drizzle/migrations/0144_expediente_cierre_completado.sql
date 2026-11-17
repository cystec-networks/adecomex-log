CREATE OR REPLACE FUNCTION public.validar_transicion_expediente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  orden text[] := ARRAY['digitar','en_transito','manifestado','presentar','verificar','despachado','entregado','facturar'];
  i_old int; i_new int; i int; paso text; forzar boolean; n_perm int; ej text;
  tiene_fac boolean; tiene_bl boolean; falta_docs text; es_priv boolean; es_admin boolean; falta_fechas text;
  motivo text; forzables text[] := ARRAY[]::text[]; forzables_ops text[] := ARRAY[]::text[];
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN NEW.forzar_regreso_estado := false; RETURN NEW; END IF;
  -- Completado: solo se entra (desde Facturado) o se sale por las funciones de cierre/reapertura.
  IF NEW.estado::text = 'completado' OR OLD.estado::text = 'completado' THEN
    IF COALESCE(current_setting('app.cierre_expediente', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Para completar un Expediente usa «Marcar Completado»; para salir de Completado usa «Reabrir» (solo Administrador).';
    END IF;
    NEW.forzar_regreso_estado := false;
    RETURN NEW;
  END IF;
  i_old := array_position(orden, OLD.estado::text);
  i_new := array_position(orden, NEW.estado::text);
  IF i_old IS NULL OR i_new IS NULL THEN NEW.forzar_regreso_estado := false; RETURN NEW; END IF;
  IF i_new < i_old THEN
    IF NOT COALESCE(NEW.forzar_regreso_estado, false) THEN
      RAISE EXCEPTION 'No se puede regresar el expediente a un estado anterior. Solo Administración u Operaciones pueden corregir el estado.';
    END IF;
    IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'operaciones'::public.app_role)) THEN
      RAISE EXCEPTION 'Solo los roles Administrador u Operaciones pueden forzar el regreso de estado.';
    END IF;
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('expedientes', NEW.id, 'regreso_forzado_estado:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
            jsonb_build_object('estado_anterior', OLD.estado::text, 'estado_nuevo', NEW.estado::text, 'motivo', NEW.motivo_regreso_estado));
    NEW.forzar_regreso_estado := false;
    RETURN NEW;
  END IF;
  forzar := COALESCE(NEW.forzar_regreso_estado, false);
  NEW.forzar_regreso_estado := false;
  motivo := NULLIF(btrim(COALESCE(NEW.motivo_regreso_estado, '')), '');
  es_priv := forzar AND (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'operaciones'::public.app_role));
  es_admin := forzar AND private.has_role(auth.uid(), 'admin'::public.app_role);
  FOR i IN (i_old + 1)..i_new LOOP
    paso := orden[i];
    -- Hechos legales/operativos: nunca forzables.
    IF paso = 'en_transito' AND COALESCE(btrim(NEW.bl_awb), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a En Tránsito: falta el BL / AWB / Guía (Información General).';
    ELSIF paso = 'manifestado' AND NEW.fecha_llegada_real IS NULL THEN
      RAISE EXCEPTION 'No se puede pasar a Manifestado: falta la Fecha de Llegada Real (Información General).';
    ELSIF paso = 'presentar' THEN
      IF NEW.fecha_llegada_real IS NULL THEN
        RAISE EXCEPTION 'No se puede pasar a Presentado: falta la Fecha de Llegada Real (Información General).';
      ELSIF COALESCE(btrim(NEW.pais_origen), '') = '' THEN
        RAISE EXCEPTION 'No se puede pasar a Presentado: falta el País de Origen (Datos de importación).';
      ELSIF NEW.peso_neto IS NULL OR NEW.peso_neto <= 0 THEN
        RAISE EXCEPTION 'No se puede pasar a Presentado: falta el Peso Neto (Descripción de mercancía).';
      ELSIF NEW.peso_bruto IS NULL OR NEW.peso_bruto <= 0 THEN
        RAISE EXCEPTION 'No se puede pasar a Presentado: falta el Peso Bruto (Descripción de mercancía).';
      ELSIF COALESCE(btrim(NEW.numero_dua), '') = '' THEN
        RAISE EXCEPTION 'No se puede pasar a Presentado: falta la Declaración DUA (sección Declaración).';
      END IF;
    ELSIF paso = 'verificar' AND COALESCE(btrim(NEW.numero_igra), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a Verificado: falta el Número de despacho (sección Declaración).';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.numero_igra), '') = '' THEN
      RAISE EXCEPTION 'No se puede despachar este Expediente: falta capturar el Número de despacho.';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.numero_dua), '') = '' THEN
      RAISE EXCEPTION 'No se puede despachar este Expediente: falta capturar la Declaración DUA.';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.regimen_aduanero), '') = '' THEN
      RAISE EXCEPTION 'No se puede despachar este Expediente: falta seleccionar el Régimen Aduanero.';
    ELSIF paso = 'despachado' AND COALESCE(btrim(NEW.liq_siga_numero), '') = '' THEN
      RAISE EXCEPTION 'No se puede pasar a Despachado: falta el N.º Liquidación SIGA (Resultado oficial DGA).';
    ELSIF paso = 'despachado' AND NOT EXISTS (SELECT 1 FROM public.gastos g WHERE g.expediente_id = NEW.id AND g.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'No se puede pasar a Despachado: no hay gastos operativos registrados en el expediente.';
    ELSIF paso = 'entregado' AND NOT EXISTS (SELECT 1 FROM public.gastos g WHERE g.expediente_id = NEW.id AND g.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'No se puede pasar a Entregado: no hay gastos operativos registrados en el expediente.';
    END IF;

    -- Checks forzables solo por Administrador con justificación.
    IF paso = 'en_transito' THEN
      falta_docs := public.expediente_docs_core_faltantes(NEW.id);
      IF falta_docs IS NOT NULL THEN forzables := forzables || ('Checklist de Recepción incompleto: ' || falta_docs); END IF;
    ELSIF paso = 'verificar' AND COALESCE(btrim(NEW.canal_riesgo), '') = '' THEN
      forzables := forzables || 'Falta definir el Tipo de Inspección (sección Declaración)'::text;
    ELSIF paso = 'entregado' AND NOT EXISTS (SELECT 1 FROM public.expediente_hitos h WHERE h.expediente_id = NEW.id AND h.hito_codigo = 'factura_venta_enviada' AND h.estado IN ('completado','no_aplica')) THEN
      forzables := forzables || 'Falta marcar «Factura de venta enviada al cliente» (Seguimiento Operativo)'::text;
    ELSIF paso = 'facturar' AND NEW.factura_ecf_id IS NULL THEN
      forzables := forzables || 'No hay una factura e-CF vinculada al expediente'::text;
    END IF;

    IF paso = 'presentar' THEN
      tiene_fac := EXISTS (SELECT 1 FROM public.documentos d WHERE d.expediente_id = NEW.id AND d.tipo = 'Factura comercial' AND COALESCE(btrim(d.storage_path),'') <> '');
      tiene_bl := EXISTS (SELECT 1 FROM public.documentos d WHERE d.expediente_id = NEW.id AND d.tipo = 'Bill of Lading' AND COALESCE(btrim(d.storage_path),'') <> '');
      IF NOT tiene_fac OR NOT tiene_bl THEN
        falta_docs := CASE WHEN NOT tiene_fac AND NOT tiene_bl THEN 'Factura comercial y Bill of Lading'
                           WHEN NOT tiene_fac THEN 'Factura comercial' ELSE 'Bill of Lading' END;
        forzables_ops := forzables_ops || ('Falta adjuntar ' || falta_docs || ' para Presentado');
      END IF;
    END IF;
    IF paso = 'despachado' THEN
      falta_fechas := concat_ws(' y ',
        CASE WHEN NEW.liq_siga_fecha_pago IS NULL THEN 'la Fecha de pago del PIN de DGA' END,
        CASE WHEN NEW.fecha_aprobacion_despacho IS NULL THEN 'la Fecha de Aprobación del Número de despacho' END);
      IF falta_fechas <> '' THEN
        IF es_admin AND motivo IS NOT NULL THEN
          INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
          VALUES ('expedientes', NEW.id, 'despacho_forzado_sin_fechas_dga:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
                  jsonb_build_object('faltan', falta_fechas, 'justificacion', NEW.motivo_regreso_estado));
        ELSE
          RAISE EXCEPTION 'No se puede despachar: falta %. Solo un Administrador puede forzarlo con justificación.', falta_fechas;
        END IF;
      END IF;
      SELECT count(*), min(COALESCE(p.numero, p.tipo::text) || ' (' || p.tipo::text || ') - Estado: ' || p.estado::text)
        INTO n_perm, ej FROM public.permisos p
       WHERE p.expediente_id = NEW.id AND p.eliminado_en IS NULL AND p.estado <> 'aprobado';
      IF n_perm > 0 THEN forzables := forzables || (n_perm || ' permiso(s) sin aprobar (ej. ' || ej || ')'); END IF;
    END IF;
  END LOOP;

  IF array_length(forzables_ops, 1) > 0 AND COALESCE(array_length(forzables, 1), 0) = 0 THEN
    IF es_priv AND motivo IS NOT NULL THEN
      INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
      VALUES ('expedientes', NEW.id, 'cambio_estado_forzado:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
              jsonb_build_object('faltan', to_jsonb(forzables_ops), 'justificacion', motivo));
    ELSE
      RAISE EXCEPTION 'No se puede cambiar el estado: %. Solo Administración u Operaciones pueden forzarlo con justificación.', array_to_string(forzables_ops, '; ');
    END IF;
  END IF;
  forzables := forzables || forzables_ops;
  IF COALESCE(array_length(forzables, 1), 0) > COALESCE(array_length(forzables_ops, 1), 0) THEN
    IF es_admin AND motivo IS NOT NULL THEN
      INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
      VALUES ('expedientes', NEW.id, 'cambio_estado_forzado:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
              jsonb_build_object('faltan', to_jsonb(forzables), 'justificacion', motivo));
    ELSE
      RAISE EXCEPTION 'No se puede cambiar el estado: %. Solo un Administrador puede forzarlo con justificación.', array_to_string(forzables, '; ');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ===== Columnas de cierre =====
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS cierre_snapshot jsonb;
COMMENT ON COLUMN public.expedientes.cierre_snapshot IS 'Foto al marcar Completado: línea de tiempo, días, pendientes aceptados, motivo, usuario y lote.';

-- ===== Lotes de cierre (deshacibles) =====
CREATE TABLE public.expediente_cierre_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  cantidad integer NOT NULL DEFAULT 0,
  hitos_no_aplica integer NOT NULL DEFAULT 0,
  deshecho_en timestamptz,
  deshecho_por uuid
);
GRANT SELECT ON public.expediente_cierre_lotes TO authenticated;
GRANT ALL ON public.expediente_cierre_lotes TO service_role;
ALTER TABLE public.expediente_cierre_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal de cierre lee lotes de cierre" ON public.expediente_cierre_lotes
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'operaciones'::app_role, 'finanzas'::app_role]));

CREATE TABLE public.expediente_cierre_lote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.expediente_cierre_lotes(id) ON DELETE CASCADE,
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  hitos jsonb NOT NULL DEFAULT '[]'::jsonb,
  revertido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expediente_cierre_lote_items_lote_idx ON public.expediente_cierre_lote_items(lote_id);
GRANT SELECT ON public.expediente_cierre_lote_items TO authenticated;
GRANT ALL ON public.expediente_cierre_lote_items TO service_role;
ALTER TABLE public.expediente_cierre_lote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal de cierre lee items de lotes de cierre" ON public.expediente_cierre_lote_items
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'operaciones'::app_role, 'finanzas'::app_role]));

-- ===== Hechos para evaluar el cierre (respeta RLS del usuario) =====
CREATE OR REPLACE FUNCTION public.hechos_cierre_expedientes(p_ids uuid[])
RETURNS TABLE(expediente_id uuid, hechos jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, jsonb_build_object(
    'estado', e.estado::text,
    'docs', jsonb_build_object(
      'factura', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo = 'Factura comercial' AND COALESCE(btrim(d.storage_path), '') <> ''),
      'bl', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo IN ('Bill of Lading', 'Guía aérea') AND COALESCE(btrim(d.storage_path), '') <> ''),
      'dua', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo IN ('Declaración Única Aduanera (DUA)', 'DUA') AND COALESCE(btrim(d.storage_path), '') <> ''),
      'liquidacion', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo = 'Reporte de Liquidación de Impuestos' AND COALESCE(btrim(d.storage_path), '') <> '')
    ),
    'numero_igra', NULLIF(btrim(COALESCE(e.numero_igra, '')), ''),
    'fecha_aprobacion_despacho', e.fecha_aprobacion_despacho,
    'factura_ecf_id', e.factura_ecf_id,
    'siga_cargado', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo = 'Seguimiento SIGA (Estado de Desaduanización)' AND COALESCE(btrim(d.storage_path), '') <> ''),
    'siga_despacho_completo', EXISTS (SELECT 1 FROM expediente_siga_procesos p WHERE p.expediente_id = e.id AND p.proceso = 'despacho' AND p.estado ILIKE '%complet%'),
    'facturas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'encf', fe.encf,
        'emision', COALESCE(fe.fecha_emision, f.fecha_emision),
        'monto', COALESCE(f.monto, 0),
        'pagado', COALESCE((SELECT sum(p.monto) FROM cxc_pagos p WHERE p.factura_id = f.id), 0)
      ) ORDER BY COALESCE(fe.fecha_emision, f.fecha_emision))
      FROM facturas f LEFT JOIN facturas_ecf fe ON fe.id = f.factura_ecf_id
      WHERE f.expediente_id = e.id AND f.deleted_at IS NULL), '[]'::jsonb),
    'hitos_pendientes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'codigo', h.hito_codigo, 'nombre', c.nombre, 'estado', h.estado::text) ORDER BY c.orden, c.nombre)
      FROM expediente_hitos h JOIN catalogo_hitos c ON c.codigo = h.hito_codigo AND c.activo
      WHERE h.expediente_id = e.id AND h.estado NOT IN ('completado', 'no_aplica')), '[]'::jsonb),
    'transportes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'numero', t.numero_viaje, 'estado', t.estado::text, 'solicitud_pago_id', t.solicitud_pago_id,
        'conciliado', t.solicitud_pago_id IS NOT NULL AND EXISTS (SELECT 1 FROM banco_conciliaciones bc WHERE bc.solicitud_id = t.solicitud_pago_id)
      ) ORDER BY t.numero_viaje)
      FROM transportes t WHERE t.expediente_id = e.id AND t.eliminado_en IS NULL), '[]'::jsonb),
    'incidencias_abiertas', (SELECT count(*) FROM incidencias i WHERE i.expediente_id = e.id AND i.estado IN ('abierta', 'en_gestion')),
    'fechas', jsonb_build_object(
      'llegada', COALESCE(e.fecha_llegada_real, (e.siga_fecha_llegada AT TIME ZONE 'America/Santo_Domingo')::date),
      'presentado', e.fecha_presentado,
      'aprobacion', e.fecha_aprobacion_despacho,
      'despacho_siga', (SELECT (max(p.fecha) AT TIME ZONE 'America/Santo_Domingo')::date FROM expediente_siga_procesos p WHERE p.expediente_id = e.id AND p.proceso = 'despacho' AND p.estado ILIKE '%complet%'),
      'despachado', e.fecha_despachado,
      'entregado', e.fecha_entregado,
      'facturado', COALESCE((SELECT fe.fecha_emision FROM facturas_ecf fe WHERE fe.id = e.factura_ecf_id), e.fecha_facturado),
      'retiro', (SELECT min(t.fecha_salida) FROM transportes t WHERE t.expediente_id = e.id AND t.eliminado_en IS NULL),
      'cobro', (SELECT max(p.fecha_pago) FROM cxc_pagos p JOIN facturas f ON f.id = p.factura_id WHERE f.expediente_id = e.id AND f.deleted_at IS NULL)
    )
  )
  FROM expedientes e
  WHERE e.id = ANY(p_ids) AND e.eliminado_en IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.hechos_cierre_expedientes(uuid[]) TO authenticated;

-- ===== Pendientes que bloquean el cierre (misma regla que src/lib/expediente-cierre.ts) =====
CREATE OR REPLACE FUNCTION public.pendientes_cierre_desde_hechos(h jsonb, p_omitir_checklist boolean DEFAULT false)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  res text[] := ARRAY[]::text[];
  faltan text[] := ARRAY[]::text[];
  corte constant date := DATE '2026-11-01';
  f jsonb; t jsonb; n int;
BEGIN
  IF NOT COALESCE((h->'docs'->>'factura')::boolean, false) THEN faltan := faltan || 'Factura comercial'::text; END IF;
  IF NOT COALESCE((h->'docs'->>'bl')::boolean, false) THEN faltan := faltan || 'BL / Guía aérea'::text; END IF;
  IF NOT COALESCE((h->'docs'->>'dua')::boolean, false) THEN faltan := faltan || 'DUA'::text; END IF;
  IF NOT COALESCE((h->'docs'->>'liquidacion')::boolean, false) THEN faltan := faltan || 'Liquidación de Impuestos'::text; END IF;
  IF array_length(faltan, 1) > 0 THEN res := res || ('Documentos faltantes: ' || array_to_string(faltan, ', ')); END IF;
  IF h->>'numero_igra' IS NULL OR h->>'fecha_aprobacion_despacho' IS NULL THEN
    res := res || 'Despacho completo: falta el N.º de despacho o su fecha de aprobación'::text;
  END IF;
  IF h->>'factura_ecf_id' IS NULL THEN res := res || 'No hay factura e-CF vinculada'::text; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(h->'facturas', '[]'::jsonb)) LOOP
    IF f->>'emision' IS NOT NULL AND (f->>'emision')::date >= corte
       AND COALESCE((f->>'pagado')::numeric, 0) < COALESCE((f->>'monto')::numeric, 0) - 0.01 THEN
      res := res || ('Saldo sin cobrar en factura ' || COALESCE(f->>'encf', 'emitida el ' || (f->>'emision')));
    END IF;
  END LOOP;
  IF NOT p_omitir_checklist THEN
    n := jsonb_array_length(COALESCE(h->'hitos_pendientes', '[]'::jsonb));
    IF n > 0 THEN res := res || ('Checklist incompleto: ' || n || ' paso(s) pendiente(s)'); END IF;
  END IF;
  FOR t IN SELECT * FROM jsonb_array_elements(COALESCE(h->'transportes', '[]'::jsonb)) LOOP
    IF COALESCE(t->>'estado', '') NOT IN ('entregado', 'facturado') THEN
      res := res || ('Viaje ' || COALESCE(t->>'numero', '') || ' sin entregar');
    END IF;
    IF t->>'solicitud_pago_id' IS NULL THEN
      res := res || ('Viaje ' || COALESCE(t->>'numero', '') || ' sin pago de transporte registrado');
    END IF;
  END LOOP;
  IF COALESCE((h->>'incidencias_abiertas')::int, 0) > 0 THEN
    res := res || ((h->>'incidencias_abiertas') || ' incidencia(s) abierta(s)');
  END IF;
  RETURN res;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pendientes_cierre_desde_hechos(jsonb, boolean) TO authenticated;

-- ===== Completar =====
CREATE OR REPLACE FUNCTION public.completar_expediente(p_id uuid, p_motivo text DEFAULT NULL, p_snapshot jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_estado text; h jsonb; pend text[]; motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), ''); snap jsonb;
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'operaciones'::app_role, 'finanzas'::app_role]) THEN
    RAISE EXCEPTION 'Solo Administración, Operaciones o Finanzas pueden marcar un Expediente como Completado.';
  END IF;
  SELECT estado::text INTO v_estado FROM expedientes WHERE id = p_id AND eliminado_en IS NULL FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'Expediente no encontrado.'; END IF;
  IF v_estado <> 'facturar' THEN RAISE EXCEPTION 'Solo un Expediente en Facturado puede marcarse como Completado.'; END IF;
  SELECT x.hechos INTO h FROM public.hechos_cierre_expedientes(ARRAY[p_id]) x;
  pend := public.pendientes_cierre_desde_hechos(h, false);
  IF COALESCE(array_length(pend, 1), 0) > 0 AND motivo IS NULL THEN
    RAISE EXCEPTION 'No se puede completar sin motivo: %', array_to_string(pend, '; ');
  END IF;
  snap := COALESCE(p_snapshot, '{}'::jsonb) || jsonb_build_object(
    'pendientes', to_jsonb(pend), 'motivo', motivo, 'usuario_id', auth.uid(), 'completado_en', now());
  PERFORM set_config('app.cierre_expediente', 'on', true);
  UPDATE expedientes SET estado = 'completado', fecha_cierre = now(), cierre_snapshot = snap WHERE id = p_id;
  PERFORM set_config('app.cierre_expediente', 'off', true);
  INSERT INTO auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', p_id, 'expediente_completado', auth.uid(),
          jsonb_build_object('estado_anterior', 'facturar', 'estado_nuevo', 'completado', 'pendientes', to_jsonb(pend), 'motivo', motivo));
  RETURN jsonb_build_object('pendientes', to_jsonb(pend));
END;
$$;
REVOKE ALL ON FUNCTION public.completar_expediente(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_expediente(uuid, text, jsonb) TO authenticated;

-- ===== Reabrir (solo Administrador) =====
CREATE OR REPLACE FUNCTION public.reabrir_expediente(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_estado text; v_snap jsonb; motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede reabrir un Expediente Completado.';
  END IF;
  IF motivo IS NULL THEN RAISE EXCEPTION 'Escribe el motivo para reabrir el Expediente.'; END IF;
  SELECT estado::text, cierre_snapshot INTO v_estado, v_snap FROM expedientes WHERE id = p_id FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'completado' THEN RAISE EXCEPTION 'El Expediente no está Completado.'; END IF;
  PERFORM set_config('app.cierre_expediente', 'on', true);
  UPDATE expedientes SET estado = 'facturar', fecha_cierre = NULL, cierre_snapshot = NULL WHERE id = p_id;
  PERFORM set_config('app.cierre_expediente', 'off', true);
  INSERT INTO auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', p_id, 'expediente_reabierto', auth.uid(),
          jsonb_build_object('estado_anterior', 'completado', 'estado_nuevo', 'facturar', 'motivo', motivo, 'cierre_anterior', v_snap));
END;
$$;
REVOKE ALL ON FUNCTION public.reabrir_expediente(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_expediente(uuid, text) TO authenticated;

-- ===== Lote histórico =====
CREATE OR REPLACE FUNCTION public.aplicar_lote_cierre(p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_lote uuid; it jsonb; v_id uuid; v_estado text; h jsonb; pend text[]; hitos jsonb; n_exp int := 0; n_hitos int := 0; v_num text;
BEGIN
  IF NOT private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'operaciones'::app_role, 'finanzas'::app_role]) THEN
    RAISE EXCEPTION 'Solo Administración, Operaciones o Finanzas pueden completar Expedientes.';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay Expedientes seleccionados.';
  END IF;
  INSERT INTO expediente_cierre_lotes (creado_por) VALUES (auth.uid()) RETURNING id INTO v_lote;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_id := (it->>'expediente_id')::uuid;
    SELECT estado::text, numero INTO v_estado, v_num FROM expedientes WHERE id = v_id AND eliminado_en IS NULL FOR UPDATE;
    IF v_estado IS DISTINCT FROM 'facturar' THEN
      RAISE EXCEPTION 'El Expediente % ya no está en Facturado.', COALESCE(v_num, v_id::text);
    END IF;
    SELECT x.hechos INTO h FROM public.hechos_cierre_expedientes(ARRAY[v_id]) x;
    pend := public.pendientes_cierre_desde_hechos(h, true);
    IF COALESCE(array_length(pend, 1), 0) > 0 THEN
      RAISE EXCEPTION 'El Expediente % ya no cumple: %', v_num, array_to_string(pend, '; ');
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', eh.id, 'estado', eh.estado::text)), '[]'::jsonb) INTO hitos
      FROM expediente_hitos eh JOIN catalogo_hitos c ON c.codigo = eh.hito_codigo AND c.activo
     WHERE eh.expediente_id = v_id AND eh.estado NOT IN ('completado', 'no_aplica');
    UPDATE expediente_hitos SET estado = 'no_aplica'
     WHERE id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(hitos) x);
    n_hitos := n_hitos + jsonb_array_length(hitos);
    INSERT INTO expediente_cierre_lote_items (lote_id, expediente_id, hitos) VALUES (v_lote, v_id, hitos);
    PERFORM set_config('app.cierre_expediente', 'on', true);
    UPDATE expedientes SET estado = 'completado', fecha_cierre = now(),
      cierre_snapshot = COALESCE(it->'snapshot', '{}'::jsonb) || jsonb_build_object(
        'pendientes', '[]'::jsonb, 'motivo', NULL, 'lote_id', v_lote, 'hitos_no_aplica', jsonb_array_length(hitos),
        'usuario_id', auth.uid(), 'completado_en', now())
     WHERE id = v_id;
    PERFORM set_config('app.cierre_expediente', 'off', true);
    INSERT INTO auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('expedientes', v_id, 'expediente_completado', auth.uid(),
            jsonb_build_object('estado_anterior', 'facturar', 'estado_nuevo', 'completado', 'lote_id', v_lote,
                               'hitos_no_aplica', hitos, 'origen', 'lote_historico'));
    n_exp := n_exp + 1;
  END LOOP;
  UPDATE expediente_cierre_lotes SET cantidad = n_exp, hitos_no_aplica = n_hitos WHERE id = v_lote;
  RETURN v_lote;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_lote_cierre(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_lote_cierre(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.deshacer_lote_cierre(p_lote uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE r record; x jsonb; n int := 0;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el Administrador puede deshacer un lote de cierre (equivale a reabrir).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expediente_cierre_lotes WHERE id = p_lote AND deshecho_en IS NULL) THEN
    RAISE EXCEPTION 'El lote no existe o ya fue deshecho.';
  END IF;
  FOR r IN SELECT i.*, e.estado::text AS estado_exp, e.cierre_snapshot
             FROM expediente_cierre_lote_items i JOIN expedientes e ON e.id = i.expediente_id
            WHERE i.lote_id = p_lote AND NOT i.revertido LOOP
    FOR x IN SELECT * FROM jsonb_array_elements(r.hitos) LOOP
      UPDATE expediente_hitos SET estado = (x->>'estado')::hito_estado
       WHERE id = (x->>'id')::uuid AND estado = 'no_aplica';
    END LOOP;
    IF r.estado_exp = 'completado' AND (r.cierre_snapshot->>'lote_id') = p_lote::text THEN
      PERFORM set_config('app.cierre_expediente', 'on', true);
      UPDATE expedientes SET estado = 'facturar', fecha_cierre = NULL, cierre_snapshot = NULL WHERE id = r.expediente_id;
      PERFORM set_config('app.cierre_expediente', 'off', true);
    END IF;
    UPDATE expediente_cierre_lote_items SET revertido = true WHERE id = r.id;
    INSERT INTO auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('expedientes', r.expediente_id, 'expediente_cierre_deshecho', auth.uid(),
            jsonb_build_object('lote_id', p_lote, 'hitos_restaurados', r.hitos));
    n := n + 1;
  END LOOP;
  UPDATE expediente_cierre_lotes SET deshecho_en = now(), deshecho_por = auth.uid() WHERE id = p_lote;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.deshacer_lote_cierre(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deshacer_lote_cierre(uuid) TO authenticated;

-- ===== Bloqueo de datos importantes en Completado =====
-- Solo se bloquea cambiar o borrar un valor ya guardado; completar un campo vacío sigue permitido
-- (lecturas automáticas que solo llenan vacíos no fallan).
CREATE OR REPLACE FUNCTION public.expediente_bloqueo_completado()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE k text; o jsonb; nw jsonb; cambiados text[] := ARRAY[]::text[];
BEGIN
  IF OLD.estado::text <> 'completado' OR NEW.estado::text <> 'completado' THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('app.cierre_expediente', true), '') = 'on' THEN RETURN NEW; END IF;
  o := to_jsonb(OLD); nw := to_jsonb(NEW);
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    IF k ~ '^(numero_dua|numero_igra|regimen_aduanero|cliente_id|factura_ecf_id|bl_awb|tasa_cambio_usada|tasa_cambio_congelada|liq_oficial_total|total_fob|total_cif|seguro|flete|otros|peso_neto|peso_bruto|cierre_snapshot|liq_siga_.*|pin_.*|fecha_.*)$'
       AND o->k IS NOT NULL AND o->k <> 'null'::jsonb AND o->k <> '""'::jsonb
       AND (nw->k) IS DISTINCT FROM (o->k) THEN
      cambiados := cambiados || k;
    END IF;
  END LOOP;
  IF array_length(cambiados, 1) > 0 THEN
    RAISE EXCEPTION 'Expediente Completado: los datos importantes están bloqueados (%). Un Administrador debe reabrirlo para cambiarlos.', array_to_string(cambiados, ', ');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_expediente_bloqueo_completado BEFORE UPDATE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.expediente_bloqueo_completado();

CREATE OR REPLACE FUNCTION public.expediente_hijo_bloqueo_completado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[]; o jsonb; nw jsonb; libres text[];
BEGIN
  IF TG_OP = 'DELETE' THEN ids := ARRAY[OLD.expediente_id];
  ELSIF TG_OP = 'INSERT' THEN ids := ARRAY[NEW.expediente_id];
  ELSE ids := ARRAY[OLD.expediente_id, NEW.expediente_id]; END IF;
  IF NOT EXISTS (SELECT 1 FROM expedientes WHERE id = ANY(ids) AND estado::text = 'completado') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Campos que pueden seguir cambiando: estado de pago, notas y adjuntos.
    libres := CASE TG_TABLE_NAME
      WHEN 'gastos' THEN ARRAY['pago_estado', 'fecha_pago', 'notas', 'adjunto_path', 'updated_at']
      WHEN 'costos' THEN ARRAY['estado_facturacion', 'estado_cobro', 'observaciones', 'fecha_pago', 'referencia']
      ELSE ARRAY['updated_at'] END;
    o := to_jsonb(OLD) - libres; nw := to_jsonb(NEW) - libres;
    IF o = nw THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Expediente Completado: no se pueden cambiar mercancías, gastos ni costos. Un Administrador debe reabrirlo.';
END;
$$;
CREATE TRIGGER zz_bloqueo_completado BEFORE INSERT OR UPDATE OR DELETE ON public.mercancia_items
  FOR EACH ROW EXECUTE FUNCTION public.expediente_hijo_bloqueo_completado();
CREATE TRIGGER zz_bloqueo_completado BEFORE INSERT OR UPDATE OR DELETE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.expediente_hijo_bloqueo_completado();
CREATE TRIGGER zz_bloqueo_completado BEFORE INSERT OR UPDATE OR DELETE ON public.costos
  FOR EACH ROW EXECUTE FUNCTION public.expediente_hijo_bloqueo_completado();