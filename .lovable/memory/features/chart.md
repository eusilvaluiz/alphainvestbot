---
name: Traderoom chart data source
description: Chart uses Unic traderoom UDF endpoint for candle data including manipulated candles
type: feature
---

## Chart Data Source
- Historical data: Edge function `unic-chart` proxies `/publicapi/tradingview/udf-history`
- Format: TradingView UDF `{s: "ok", t: [...], o: [...], h: [...], l: [...], c: [...]}`
- **Real-time**: Ably WebSocket via edge function `unic-ws-auth` (proxies `/publicapi/ws/auth`)
  - Auth flow: login → visit /traderoom → GET /publicapi/ws/auth → returns Ably TokenDetails
  - Channel: `channels.getDerived(symbol, {filter: ...})` with brand filter for `unicbroker.com`
  - Message format: `{close: number, time: number}` (parsed from JSON string in message.data)
  - Headers contain `isi` (included sites) for brand-specific manipulation filtering
- Params: `symbol=BTCUSDT&resolution=1&from=X&to=Y&countback=300&site=unicbroker.com`
- Brand URL: `unicbroker.com`
- Ably library: `ably` npm package (client-side)
