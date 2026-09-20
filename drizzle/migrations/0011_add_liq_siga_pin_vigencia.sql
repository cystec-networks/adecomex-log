ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS liq_siga_registro_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liq_siga_termino_at TIMESTAMPTZ;

UPDATE public.expedientes
   SET liq_siga_registro_at = (liq_siga_fecha_registro::timestamp AT TIME ZONE 'America/Santo_Domingo')
 WHERE liq_siga_fecha_registro IS NOT NULL
   AND liq_siga_registro_at IS NULL;

UPDATE public.expedientes
   SET liq_siga_termino_at = liq_siga_registro_at + INTERVAL '96 hours'
 WHERE liq_siga_registro_at IS NOT NULL
   AND liq_siga_termino_at IS NULL;