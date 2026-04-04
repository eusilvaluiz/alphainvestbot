const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const IS_DEV = import.meta.env.DEV;

// In dev, use Vite proxy; in production, use edge function
const API_BASE = IS_DEV ? "/alpha-api" : `${SUPABASE_URL}/functions/v1/alpha-proxy`;

export interface Symbol {
  id: number;
  code: string;
  type: string;
  name: string;
  status: number;
  is_otc: number;
  is_market_open: number;
  img: string;
  last_price: string;
  first_price_day: string;
  open_hour: string;
  close_hour: string;
  blocked_weekend: number;
  daily_percent_variation: number;
  payout: number;
}

export interface CandleData {
  candle_id: number;
  open_time: number;
  open: string;
  higher: string;
  lower: string;
  close: string;
  volume: number;
}

export interface LoginResponse {
  status: string;
  access_token: string;
  ws_token: string;
  id: number;
  login: string;
  name: string;
  type: number;
  credit: string;
  credit_cents: number;
  last_login: string;
}

export interface UserSession {
  accessToken: string;
  wsToken: string;
  userId: number;
  login: string;
  name: string;
  credit: string;
  creditCents: number;
}

export interface OpenPositionRequest {
  symbol: string;
  direction: number; // 0 = down/sell, 1 = up/buy
  amount: string; // formatted like "766,00"
  price: number;
}

export interface OpenPositionResponse {
  status: string;
  method: string;
  user_id: number;
  transaction_account: number;
  transaction_id: number;
  amount: string;
  amount_cents: number;
  odd: number;
  date: string;
  datetime: string;
  symbol: string;
  symbol_price: number;
  symbol_img: string;
  direction: string; // "up" or "down"
  transaction_type: string; // "buy" or "sell"
  expiration_date: string;
  expiration_datetime: string;
  expiration_timestamp: number;
  expiration: string;
  expiration_seconds: number;
  user_credit: string;
  user_bonus: string;
  user_freebet: string;
  user_credit_total: string;
}

export interface SettlementResponse {
  status: string;
  img: string;
  updated: number;
  amount_result: string;
  currency_code: string;
  amount_result_cents: number;
  result_type: number; // 2 = win, 1 = loss
  user_credit: string;
  transaction_account: number;
}

export interface TransactionResponse {
  date: string;
  status: string;
  transaction: {
    id: number;
    date: string;
    status: string; // "Ganhou" or "Perdeu"
    status_id: number; // 2 = win, 1 = loss
    direction: number;
    symbol: string;
    symbol_price: string;
    amount: string;
    amount_cents: number;
    amount_percent: number;
    returns: string;
    returns_cents: number;
    expiration: number;
    expiration_date: string;
    notes: string;
    user: {
      id: number;
      login: string;
      balance: string;
      balance_cents: number;
    };
  };
}

export interface BalanceResponse {
  id: number;
  login: string;
  credit: string;
  credit_cents: number;
  freebet: string;
  freebet_cents: number;
  bonus: string;
  bonus_cents: number;
}

class AlphaApi {
  private session: UserSession | null = null;

  getSession(): UserSession | null {
    if (!this.session) {
      const stored = localStorage.getItem("alpha_session");
      if (stored) {
        this.session = JSON.parse(stored);
      }
    }
    return this.session;
  }

  private getAuthHeaders(): Record<string, string> {
    const session = this.getSession();
    if (!session) throw new Error("Not authenticated");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    };
  }

  isLoggedIn(): boolean {
    return this.getSession() !== null;
  }

  async login(user: string, pass: string): Promise<UserSession> {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, pass }),
    });

    const data: LoginResponse = await res.json();

    if (data.status !== "success" || !data.access_token) {
      throw new Error("Credenciais inválidas");
    }

    this.session = {
      accessToken: data.access_token,
      wsToken: data.ws_token,
      userId: data.id,
      login: data.login,
      name: data.name,
      credit: data.credit,
      creditCents: data.credit_cents,
    };

    localStorage.setItem("alpha_session", JSON.stringify(this.session));
    return this.session;
  }

  restoreSession(session: UserSession): void {
    this.session = session;
    localStorage.setItem("alpha_session", JSON.stringify(this.session));
  }

  logout(): void {
    this.session = null;
    localStorage.removeItem("alpha_session");
  }

  async getSymbols(): Promise<Symbol[]> {
    const res = await fetch(`${API_BASE}/symbols`);
    const data = await res.json();
    return data.symbols || [];
  }

  async getHistoricalData(symbol: string): Promise<CandleData[]> {
    const res = await fetch(`${API_BASE}/historical-data?symbol=${symbol}`);
    const data = await res.json();
    return data.data || [];
  }

  async openPosition(req: OpenPositionRequest): Promise<OpenPositionResponse> {
    const res = await fetch(`${API_BASE}/open-position`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(req),
    });
    const data = await res.json();
    if (data.status !== "success") {
      throw new Error(data.message || "Erro ao abrir posição");
    }
    return data;
  }

  async getSettlement(): Promise<SettlementResponse> {
    const res = await fetch(`${API_BASE}/settlement`, {
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  async getTransaction(id: number): Promise<TransactionResponse> {
    const res = await fetch(`${API_BASE}/transaction/${id}`, {
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  async getBalance(): Promise<BalanceResponse> {
    const res = await fetch(`${API_BASE}/balance`, {
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  updateSessionCredit(credit: string, creditCents: number) {
    if (this.session) {
      this.session.credit = credit;
      this.session.creditCents = creditCents;
      localStorage.setItem("alpha_session", JSON.stringify(this.session));
    }
  }
}

export const alphaApi = new AlphaApi();
