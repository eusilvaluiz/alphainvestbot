import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildInternalEmail = (username: string) => `${username}@users.alpha-bot.local`;

const buildInternalPassword = async (username: string, secret: string) => {
  const payload = new TextEncoder().encode(`${secret}:${username}:alpha-bot-auth`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", payload);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${hash.slice(0, 24)}Aa1!`;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Configuração de autenticação indisponível");
    }

    const { user, pass } = await req.json();
    const brokerUser = normalizeUsername(String(user ?? ""));
    const brokerPass = String(pass ?? "").trim();

    if (brokerUser.length < 3 || !brokerPass) {
      return json({ error: "Usuário ou senha inválidos" });
    }

    // Login directly to UnicBroker
    const UNIC_BASE = "https://unicbroker.com";

    // Step 1: Get XSRF token
    const initRes = await fetch(`${UNIC_BASE}/login`, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "text/html" },
      redirect: "follow",
    });

    const cookieMap = new Map<string, string>();
    const allCookies = (initRes.headers as any).getSetCookie?.() as string[] | undefined;
    if (allCookies) {
      for (const c of allCookies) {
        const cookiePart = c.split(";")[0];
        const eqIdx = cookiePart.indexOf("=");
        if (eqIdx > 0) cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
      }
    }

    const xsrfCookie = cookieMap.get("XSRF-TOKEN");
    if (!xsrfCookie) throw new Error("Falha na autenticação");
    const xsrfToken = decodeURIComponent(xsrfCookie.split("=").slice(1).join("="));
    const initCookies = Array.from(cookieMap.values()).join("; ");

    // Step 2: Login to UnicBroker
    const brokerResponse = await fetch(`${UNIC_BASE}/publicapi/auth/login/web`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": xsrfToken,
        "X-Requested-With": "XMLHttpRequest",
        Cookie: initCookies,
        Referer: `${UNIC_BASE}/login`,
        Origin: UNIC_BASE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      body: JSON.stringify({ user: brokerUser, pass: brokerPass }),
      redirect: "manual",
    });

    const brokerBody = await brokerResponse.text();

    if (brokerBody.includes('"error"') || brokerBody.includes("não conferem")) {
      return json({ error: "Usuário ou senha inválidos" });
    }

    // Merge login cookies
    const loginCookies = (brokerResponse.headers as any).getSetCookie?.() as string[] | undefined;
    if (loginCookies) {
      for (const c of loginCookies) {
        const cookiePart = c.split(";")[0];
        const eqIdx = cookiePart.indexOf("=");
        if (eqIdx > 0) cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
      }
    }
    const sessionCookies = Array.from(cookieMap.values()).join("; ");

    // Step 3: Get user credits from UnicBroker
    const newXsrf = cookieMap.get("XSRF-TOKEN");
    const finalXsrf = newXsrf ? decodeURIComponent(newXsrf.split("=").slice(1).join("=")) : xsrfToken;

    const creditsRes = await fetch(`${UNIC_BASE}/publicapi/users/get-credits`, {
      headers: {
        Cookie: sessionCookies,
        "X-XSRF-TOKEN": finalXsrf,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: `${UNIC_BASE}/traderoom`,
      },
    });
    const creditsData = await creditsRes.json();

    // Build broker data from UnicBroker response
    const brokerData = {
      status: "success",
      access_token: "unic_session",
      ws_token: "",
      id: creditsData.id ?? 0,
      login: brokerUser,
      name: creditsData.name ?? brokerUser,
      credit: creditsData.credit ?? creditsData.amount ?? "0",
      credit_cents: creditsData.credit_cents ?? 0,
    };

    if (!brokerResponse.ok || brokerData?.status !== "success" || !brokerData?.access_token) {
      return json({ error: "Usuário ou senha inválidos" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const internalPassword = await buildInternalPassword(brokerUser, serviceRoleKey);
    let internalEmail = buildInternalEmail(brokerUser);
    let authUserId: string | null = null;

    const { data: existingProfiles, error: usernameProfileError } = await adminClient
      .from("profiles")
      .select("id, user_id, email")
      .eq("username", brokerUser)
      .limit(1);

    if (usernameProfileError) throw usernameProfileError;

    const existingProfile = existingProfiles?.[0] ?? null;

    if (existingProfile?.user_id) {
      authUserId = existingProfile.user_id;
      internalEmail = existingProfile.email || internalEmail;

      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(authUserId, {
        password: internalPassword,
        email_confirm: true,
        user_metadata: {
          name: brokerData.name || brokerUser,
          username: brokerUser,
        },
      });

      if (updateAuthError) throw updateAuthError;
    } else {
      const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
        email: internalEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: {
          name: brokerData.name || brokerUser,
          username: brokerUser,
        },
      });

      if (createUserError) throw createUserError;
      authUserId = createdUser.user?.id ?? null;
    }

    if (!authUserId) {
      throw new Error("Não foi possível preparar o usuário interno");
    }

    const { data: profileByUserRows, error: profileByUserError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", authUserId)
      .limit(1);

    if (profileByUserError) throw profileByUserError;

    const profileByUser = profileByUserRows?.[0] ?? null;

    if (profileByUser?.id) {
      const { error: updateProfileError } = await adminClient
        .from("profiles")
        .update({
          name: brokerData.name || brokerUser,
          username: brokerUser,
          email: internalEmail,
        })
        .eq("id", profileByUser.id);

      if (updateProfileError) throw updateProfileError;
    } else {
      const { error: insertProfileError } = await adminClient.from("profiles").insert({
        user_id: authUserId,
        name: brokerData.name || brokerUser,
        username: brokerUser,
        email: internalEmail,
      });

      if (insertProfileError) throw insertProfileError;
    }

    const { data: credentialRows, error: credentialError } = await adminClient
      .from("broker_credentials")
      .select("id")
      .eq("user_id", authUserId)
      .limit(1);

    if (credentialError) throw credentialError;

    const credentialPayload = {
      broker_user: brokerUser,
      broker_token: brokerData.access_token,
      ws_token: brokerData.ws_token,
      credit: brokerData.credit,
      credit_cents: brokerData.credit_cents,
    };

    const existingCredential = credentialRows?.[0] ?? null;

    if (existingCredential?.id) {
      const { error: updateCredentialError } = await adminClient
        .from("broker_credentials")
        .update(credentialPayload)
        .eq("id", existingCredential.id);

      if (updateCredentialError) throw updateCredentialError;
    } else {
      const { error: insertCredentialError } = await adminClient.from("broker_credentials").insert({
        user_id: authUserId,
        ...credentialPayload,
      });

      if (insertCredentialError) throw insertCredentialError;
    }

    const { data: authData, error: signInError } = await publicClient.auth.signInWithPassword({
      email: internalEmail,
      password: internalPassword,
    });

    if (signInError || !authData.session) {
      throw signInError || new Error("Não foi possível abrir a sessão interna");
    }

    return json({
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
      brokerSession: {
        accessToken: brokerData.access_token,
        wsToken: brokerData.ws_token,
        userId: brokerData.id,
        login: brokerData.login,
        name: brokerData.name,
        credit: brokerData.credit,
        creditCents: brokerData.credit_cents,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno no login";
    return json({ error: message });
  }
});
