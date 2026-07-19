
-- PARTE 1: Actualizar handle_new_user para respetar la marca is_portal_account
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  is_portal BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, nombre, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email
  ) ON CONFLICT (id) DO NOTHING;

  is_portal := COALESCE((NEW.raw_user_meta_data->>'is_portal_account')::boolean, false);
  IF is_portal THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operaciones')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- PARTE 3: Limpieza retroactiva
-- Registro de los roles que serán eliminados (queda en el log de la migración):
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ur.user_id, ur.role
    FROM public.user_roles ur
    WHERE ur.user_id IN (SELECT user_id FROM public.cliente_usuarios)
       OR ur.user_id IN (SELECT user_id FROM public.estudiante_usuarios)
  LOOP
    RAISE NOTICE 'Eliminando rol staff indebido: user_id=%, role=%', r.user_id, r.role;
  END LOOP;
END $$;

DELETE FROM public.user_roles
WHERE user_id IN (SELECT user_id FROM public.cliente_usuarios)
   OR user_id IN (SELECT user_id FROM public.estudiante_usuarios);
