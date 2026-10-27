CREATE TABLE public.solicitudes_correo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remitente text,
  remitente_correo text,
  asunto text,
  cuerpo text NOT NULL,
  mensaje_aislado text,
  bl_awb text,
  eta date,
  producto text,
  cantidad text,
  cliente_nombre text,
  cliente_id uuid,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmada','descartada')),
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.solicitudes_correo TO authenticated;
GRANT ALL ON public.solicitudes_correo TO service_role;
ALTER TABLE public.solicitudes_correo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitudes_correo read" ON public.solicitudes_correo FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "solicitudes_correo update" ON public.solicitudes_correo FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role]));