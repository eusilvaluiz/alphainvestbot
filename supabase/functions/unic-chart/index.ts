import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIC_BASE = "https://unicbroker.com";

const sessionCache = new Map<string, { cookies: string; expires: number }>();

async function getUnicSession(brokerUser: string, brokerPass: string): Promise<string | null> {
  const cached = sessionCache.get(brokerUser);
  if (cached && cached.expires > Date.now()) {
    return cached.cookies;
  }

  try {
    // Step 1: Get CSRF token from login page
    const initRes = await fetch(`${UNIC_BASE}/login`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    const cookieMap = new Map<string, string>();
    const allCookies = (initRes.headers as any).getSetCookie?.() as string[] | undefined;
    if (allCookies) {
      for (const c of allCookies) {
        const cookiePart = c.split(";")[0];
        const eqIdx = cookiePart.indexOf("=");
        if (eqIdx > 0) {
          cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
        }
      }
    }

    const xsrfCookie = cookieMap.get("XSRF-TOKEN");
    if (!xsrfCookie) {
      console.error("No XSRF-TOKEN cookie found");
      return null;
    }
    const xsrfValue = xsrfCookie.split("=").slice(1).join("=");
    const xsrfToken = decodeURIComponent(xsrfValue);

    const cookies = Array.from(cookieMap.values()).join("; ");

    // Step 2: Login - try with 'login' field instead of 'email'
    const loginRes = await fetch(`${UNIC_BASE}/publicapi/auth/login/web`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": xsrfToken,
        Cookie: cookies,
        Referer: `${UNIC_BASE}/login`,
        Origin: UNIC_BASE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      body: JSON.stringify({ login: brokerUser, password: brokerPass }),
      redirect: "manual",
    });

    const loginBody = await loginRes.text();
    console.log("Login attempt with 'login' field:", loginRes.status, loginBody.substring(0, 300));

    // If 'login' field didn't work, try 'email'
    if (loginBody.includes("error") || loginBody.includes("não conferem")) {
      const loginRes2 = await fetch(`${UNIC_BASE}/publicapi/auth/login/web`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": xsrfToken,
          Cookie: cookies,
          Referer: `${UNIC_BASE}/login`,
          Origin: UNIC_BASE,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: brokerUser, password: brokerPass }),
        redirect: "manual",
      });
      const loginBody2 = await loginRes2.text();
      console.log("Login attempt with 'email' field:", loginRes2.status, loginBody2.substring(0, 300));

      // Try 'user' field
      const loginRes3 = await fetch(`${UNIC_BASE}/publicapi/auth/login/web`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": xsrfToken,
          Cookie: cookies,
          Referer: `${UNIC_BASE}/login`,
          Origin: UNIC_BASE,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        body: JSON.stringify({ user: brokerUser, password: brokerPass }),
        redirect: "manual",
      });
      const loginBody3 = await loginRes3.text();
      console.log("Login attempt with 'user' field:", loginRes3.status, loginBody3.substring(0, 300));
    }

    // Merge login cookies
    const loginCookies = (loginRes.headers as any).getSetCookie?.() as string[] | undefined;
    if (loginCookies) {
      for (const c of loginCookies) {
        const cookiePart = c.split(";")[0];
        const eqIdx = cookiePart.indexOf("=");
        if (eqIdx > 0) {
          cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
        }
      }
    }

    const finalCookies = Array.from(cookieMap.values()).join("; ");

    if (loginRes.status !== 200 && loginRes.status !== 302) {
      return null;
    }

    if (loginBody.includes("error")) {
      return null;
    }

    sessionCache.set(brokerUser, {
      cookies: finalCookies,
      expires: Date.now() + 30 * 60 * 1000,
    });

    return finalCookies;
  } catch (error) {
    console.error("Session error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      symbol = "BTCUSDT",
      resolution = "1",
      countback = 300,
      broker_user,
      broker_pass,
    } = body;

    if (!broker_user || !broker_pass) {
      return new Response(
        JSON.stringify({ error: "Missing broker credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cookies = await getUnicSession(broker_user, broker_pass);
    if (!cookies) {
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with broker" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - countback * 60;
    const udfUrl = `${UNIC_BASE}/publicapi/tradingview/udf-history?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&countback=${countback}&site=unicbroker.com`;

    const udfRes = await fetch(udfUrl, {
      headers: {
        Cookie: cookies,
        Referer: `${UNIC_BASE}/traderoom`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!udfRes.ok) {
      if (udfRes.status === 401) sessionCache.delete(broker_user);
      const errText = await udfRes.text();
      console.error("UDF fetch failed:", udfRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch chart data" }),
        { status: udfRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await udfRes.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("UDF proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
