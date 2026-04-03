CREATE OR REPLACE FUNCTION public.get_profile_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE lower(p.username) = lower(public.normalize_username_value(trim(coalesce(_username, ''))))
  LIMIT 1;
$$;