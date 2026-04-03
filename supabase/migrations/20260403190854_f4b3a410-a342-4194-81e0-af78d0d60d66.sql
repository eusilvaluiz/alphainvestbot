ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username text;

CREATE OR REPLACE FUNCTION public.normalize_username_value(input_username text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(trim(coalesce(input_username, '')), '[^a-zA-Z0-9_]+', '_', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.set_and_validate_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized_username text;
BEGIN
  normalized_username := public.normalize_username_value(COALESCE(NEW.username, NEW.name, 'user'));
  normalized_username := regexp_replace(normalized_username, '^_+|_+$', '', 'g');

  IF char_length(normalized_username) < 3 THEN
    normalized_username := normalized_username || repeat('_', 3 - char_length(normalized_username));
  END IF;

  IF char_length(normalized_username) > 30 THEN
    normalized_username := left(normalized_username, 30);
    normalized_username := regexp_replace(normalized_username, '_+$', '', 'g');
  END IF;

  IF normalized_username = '' THEN
    normalized_username := 'user';
  END IF;

  IF normalized_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Username inválido';
  END IF;

  NEW.username := normalized_username;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_username_trigger ON public.profiles;
CREATE TRIGGER set_profile_username_trigger
BEFORE INSERT OR UPDATE OF username, name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_and_validate_profile_username();

WITH prepared AS (
  SELECT
    id,
    CASE
      WHEN base_username = '' THEN 'user'
      ELSE base_username
    END AS base_username,
    row_number() OVER (
      PARTITION BY CASE WHEN base_username = '' THEN 'user' ELSE base_username END
      ORDER BY created_at, id
    ) AS rn
  FROM (
    SELECT
      id,
      created_at,
      regexp_replace(
        left(
          regexp_replace(
            public.normalize_username_value(COALESCE(username, name, 'user')),
            '^_+|_+$',
            '',
            'g'
          ),
          24
        ),
        '_+$',
        '',
        'g'
      ) AS base_username
    FROM public.profiles
  ) source
), generated AS (
  SELECT
    id,
    CASE
      WHEN rn = 1 THEN base_username
      ELSE left(base_username, 24) || '_' || rn::text
    END AS final_username
  FROM prepared
)
UPDATE public.profiles p
SET username = g.final_username
FROM generated g
WHERE p.id = g.id
  AND (p.username IS NULL OR p.username = '');

ALTER TABLE public.profiles
ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique_idx
ON public.profiles ((lower(username)));