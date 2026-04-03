import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { symbol, price, variation, payout, isTrading, direction, model } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY)
      throw new Error("LOVABLE_API_KEY is not configured");

    const modelMap: Record<string, string> = {
      gpt: "openai/gpt-5-mini",
      claude: "google/gemini-2.5-pro",
      grok: "google/gemini-3-flash-preview",
    };
    const aiModel = modelMap[model] || model || "google/gemini-3-flash-preview";

    const systemPrompt = `Você é um analista de mercado financeiro especializado em opções binárias e criptomoedas.
Seu papel é gerar análises curtas e incisivas sobre o ativo que o trader está observando.
Regras:
- Responda SEMPRE em português do Brasil
- Máximo 2 frases curtas (até 120 caracteres total)
- Use linguagem de trader profissional
- Varie entre: análise técnica, sentimento de mercado, dicas de timing, comentários sobre volatilidade, momentum
- Nunca repita a mesma análise
- Seja direto e confiante
- Use emojis relevantes (📊📈📉🔥⚡💡🎯)
- Se o bot estiver operando, comente sobre a entrada/direção
- Não dê conselhos financeiros explícitos, apenas observações de mercado`;

    const userContext = `Ativo: ${symbol}
Preço atual: ${price}
Variação diária: ${variation}%
Payout: ${payout}%
${isTrading ? `Bot operando - Direção: ${direction}` : "Bot parado - apenas observando"}

Gere UMA análise curta sobre o momento atual deste ativo.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContext },
          ],
          ...(aiModel.startsWith("openai/") ? { max_completion_tokens: 100 } : { max_tokens: 100 }),
          temperature: 0.9,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit - tente novamente em breve" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ analysis, model: aiModel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analysis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
