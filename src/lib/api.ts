const API_BASE = "https://www.alphainvestbot.com/api";

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
}

export const alphaApi = new AlphaApi();
