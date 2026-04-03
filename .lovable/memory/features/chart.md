---
name: Traderoom chart data source
description: Chart uses Unic traderoom UDF endpoint for candle data including manipulated candles
type: feature
---

## Chart Data Source
- Historical data: `/unic-api/tradingview/udf-history` (proxied to `unicbroker.com/publicapi/tradingview/udf-history`)
- Format: TradingView UDF `{s: "ok", t: [...], o: [...], h: [...], l: [...], c: [...]}`
- Real-time: Polling every 3s from same endpoint (includes manipulated candles)
- The traderoom uses Ably WebSocket for real-time, but polling is sufficient for our use case
- Params: `symbol=BTCUSDT&resolution=1&from=X&to=Y&countback=300&site=unicbroker.com`
