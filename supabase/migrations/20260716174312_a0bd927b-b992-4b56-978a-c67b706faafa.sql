UPDATE public.expedientes SET fecha_recibido = CURRENT_DATE WHERE estado = 'digitar' AND fecha_recibido IS NULL;
UPDATE public.expedientes SET fecha_en_transito = CURRENT_DATE WHERE estado = 'en_transito' AND fecha_en_transito IS NULL;
UPDATE public.expedientes SET fecha_presentado = CURRENT_DATE WHERE estado = 'presentar' AND fecha_presentado IS NULL;
UPDATE public.expedientes SET fecha_verificado = CURRENT_DATE WHERE estado = 'verificar' AND fecha_verificado IS NULL;
UPDATE public.expedientes SET fecha_despachado = CURRENT_DATE WHERE estado = 'despachado' AND fecha_despachado IS NULL;
UPDATE public.expedientes SET fecha_entregado = CURRENT_DATE WHERE estado = 'entregado' AND fecha_entregado IS NULL;
UPDATE public.expedientes SET fecha_facturado = CURRENT_DATE WHERE estado = 'facturar' AND fecha_facturado IS NULL;