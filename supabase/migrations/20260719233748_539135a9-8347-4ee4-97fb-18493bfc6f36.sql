CREATE POLICY "portal users read documentos" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos' AND (
      EXISTS (SELECT 1 FROM public.cliente_usuarios WHERE user_id = auth.uid() AND activo = true)
      OR EXISTS (SELECT 1 FROM public.estudiante_usuarios WHERE user_id = auth.uid() AND activo = true)
    )
  );