---
name: Trading API endpoints
description: Full API structure — all calls go directly to UnicBroker via unic-trading edge function
type: feature
---

## Architecture
All API calls go through `unic-trading` edge function → UnicBroker (unicbroker.com) directly.
No dependency on alphainvestbot.com.

## Edge Function: unic-trading
Single edge function handles all actions via POST body `{action: "...", ...params}`.
Session cookies are cached client-side and reused. Re-login happens automatically if session expires.

### Actions
- `symbols` → GET /publicapi/traderoom/symbols/get
- `historical-data` → GET /publicapi/tradingview/udf-history
- `login` → POST /publicapi/auth/login/web + GET /publicapi/users/get-credits
- `open-position` → POST /publicapi/binary/transaction {amount (cents), direction, expiration, symbol, symbol_price, selected_account}
- `settlement` → GET /binary/transactions/settlement?account_id=X
- `transaction` → GET /binary/history/1 (find by ID)
- `balance` → GET /binary/accounts/refresh/{account_id} + GET /publicapi/users/get-credits

## UnicBroker Auth
Cookie-based (XSRF + Laravel session). Login flow:
1. GET /login → get XSRF-TOKEN cookie
2. POST /publicapi/auth/login/web → authenticate
3. GET /traderoom → establish session, get account_id

## Client (src/lib/api.ts)
Uses `supabase.functions.invoke("unic-trading", {body})` for all calls.
Caches UnicBroker session (cookies, xsrf, accountId) in memory.
Broker credentials stored in localStorage for auto-relogin.
