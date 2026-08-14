# Compounder DNA — Live Expert Engine

## Included
- Live price and OHLCV data
- RSI, EMA20/50/200, SMA20/50/200, MACD, ATR
- Support/resistance, volume spike, relative strength
- NIFTY 50 market-regime check
- Fundamental quality, growth, leverage, valuation and confidence scoring
- BUY / HOLD / WAIT / AVOID explanations
- Auto Mode, Auto Radar, Auto Swing and Portfolio Auto Watch
- Demo fallback when live backend is unavailable

## Run
Requires Node.js 22+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Data note
The live provider is Yahoo Finance accessed through the community `yahoo-finance2` package. Yahoo Finance does not provide an official developer API; the package is unofficial and can change or fail. Browser-side access is avoided because the package documents CORS/cookie limitations.

For serious investing, primary exchange/company filings should be added before making promoter pledge, auditor, governance, quarterly-result or accounting-sensitive decisions fully automatic.
