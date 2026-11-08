-- El personal ya puede leer las fichas y el texto de la Base normativa; ahora también
-- puede abrir el PDF original en el visor integrado (citas del asistente).
DROP POLICY IF EXISTS base_normativa_staff_lee ON storage.objects;
CREATE POLICY base_normativa_staff_lee
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'base-normativa' AND private.is_staff(auth.uid()));