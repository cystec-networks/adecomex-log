
CREATE POLICY "docs staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='documentos' AND public.is_staff(auth.uid()));
CREATE POLICY "docs staff insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='documentos' AND public.is_staff(auth.uid()));
CREATE POLICY "docs staff update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='documentos' AND public.is_staff(auth.uid()));
CREATE POLICY "docs staff delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='documentos' AND public.is_staff(auth.uid()));
