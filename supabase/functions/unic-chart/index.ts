import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIC_BASE = "https://unicbroker.com";

// Cache session cookies per broker user
const sessionCache = new Map<string, { cookies: string; expires: number }>();

async function getUnicSession(brokerUser: string, brokerPass: string): Promise<string | null> {
  const cached = sessionCache.get(brokerUser);
  if (cached && cached.expires > Date.now()) {
    return cached.cookies;
  }

  try {
    // Step 1: Get CSRF token and session cookie
    const initRes = await fetch(`${UNIC_BASE}/login`, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });

    const setCookieHeaders = initRes.headers.getSetCookie?.() || [];
    let cookies = setCookieHeaders
      .map((c: string) => c.split(";")[0])
      .join("; ");

    // Extract XSRF token from cookies
    const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
    if (!xsrfMatch) {
      console.error("No XSRF token found");
      return null;
    }
    const xsrfToken = decodeURIComponent(xsrfMatch[1]);

    // Step 2: Login
    const loginRes = await fetch(`${UNIC_BASE}/publicapi/auth/login/web`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": xsrfToken,
        Cookie: cookies,
        Referer: `${UNIC_BASE}/login`,
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({ login: brokerUser, password: brokerPass }),
      redirect: "follow",
    });

    // Merge new cookies from login response
    const loginCookies = loginRes.headers.getSetCookie?.() || [];
    const cookieMap = new Map<string, string>();
    
    // Parse existing cookies
    cookies.split("; ").forEach((c: string) => {
      const [key] = c.split("=");
      if (key) cookieMap.set(key, c);
    });
    
    // Override with new cookies
    loginCookies.forEach((c: string) => {
      const cookiePart = c.split(";")[0];
      const [key] = cookiePart.split("=");
      if (key) cookieMap.set(key, cookiePart);
    });

    const finalCookies = Array.from(cookieMap.values()).join("; ");

    const loginData = await loginRes.json().catch(() => null);
    if (!loginData || loginRes.status !== 200) {
      console.error("Login failed:", loginRes.status, loginData);
      return null;
    }

    // Cache for 30 minutes
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
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol") || "BTCUSDT";
    const resolution = url.searchParams.get("resolution") || "1";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const countback = url.searchParams.get("countback") || "300";

    // Get broker credentials from request
    const brokerUser = url.searchParams.get("broker_user");
    const brokerPass = url.searchParams.get("broker_pass");

    if (!brokerUser || !brokerPass) {
      return new Response(
        JSON.stringify({ error: "Missing broker credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get authenticated session
    const cookies = await getUnicSession(brokerUser, brokerPass);
    if (!cookies) {
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with broker" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch UDF data
    const now = Math.floor(Date.now() / 1000);
    const udfUrl = `${UNIC_BASE}/publicapi/tradingview/udf-history?symbol=${symbol}&resolution=${resolution}&from=${from || (now - 300 * 60)}&to=${to || now}&countback=${countback}&site=unicbroker.com`;

    const udfRes = await fetch(udfUrl, {
      headers: {
        Cookie: cookies,
        Referer: `${UNIC_BASE}/traderoom`,
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!udfRes.ok) {
      // Invalidate cache on auth failure
      if (udfRes.status === 401) {
        sessionCache.delete(brokerUser);
      }
      const errText = await udfRes.text();
      console.error("UDF fetch failed:", udfRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch chart data", status: udfRes.status }),
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
