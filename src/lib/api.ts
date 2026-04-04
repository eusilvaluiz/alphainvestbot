import { supabase } from "@/integrations/supabase/client";

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
  direction: number;
  amount: string;
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
  direction: string;
  transaction_type: string;
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
  result_type: number;
  user_credit: string;
  transaction_account: number;
}

export interface TransactionResponse {
  date: string;
  status: string;
  transaction: {
    id: number;
    date: string;
    status: string;
    status_id: number;
    direction: number;
    symbol: string;
    symbol_price: string;
    amount: string;
    amount_cents: number;
    amount_percent: number;
    returns: string;
    returns_cents: number;
    profit_cents: number;
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

interface UnicSession {
  cookies: string;
  xsrf: string;
  accountId: number | null;
}

class AlphaApi {
  private session: UserSession | null = null;
  private unicSession: UnicSession | null = null;

  private getBrokerCredentials(): { user: string; pass: string } | null {
    const stored = localStorage.getItem("broker_credentials");
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  private async callUnicTrading(action: string, extra: Record<string, any> = {}): Promise<any> {
    const creds = this.getBrokerCredentials();

    const body: Record<string, any> = {
      action,
      ...extra,
    };

    // Include session for reuse
    if (this.unicSession) {
      body.session_cookies = this.unicSession.cookies;
      body.session_xsrf = this.unicSession.xsrf;
      body.session_account_id = this.unicSession.accountId;
    }

    // Include credentials for re-login if session expired
    if (creds) {
      body.broker_user = creds.user;
      body.broker_pass = creds.pass;
    }

    const { data, error } = await supabase.functions.invoke("unic-trading", {
      body,
    });

    if (error) throw new Error(error.message || "Erro na chamada da API");
    if (data?.error) throw new Error(data.error);

    // Cache session for reuse
    if (data?._session) {
      this.unicSession = data._session;
      delete data._session;
    }

    return data;
  }

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
    // Store credentials for future API calls
    localStorage.setItem("broker_credentials", JSON.stringify({ user, pass }));

    const data = await this.callUnicTrading("login", {
      broker_user: user,
      broker_pass: pass,
    });

    if (data.status !== "success") {
      throw new Error("Credenciais inválidas");
    }

    this.session = {
      accessToken: "unic_session",
      wsToken: "",
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
    this.unicSession = null;
    localStorage.removeItem("alpha_session");
  }

  async getSymbols(): Promise<Symbol[]> {
    // Symbols requires authentication on UnicBroker
    const creds = this.getBrokerCredentials();
    if (!creds && !this.unicSession) return [];

    const data = await this.callUnicTrading("symbols");
    return data.symbols || [];
  }

  async getHistoricalData(symbol: string): Promise<CandleData[]> {
    const data = await this.callUnicTrading("historical-data", { symbol });
    return data.data || [];
  }

  async openPosition(req: OpenPositionRequest): Promise<OpenPositionResponse> {
    const data = await this.callUnicTrading("open-position", {
      symbol: req.symbol,
      direction: req.direction,
      amount: req.amount,
      price: req.price,
    });
    if (data.status !== "success") {
      throw new Error(data.message || "Erro ao abrir posição");
    }
    return data;
  }

  async getSettlement(): Promise<SettlementResponse> {
    return await this.callUnicTrading("settlement");
  }

  async getTransaction(id: number): Promise<TransactionResponse> {
    return await this.callUnicTrading("transaction", { transaction_id: id });
  }

  async getBalance(): Promise<BalanceResponse> {
    return await this.callUnicTrading("balance");
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
