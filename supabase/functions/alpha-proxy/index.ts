import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-alpha-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALPHA_BASE = "https://www.alphainvestbot.com/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // The path after /alpha-proxy/ is the API route
    // e.g. /alpha-proxy/symbols → /api/symbols
    const pathParts = url.pathname.split("/alpha-proxy");
    const apiPath = pathParts.length > 1 ? pathParts[1] : "";
    const queryString = url.search;
    const targetUrl = `${ALPHA_BASE}${apiPath}${queryString}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward auth token if present
    const alphaToken = req.headers.get("x-alpha-token");
    if (alphaToken) {
      headers["Authorization"] = `Bearer ${alphaToken}`;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        const body = await req.text();
        if (body) fetchOptions.body = body;
      } catch {}
    }

    const res = await fetch(targetUrl, fetchOptions);
    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: {
        ...corsHeaders,
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Alpha proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
