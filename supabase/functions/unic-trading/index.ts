import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-alpha-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIC_BASE = "https://unicbroker.com";

interface SessionData {
  cookies: string;
  xsrf: string;
  accountId: number | null;
}

/** Perform full cookie-based login to UnicBroker and return session cookies */
async function doLogin(brokerUser: string, brokerPass: string): Promise<SessionData | null> {
  try {
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
      console.error("No XSRF-TOKEN cookie found");
      return null;
    }
    const xsrfToken = decodeURIComponent(xsrfCookie.split("=").slice(1).join("="));
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
      body: JSON.stringify({ user: brokerUser, pass: brokerPass }),
      redirect: "manual",
    });

    const loginBody = await loginRes.text();
    if (loginBody.includes('"error"') || loginBody.includes("não conferem")) {
      console.error("Login failed:", loginBody.substring(0, 200));
      return null;
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

    // Step 3: Visit traderoom to establish full session
    const trCookies = Array.from(cookieMap.values()).join("; ");
    const trRes = await fetch(`${UNIC_BASE}/traderoom`, {
      headers: {
        Cookie: trCookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    const trHtml = await trRes.text();

    // Extract account ID from the traderoom page
    let accountId: number | null = null;
    const accountMatch = trHtml.match(/"selected_account"\s*:\s*(\d+)/);
    if (accountMatch) {
      accountId = parseInt(accountMatch[1]);
    }
    // Also try the accounts data
    if (!accountId) {
      const accMatch = trHtml.match(/"id"\s*:\s*(\d+)\s*,\s*"amount"/);
      if (accMatch) accountId = parseInt(accMatch[1]);
    }

    // Merge traderoom cookies
    const trSetCookies = (trRes.headers as any).getSetCookie?.() as string[] | undefined;
    if (trSetCookies) {
      for (const c of trSetCookies) {
        const cookiePart = c.split(";")[0];
        const eqIdx = cookiePart.indexOf("=");
        if (eqIdx > 0) cookieMap.set(cookiePart.substring(0, eqIdx), cookiePart);
      }
    }

    const finalCookies = Array.from(cookieMap.values()).join("; ");
    const newXsrf = cookieMap.get("XSRF-TOKEN");
    const finalXsrf = newXsrf ? decodeURIComponent(newXsrf.split("=").slice(1).join("=")) : xsrfToken;

    return { cookies: finalCookies, xsrf: finalXsrf, accountId };
  } catch (error) {
    console.error("Login error:", error);
    return null;
  }
}

function makeHeaders(session: SessionData): Record<string, string> {
  return {
    Cookie: session.cookies,
    "X-XSRF-TOKEN": session.xsrf,
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/json",
    Referer: `${UNIC_BASE}/traderoom`,
  };
}

// Extract CSRF token from cookies (for POST requests)
function getCsrfFromCookies(cookies: string): string {
  const match = cookies.match(/XSRF-TOKEN=([^;]+)/);
  if (!match) return "";
  return decodeURIComponent(match[1]);
}

/** GET /symbols — List available trading symbols */
async function handleSymbols(session: SessionData) {
  const res = await fetch(`${UNIC_BASE}/publicapi/traderoom/symbols/get`, {
    headers: makeHeaders(session),
  });
  const data = await res.json();

  if (data.status !== "success" || !data.symbols) {
    console.error("Symbols response:", JSON.stringify(data).substring(0, 500));
    return { status: "error", symbols: [] };
  }

  // symbols may be an array or an object keyed by id
  const symbolsList = Array.isArray(data.symbols)
    ? data.symbols
    : Object.values(data.symbols);

  // Transform to match the expected format
  const symbols = symbolsList.map((s: any) => ({
    id: s.id,
    code: s.code,
    type: s.type,
    name: s.name,
    status: s.status ?? 1,
    is_otc: s.is_otc ?? 0,
    is_market_open: s.is_market_open ?? 1,
    img: s.img,
    last_price: s.last_price ?? "0",
    first_price_day: s.first_price_day ?? "0",
    open_hour: s.open_hour ?? "00:00:00",
    close_hour: s.close_hour ?? "23:59:59",
    blocked_weekend: s.blocked_weekend ?? 0,
    daily_percent_variation: s.daily_percent_variation ?? 0,
    payout: s.odd ?? s.payout ?? 0,
  }));

  return { status: "success", symbols };
}

/** GET /historical-data — Candle data via TradingView UDF */
async function handleHistoricalData(session: SessionData, symbol: string) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 300 * 60;
  const udfUrl = `${UNIC_BASE}/publicapi/tradingview/udf-history?symbol=${symbol}&resolution=1&from=${from}&to=${now}&countback=300&site=unicbroker.com`;

  const res = await fetch(udfUrl, {
    headers: makeHeaders(session),
  });

  const data = await res.json();

  if (data.s !== "ok" || !data.t) {
    return { status: "error", data: [] };
  }

  // Transform UDF format to candle format
  const candles = data.t.map((t: number, i: number) => ({
    candle_id: t,
    open_time: t,
    open: String(data.o[i]),
    higher: String(data.h[i]),
    lower: String(data.l[i]),
    close: String(data.c[i]),
    volume: data.v?.[i] ?? 0,
  }));

  return { status: "success", data: candles };
}

/** POST /login — Authenticate and return session info */
async function handleLogin(session: SessionData) {
  // Get user credits
  const creditsRes = await fetch(`${UNIC_BASE}/publicapi/users/get-credits`, {
    headers: makeHeaders(session),
  });
  const credits = await creditsRes.json();

  // Parse credit info
  const creditStr = credits.credit ?? credits.amount ?? "0";
  const creditCents = credits.credit_cents ?? credits.amount_cents ?? Math.round(parseFloat(String(creditStr).replace(/\./g, "").replace(",", ".")) * 100);

  return {
    status: "success",
    access_token: "unic_session", // Placeholder - we use cookies internally
    ws_token: "",
    id: credits.id ?? 0,
    login: credits.login ?? credits.user ?? "",
    name: credits.name ?? credits.login ?? "",
    type: 1,
    credit: creditStr,
    credit_cents: creditCents,
    // Include session data so client can pass it back
    _session: {
      cookies: session.cookies,
      xsrf: session.xsrf,
      accountId: session.accountId,
    },
  };
}

/** POST /open-position — Open a trading position */
async function handleOpenPosition(
  session: SessionData,
  symbol: string,
  direction: number,
  amount: string,
  price: number
) {
  // Convert amount from "766,00" format to cents
  const amountCents = Math.round(
    parseFloat(amount.replace(/\./g, "").replace(",", ".")) * 100
  );

  const postHeaders = {
    ...makeHeaders(session),
    "Content-Type": "application/json",
  };

  const res = await fetch(`${UNIC_BASE}/publicapi/binary/transaction`, {
    method: "POST",
    headers: postHeaders,
    body: JSON.stringify({
      __token: getCsrfFromCookies(session.cookies),
      amount: amountCents,
      direction: direction, // 1 = up, 0 = down
      expiration: 1, // 1 minute
      symbol: symbol,
      symbol_price: price,
      selected_account: session.accountId,
    }),
  });

  const data = await res.json();

  if (data.status !== "success") {
    throw new Error(data.msg || "Erro ao abrir posição");
  }

  return {
    status: "success",
    method: "binary",
    user_id: data.user_id ?? 0,
    transaction_account: data.transaction_account ?? session.accountId,
    transaction_id: data.transaction_id,
    amount: data.amount ?? amount,
    amount_cents: data.amount_cents ?? amountCents,
    odd: data.odd ?? 0,
    date: data.date ?? new Date().toISOString(),
    datetime: data.datetime ?? new Date().toISOString(),
    symbol: data.symbol ?? symbol,
    symbol_price: data.symbol_price ?? price,
    symbol_img: data.symbol_img ?? "",
    direction: direction === 1 ? "up" : "down",
    transaction_type: direction === 1 ? "buy" : "sell",
    expiration_date: data.expiration_date ?? "",
    expiration_datetime: data.expiration_datetime ?? "",
    expiration_timestamp: data.expiration_timestamp ?? Math.floor(Date.now() / 1000) + 60,
    expiration: data.expiration ?? "1",
    expiration_seconds: data.expiration_seconds ?? 60,
    user_credit: data.user_credit ?? "0",
    user_bonus: data.user_bonus ?? "0",
    user_freebet: data.user_freebet ?? "0",
    user_credit_total: data.user_credit_total ?? "0",
  };
}

/** GET /settlement — Check trade result */
async function handleSettlement(session: SessionData) {
  const accountId = session.accountId;
  const res = await fetch(
    `${UNIC_BASE}/binary/transactions/settlement?account_id=${accountId}`,
    { headers: makeHeaders(session) }
  );

  const data = await res.json();

  return {
    status: data.status ?? "success",
    img: data.img ?? "",
    updated: data.updated ?? 0,
    amount_result: data.amount_result ?? "0",
    currency_code: data.currency_code ?? "BRL",
    amount_result_cents: data.amount_result_cents ?? 0,
    result_type: data.result_type ?? 0,
    user_credit: data.user_credit ?? "0",
    transaction_account: data.transaction_account ?? accountId,
  };
}

/** GET /transaction/{id} — Get transaction details */
async function handleTransaction(session: SessionData, transactionId: number) {
  // Use history endpoint or refresh to get transaction status
  const res = await fetch(`${UNIC_BASE}/binary/history/1`, {
    headers: makeHeaders(session),
  });

  const data = await res.json();

  // Find the specific transaction
  let transaction = null;
  const txList = data.transactions?.data || data.data || [];
  for (const tx of txList) {
    if (tx.id === transactionId) {
      transaction = tx;
      break;
    }
  }

  if (!transaction) {
    // Return a pending status if not found yet
    return {
      date: new Date().toISOString(),
      status: "pending",
      transaction: {
        id: transactionId,
        date: new Date().toISOString(),
        status: "Pendente",
        status_id: 0,
        direction: 0,
        symbol: "",
        symbol_price: "0",
        amount: "0",
        amount_cents: 0,
        amount_percent: 0,
        returns: "0",
        returns_cents: 0,
        expiration: 0,
        expiration_date: "",
        notes: "",
        user: { id: 0, login: "", balance: "0", balance_cents: 0 },
      },
    };
  }

  // Map UnicBroker status to expected format
  const statusId = transaction.status_id ?? (transaction.status === "Ganhou" ? 2 : transaction.status === "Perdeu" ? 1 : 0);

  return {
    date: transaction.date ?? new Date().toISOString(),
    status: "success",
    transaction: {
      id: transaction.id,
      date: transaction.date ?? "",
      status: statusId === 2 ? "Ganhou" : statusId === 1 ? "Perdeu" : "Pendente",
      status_id: statusId,
      direction: transaction.direction ?? 0,
      symbol: transaction.symbol ?? "",
      symbol_price: String(transaction.symbol_price ?? transaction.price ?? "0"),
      amount: transaction.amount ?? "0",
      amount_cents: transaction.amount_cents ?? 0,
      amount_percent: transaction.amount_percent ?? 0,
      returns: transaction.returns ?? "0",
      returns_cents: transaction.returns_cents ?? 0,
      expiration: transaction.expiration ?? 0,
      expiration_date: transaction.expiration_date ?? "",
      notes: transaction.notes ?? "",
      user: {
        id: transaction.user?.id ?? 0,
        login: transaction.user?.login ?? "",
        balance: transaction.user?.balance ?? "0",
        balance_cents: transaction.user?.balance_cents ?? 0,
      },
    },
  };
}

/** GET /balance — Get user balance */
async function handleBalance(session: SessionData) {
  const accountId = session.accountId;

  // Try refresh account first (more reliable for current balance)
  const res = await fetch(
    `${UNIC_BASE}/binary/accounts/refresh/${accountId}`,
    { headers: makeHeaders(session) }
  );
  const data = await res.json();

  // Also get credits
  const creditsRes = await fetch(`${UNIC_BASE}/publicapi/users/get-credits`, {
    headers: makeHeaders(session),
  });
  const credits = await creditsRes.json();

  const amount = data.amount ?? credits.credit ?? "0";
  const amountFloat = parseFloat(String(amount).replace(/\./g, "").replace(",", "."));
  const amountCents = Math.round(amountFloat * 100);

  return {
    id: credits.id ?? 0,
    login: credits.login ?? "",
    credit: String(amount),
    credit_cents: isNaN(amountCents) ? 0 : amountCents,
    freebet: credits.freebet ?? "0",
    freebet_cents: credits.freebet_cents ?? 0,
    bonus: credits.bonus ?? "0",
    bonus_cents: credits.bonus_cents ?? 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      action,
      broker_user,
      broker_pass,
      session_cookies,
      session_xsrf,
      session_account_id,
      // Action-specific params
      symbol,
      direction,
      amount,
      price,
      transaction_id,
    } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing action parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to reuse existing session or login fresh
    let session: SessionData | null = null;

    if (session_cookies && session_xsrf) {
      session = {
        cookies: session_cookies,
        xsrf: session_xsrf,
        accountId: session_account_id ?? null,
      };

      // Validate session with a quick check
      try {
        const testRes = await fetch(`${UNIC_BASE}/publicapi/users/get-credits`, {
          headers: makeHeaders(session),
        });
        const testData = await testRes.json();
        if (testData.status === "error" || testRes.status === 401) {
          console.log("Session expired, will re-login");
          session = null;
        }
      } catch {
        session = null;
      }
    }

    if (!session) {
      if (!broker_user || !broker_pass) {
        return new Response(
          JSON.stringify({ error: "Missing broker credentials" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      session = await doLogin(broker_user, broker_pass);
      if (!session) {
        return new Response(
          JSON.stringify({ error: "Failed to authenticate with broker" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let result: any;

    switch (action) {
      case "symbols":
        result = await handleSymbols(session);
        break;
      case "historical-data":
        result = await handleHistoricalData(session, symbol || "BTCUSDT");
        break;
      case "login":
        result = await handleLogin(session);
        break;
      case "open-position":
        result = await handleOpenPosition(session, symbol, direction, amount, price);
        break;
      case "settlement":
        result = await handleSettlement(session);
        break;
      case "transaction":
        result = await handleTransaction(session, transaction_id);
        break;
      case "balance":
        result = await handleBalance(session);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Include session info for client-side caching
    result._session = {
      cookies: session.cookies,
      xsrf: session.xsrf,
      accountId: session.accountId,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("unic-trading error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
