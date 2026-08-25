ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS area_aduanera text;

UPDATE public.expedientes e
   SET area_aduanera = da.area
  FROM public.dga_areas da
 WHERE e.area_aduanera_codigo = da.codigo
   AND e.area_aduanera IS NULL
   AND e.area_aduanera_codigo IS NOT NULL;