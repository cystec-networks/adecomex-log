UPDATE public.expedientes
   SET descripcion_mercancia = observaciones,
       observaciones = descripcion_mercancia;