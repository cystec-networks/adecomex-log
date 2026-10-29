CREATE OR REPLACE FUNCTION private.despertar_documentos_combinados() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, extensions AS $$
BEGIN
  IF NEW.estado = 'pendiente' AND NEW.intentos < 3 THEN
    PERFORM net.http_post(
      url := 'https://app.adecomex.com/api/public/documentos-combinados',
      headers := jsonb_build_object('Content-Type','application/json','x-tarea-token',(SELECT token FROM private.tarea_token WHERE nombre='documentos_combinados')),
      body := jsonb_build_object('id', NEW.id),
      timeout_milliseconds := 300000);
  END IF;
  RETURN NEW;
END $$;