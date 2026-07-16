
-- 1. Add con_alerta column
ALTER TABLE public.catalogo_hitos ADD COLUMN IF NOT EXISTS con_alerta boolean NOT NULL DEFAULT false;

-- 2. Deactivate old hitos
UPDATE public.catalogo_hitos SET activo = false
WHERE codigo IN (
  'verificacion_mercancia_puerto','confirmacion_valores_impuestos','expediente_fisico_puerto',
  'expediente_digital_puerto','documentos_transportista','cita_asignada_puerto'
);

-- 3. Insert new 16 hitos
INSERT INTO public.catalogo_hitos (codigo, nombre, orden, con_alerta, activo) VALUES
  ('solicitud_recibida','Solicitud Recibida',10,false,true),
  ('documentos_recibidos','Documentos recibidos',20,false,true),
  ('permiso_vuce_solicitado','Permiso VUCE solicitado (si aplica)',30,false,true),
  ('permiso_vuce_enviado_cliente','Permiso VUCE enviado al cliente (si aplica)',40,false,true),
  ('liquidacion_temporal_enviada','Liquidación Temporal enviada al cliente (si aplica)',50,false,true),
  ('preferencia_arancelaria_siga','Preferencia arancelaria presentada en SIGA (si aplica)',60,false,true),
  ('solicitud_oficio_dga','Solicitud de oficio en enviada a DGA (si aplica)',70,false,true),
  ('valores_pagar_enviados','Valores a pagar enviados al Cliente',80,false,true),
  ('turno_verificacion_puerto','Solicitud de turno para Verificación en puerto (si aplica)',90,true,true),
  ('documentos_originales_despacho','Documentos originales para despacho recibidos',100,false,true),
  ('expediente_enviado_gestor','Expediente enviado al gestor',110,false,true),
  ('aprobacion_permiso_puerto','Aprobación de permiso en puerto (si aplica)',120,false,true),
  ('liberado_despacho_puerto','Liberado para el Despacho en puerto',130,false,true),
  ('documentos_enviados_transportista','Documentos enviados al Transportista',140,false,true),
  ('expediente_despachado_puerto','Expediente Despachado del puerto',150,false,true),
  ('factura_venta_enviada','Factura de venta enviada al cliente',160,false,true)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  orden = EXCLUDED.orden,
  con_alerta = EXCLUDED.con_alerta,
  activo = true;

-- 4. Backfill: insert missing hitos for existing expedientes
INSERT INTO public.expediente_hitos (expediente_id, hito_codigo, orden, estado)
SELECT e.id, c.codigo, c.orden, 'pendiente'::hito_estado
FROM public.expedientes e
CROSS JOIN public.catalogo_hitos c
WHERE c.codigo IN (
  'solicitud_recibida','documentos_recibidos','permiso_vuce_solicitado','permiso_vuce_enviado_cliente',
  'liquidacion_temporal_enviada','preferencia_arancelaria_siga','solicitud_oficio_dga','valores_pagar_enviados',
  'turno_verificacion_puerto','documentos_originales_despacho','expediente_enviado_gestor','aprobacion_permiso_puerto',
  'liberado_despacho_puerto','documentos_enviados_transportista','expediente_despachado_puerto','factura_venta_enviada'
)
AND NOT EXISTS (
  SELECT 1 FROM public.expediente_hitos eh
  WHERE eh.expediente_id = e.id AND eh.hito_codigo = c.codigo
);

-- 5. Drop trigger that creates 14 default etapas
DROP TRIGGER IF EXISTS on_expediente_creado ON public.expedientes;
DROP FUNCTION IF EXISTS public.crear_etapas_default();
