# Project Memory

## Core
Alpha Bot - crypto trading bot platform. Dark theme, teal/green primary.
Space Grotesk headings, Inter body. Portuguese (pt-BR) UI.
Backend: alphainvestbot.com API (Next.js on Vercel). Login: POST /api/login {user, pass}.
API endpoints: /api/symbols, /api/historical-data?symbol=X, /api/login.
Auth: Bearer token via access_token. WebSocket via ws_token.
Chart data from unicbroker.com traderoom UDF (includes manipulated candles).

## Memories
- [Design tokens](mem://design/tokens) — Dark theme with teal primary, chart green/red colors
- [API structure](mem://features/api) — Login returns access_token, ws_token, credit. Symbols endpoint is public.
- [Chart data source](mem://features/chart) — Unic traderoom UDF endpoint for candles with manipulation support
