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
            public.normalize_username_value(COALESCE(username, name, split_part(email, '@', 1), 'user')),
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
  AND (
    p.username IS NULL
    OR p.username = ''
    OR p.username !~ '^[A-Za-z0-9_]{3,30}$'
  );