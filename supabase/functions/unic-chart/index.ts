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
    const {
      symbol = "BTCUSDT",
      resolution = "1",
      countback = 300,
      broker_token,
    } = body;

    if (!broker_token) {
      return new Response(
        JSON.stringify({ error: "Missing broker token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - countback * 60;
    const udfUrl = `${UNIC_BASE}/publicapi/tradingview/udf-history?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&countback=${countback}&site=unicbroker.com`;

    // Try Bearer token auth
    const udfRes = await fetch(udfUrl, {
      headers: {
        Authorization: `Bearer ${broker_token}`,
        Referer: `${UNIC_BASE}/traderoom`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    console.log("UDF response status:", udfRes.status);

    if (!udfRes.ok) {
      const errText = await udfRes.text();
      console.error("UDF fetch failed:", udfRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch chart data", detail: errText }),
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
