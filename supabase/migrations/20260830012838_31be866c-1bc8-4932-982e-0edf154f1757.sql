ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_portal_account boolean NOT NULL DEFAULT false;

-- Backfill: marca como cuenta de portal cualquier profile vinculado en cliente_usuarios
UPDATE public.profiles p
   SET is_portal_account = true
  FROM public.cliente_usuarios cu
 WHERE cu.user_id = p.id;

-- Actualizar handle_new_user para persistir is_portal_account en profiles
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
  INSERT INTO public.profiles (id, nombre, email, is_portal_account)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'is_portal_account')::boolean, false)
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