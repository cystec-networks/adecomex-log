DROP POLICY IF EXISTS "portal users read authorized documentos" ON storage.objects;

CREATE POLICY "portal users read authorized documentos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos'
  AND (
    EXISTS (
      SELECT 1
      FROM public.documentos d
      JOIN public.expedientes e ON e.id = d.expediente_id
      JOIN public.cliente_usuarios cu ON cu.cliente_id = e.cliente_id
      WHERE cu.user_id = auth.uid()
        AND cu.activo = true
        AND d.storage_path = storage.objects.name
    )
    OR EXISTS (
      SELECT 1
      FROM public.facturas_ecf f
      JOIN public.cliente_usuarios cu ON cu.cliente_id = f.cliente_id
      WHERE cu.user_id = auth.uid()
        AND cu.activo = true
        AND f.eliminado_en IS NULL
        AND f.pdf_url = storage.objects.name
    )
  )
);

REVOKE ALL ON FUNCTION private.portal_puede_leer_documento(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.portal_puede_leer_documento(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION private.portal_puede_leer_documento(uuid, text) FROM service_role;
DROP FUNCTION private.portal_puede_leer_documento(uuid, text);