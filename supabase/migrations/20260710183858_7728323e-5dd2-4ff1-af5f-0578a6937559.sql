
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS medio_transporte text,
  ADD COLUMN IF NOT EXISTS naviera text,
  ADD COLUMN IF NOT EXISTS suplidor text,
  ADD COLUMN IF NOT EXISTS pais_origen text,
  ADD COLUMN IF NOT EXISTS incoterm text,
  ADD COLUMN IF NOT EXISTS puerto_salida text,
  ADD COLUMN IF NOT EXISTS puerto_arribo text,
  ADD COLUMN IF NOT EXISTS numero_dua text,
  ADD COLUMN IF NOT EXISTS numero_vuce text,
  ADD COLUMN IF NOT EXISTS numero_igra text,
  ADD COLUMN IF NOT EXISTS descripcion_mercancia text,
  ADD COLUMN IF NOT EXISTS peso_neto numeric,
  ADD COLUMN IF NOT EXISTS peso_bruto numeric,
  ADD COLUMN IF NOT EXISTS numeros_contenedores text,
  ADD COLUMN IF NOT EXISTS preferencia_comercial text,
  ADD COLUMN IF NOT EXISTS canal_riesgo text;
