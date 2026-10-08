CREATE OR REPLACE FUNCTION public.expediente_docs_core_faltantes(_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT string_agg(t, ', ' ORDER BY o) FROM unnest(ARRAY['Factura comercial','Bill of Lading','Lista de empaque','Certificado de origen','Certificado Sanitario/Fitosanitario','Certificado de análisis']) WITH ORDINALITY AS c(t, o)
  WHERE NOT EXISTS (SELECT 1 FROM public.documentos d WHERE d.expediente_id = _id AND d.tipo = c.t AND d.estado IN ('recibido','aprobado'));
$$;

CREATE OR REPLACE FUNCTION public.expedientes_auto_en_transito()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.fecha_compromiso IS NULL AND NEW.fecha_compromiso IS NOT NULL AND NEW.estado = 'digitar'
     AND COALESCE(btrim(NEW.bl_awb), '') <> '' AND public.expediente_docs_core_faltantes(NEW.id) IS NULL THEN
    NEW.estado := 'en_transito';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_transicion_expediente()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE
  orden text[] := ARRAY['digitar','en_transito','manifestado','presentar','verificar','despachado','entregado','facturar'];
  i_old int; i_new int; i int; paso text; forzar boolean; n_perm int; ej text;
  tiene_fac boolean; tiene_bl boolean; falta_docs text; es_priv boolean; es_admin boolean; falta_fechas text;
  motivo text; forzables text[] := ARRAY[]::text[];
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN NEW.forzar_regreso_estado := false; RETURN NEW; END IF;
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
        IF es_priv THEN
          INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
          VALUES ('expedientes', NEW.id, 'presentado_forzado_documentos:' || OLD.estado::text || '->' || NEW.estado::text, auth.uid(),
                  jsonb_build_object('faltan', falta_docs, 'motivo', NEW.motivo_regreso_estado));
        ELSE
          RAISE EXCEPTION 'No se puede marcar como Presentado: falta adjuntar %.', falta_docs;
        END IF;
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

  IF array_length(forzables, 1) > 0 THEN
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