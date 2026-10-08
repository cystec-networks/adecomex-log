CREATE OR REPLACE FUNCTION public.expediente_docs_core_faltantes(_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT string_agg(t, ', ' ORDER BY o) FROM unnest(ARRAY['Factura comercial','Bill of Lading']) WITH ORDINALITY AS c(t, o)
  WHERE NOT EXISTS (SELECT 1 FROM public.documentos d WHERE d.expediente_id = _id AND d.tipo = c.t AND d.estado IN ('recibido','aprobado'));
$$;