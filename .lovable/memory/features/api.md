---
name: Trading API endpoints
description: Full API structure for Alpha Bot trading platform
type: feature
---

## Endpoints (all via /alpha-api proxy → alphainvestbot.com/api)

### Public
- `GET /symbols` → {symbols: Symbol[]}
- `GET /historical-data?symbol=X` → {data: CandleData[]}

### Authenticated (Bearer token)
- `POST /login` {user, pass} → {access_token, ws_token, credit, credit_cents, ...}
- `POST /open-position` {symbol, direction (0=down, 1=up), amount ("766,00"), price} → {transaction_id, expiration_timestamp, expiration_seconds, user_credit, direction ("up"/"down"), ...}
- `GET /settlement` → {result_type (2=win, 1=loss), amount_result_cents, user_credit}
- `GET /transaction/{id}` → {transaction: {status ("Ganhou"/"Perdeu"), status_id, returns, ...}}
- `GET /balance` → {credit, credit_cents}

## Trading flow
1. Start → analyze market → open-position
2. Wait for expiration (~48-60s)
3. settlement → transaction/{id} → balance
4. Update stats, check stop win/loss
5. Repeat or stop
