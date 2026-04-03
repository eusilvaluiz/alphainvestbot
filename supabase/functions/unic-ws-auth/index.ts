import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIC_BASE = "https://unicbroker.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { broker_user, broker_pass } = body;

    if (!broker_user || !broker_pass) {
      return new Response(
        JSON.stringify({ error: "Missing broker credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Get XSRF token
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
        if (eqIdx > 0) cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
      }
    }

    const xsrfCookie = cookieMap.get("XSRF-TOKEN");
    if (!xsrfCookie) {
      return new Response(
        JSON.stringify({ error: "Failed to get XSRF token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const xsrfValue = xsrfCookie.split("=").slice(1).join("=");
    const xsrfToken = decodeURIComponent(xsrfValue);
    const cookies = Array.from(cookieMap.values()).join("; ");

    // Step 2: Login
    const loginRes = await fetch(`${UNIC_BASE}/publicapi/auth/login/web`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": xsrfToken,
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookies,
        Referer: `${UNIC_BASE}/login`,
        Origin: UNIC_BASE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      body: JSON.stringify({ user: broker_user, pass: broker_pass }),
      redirect: "manual",
    });

    const loginBody = await loginRes.text();
    if (loginBody.includes('"error"') || loginBody.includes("não conferem")) {
      return new Response(
        JSON.stringify({ error: "Login failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge login cookies
    const loginCookies = (loginRes.headers as any).getSetCookie?.() as string[] | undefined;
    if (loginCookies) {
      for (const c of loginCookies) {
        const cookiePart = c.split(";")[0];
        const eqIdx = cookiePart.indexOf("=");
        if (eqIdx > 0) cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
      }
    }

    // Step 3: Visit traderoom to establish session
    const traderoomCookies = Array.from(cookieMap.values()).join("; ");
    const trRes = await fetch(`${UNIC_BASE}/traderoom`, {
      headers: {
        Cookie: traderoomCookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    await trRes.text(); // consume body

    // Merge traderoom cookies
    const trCookies = (trRes.headers as any).getSetCookie?.() as string[] | undefined;
    if (trCookies) {
      for (const c of trCookies) {
        const cookiePart = c.split(";")[0];
        const eqIdx = cookiePart.indexOf("=");
        if (eqIdx > 0) cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
      }
    }

    // Step 4: Get Ably token from ws/auth
    const finalCookies = Array.from(cookieMap.values()).join("; ");
    const newXsrf = cookieMap.get("XSRF-TOKEN");
    const newXsrfToken = newXsrf ? decodeURIComponent(newXsrf.split("=").slice(1).join("=")) : xsrfToken;

    const wsAuthRes = await fetch(`${UNIC_BASE}/publicapi/ws/auth`, {
      headers: {
        Cookie: finalCookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": newXsrfToken,
        Referer: `${UNIC_BASE}/traderoom`,
      },
    });

    if (!wsAuthRes.ok) {
      const errText = await wsAuthRes.text();
      console.error("ws/auth failed:", wsAuthRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to get Ably token" }),
        { status: wsAuthRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ablyToken = await wsAuthRes.json();
    return new Response(JSON.stringify(ablyToken), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("unic-ws-auth error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
