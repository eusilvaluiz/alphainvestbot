CREATE OR REPLACE FUNCTION public.get_profile_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE lower(coalesce(p.username, '')) = lower(trim(coalesce(_username, '')))
     OR lower(public.normalize_username_value(coalesce(p.username, ''))) = lower(public.normalize_username_value(trim(coalesce(_username, ''))))
  LIMIT 1;
$$;