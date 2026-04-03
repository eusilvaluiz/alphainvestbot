ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.user_id
  AND (p.email IS NULL OR p.email = '');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique_idx
ON public.profiles ((lower(email)))
WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fallback_username text;
BEGIN
  fallback_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(COALESCE(NEW.email, ''), '@', 1) || '_' || left(replace(NEW.id::text, '-', ''), 6),
    'user_' || left(replace(NEW.id::text, '-', ''), 6)
  );

  INSERT INTO public.profiles (user_id, name, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    fallback_username,
    NEW.email
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    name = COALESCE(EXCLUDED.name, public.profiles.name),
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.get_profile_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE lower(p.username) = lower(public.normalize_username_value(_username))
  LIMIT 1;
$$;