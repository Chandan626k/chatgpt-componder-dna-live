import express from 'express';
import YahooFinance from 'yahoo-finance2';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

// Do NOT keep a shared AbortSignal here. A shared timeout signal expires once and
// can make later requests fail with "operation was aborted due to timeout".
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const n = (v, d = null) => typeof v === 'number' && Number.isFinite(v) ? v : d;
const val = o => o && typeof o === 'object' && 'raw' in o ? o.raw : o;
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sym(input) {
  let x = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!x) throw new Error('symbol required');
  if (x.endsWith('.NS') || x.endsWith('.BO') || x.includes('=') || x.includes('^')) return x;
  return `${x}.NS`;
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function retry(label, fn, attempts = 2) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await withTimeout(fn(), 22000, label);
    } catch (e) {
      last = e;
      if (i < attempts) await sleep(800 * i);
    }
  }
  throw new Error(`${label}: ${last?.message || last}`);
}

function sma(a, p) {
  return a.length < p ? null : a.slice(-p).reduce((x, y) => x + y, 0) / p;
}
function ema(a, p) {
  if (a.length < p) return null;
  let e = a.slice(0, p).reduce((x, y) => x + y, 0) / p;
  const k = 2 / (p + 1);
  for (let i = p; i < a.length; i++) e = a[i] * k + e * (1 - k);
  return e;
}
function rsi(a, p = 14) {
  if (a.length <= p) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const d = a[i] - a[i - 1];
    g += Math.max(d, 0); l += Math.max(-d, 0);
  }
  g /= p; l /= p;
  for (let i = p + 1; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function atr(q, p = 14) {
  if (q.length <= p) return null;
  const tr = [];
  for (let i = 1; i < q.length; i++) {
    const x = q[i], z = q[i - 1];
    tr.push(Math.max(x.high - x.low, Math.abs(x.high - z.close), Math.abs(x.low - z.close)));
  }
  return sma(tr, p);
}
function macd(a) {
  const lines = [];
  for (let i = 0; i < a.length; i++) {
    const e12 = ema(a.slice(0, i + 1), 12);
    const e26 = ema(a.slice(0, i + 1), 26);
    if (e12 != null && e26 != null) lines.push(e12 - e26);
  }
  const signal = ema(lines, 9);
  const line = lines.at(-1) ?? null;
  return { line, signal, hist: signal == null || line == null ? null : line - signal };
}
function pct(a, p) {
  return a.length <= p ? null : (a.at(-1) / a.at(-1 - p) - 1) * 100;
}

function technical(q, mq = []) {
  const clean = q.filter(x => Number.isFinite(x?.close) && Number.isFinite(x?.high) && Number.isFinite(x?.low) && Number.isFinite(x?.volume));
  if (clean.length < 30) throw new Error(`Insufficient chart history (${clean.length} points)`);
  const c = clean.map(x => x.close);
  const v = clean.map(x => x.volume);
  const last = c.at(-1);
  const s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200);
  const e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200);
  const rr = rsi(c), mm = macd(c), aa = atr(clean);
  const recent20 = clean.slice(-20), recent60 = clean.slice(-60);
  const high20 = Math.max(...recent20.map(x => x.high));
  const low20 = Math.min(...recent20.map(x => x.low));
  const high60 = Math.max(...recent60.map(x => x.high));
  const low60 = Math.min(...recent60.map(x => x.low));
  const av = sma(v, 20);
  const spike = av ? v.at(-1) / av : null;
  const mc = mq.map(x => x.close).filter(Number.isFinite);
  const rs = pct(c, 20), mrs = pct(mc, 20);
  const trend = e200 != null && e50 != null && e20 != null
    ? (last > e20 && e20 > e50 && e50 > e200 ? 'STRONG UPTREND'
      : last > e50 && e50 > e200 ? 'UPTREND'
      : last < e50 && e50 < e200 ? 'DOWNTREND'
      : 'RECOVERING / MIXED')
    : (last > (e50 ?? s50 ?? last) ? 'UPTREND' : 'RECOVERING / MIXED');

  return {
    prices: c,
    s20, s50, s200, e20, e50, e200,
    rsi: rr, macd: mm, atr: aa,
    high: high60, low: low60,
    support: low20, resistance: high20,
    volume: v.at(-1), avgVolume: av, volumeSpike: spike,
    relativeStrength: rs != null && mrs != null ? rs - mrs : null,
    trend, last,
    change1d: pct(c, 1), change20d: rs, market20d: mrs
  };
}

function scoreStock(d, t) {
  const quality = clamp(
    (d.roe == null ? 50 : d.roe >= 30 ? 95 : d.roe >= 25 ? 85 : d.roe >= 20 ? 75 : d.roe >= 15 ? 60 : 40) * .30 +
    (d.npm == null ? 50 : d.npm >= 20 ? 90 : d.npm >= 15 ? 80 : d.npm >= 10 ? 68 : 48) * .25 +
    (d.de == null ? 50 : d.de < .3 ? 90 : d.de < 1 ? 68 : d.de < 2 ? 45 : 20) * .25 +
    (d.opm == null ? 55 : d.opm >= 20 ? 90 : d.opm >= 12 ? 72 : 50) * .20
  );
  const wealth = clamp(
    (d.rg == null ? 50 : d.rg >= 20 ? 92 : d.rg >= 12 ? 78 : d.rg >= 7 ? 64 : d.rg > 0 ? 50 : 25) * .40 +
    (d.eg == null ? 50 : d.eg >= 20 ? 90 : d.eg >= 10 ? 74 : d.eg > 0 ? 56 : 25) * .25 +
    (d.fcf == null ? 50 : d.fcf > 0 ? 82 : 45) * .20 +
    (d.payout == null ? 55 : clamp(100 - d.payout)) * .15
  );
  const debt = d.de == null ? 48 : d.de < .3 ? 18 : d.de < 1 ? 40 : d.de < 2 ? 62 : 85;
  const val = d.pe == null ? 50 : d.pe < 18 ? 18 : d.pe < 25 ? 30 : d.pe < 35 ? 45 : d.pe < 50 ? 62 : 82;
  const growth = d.eg == null ? 45 : d.eg < 0 ? 75 : d.eg < 5 ? 55 : d.eg < 12 ? 40 : 25;
  const tech = t.trend === 'DOWNTREND' ? 75 : t.trend.includes('MIXED') ? 52 : t.rsi > 72 ? 55 : 30;
  const risk = clamp(debt * .28 + val * .28 + growth * .18 + tech * .12 + 30 * .14);
  const confidence = clamp((['price', 'roe', 'de', 'rg', 'eg', 'pe', 'fcf'].filter(k => d[k] != null).length / 7) * 100 * .65 + (t.prices.length >= 200 ? 100 : 70) * .35);
  const overall = clamp(quality * .34 + wealth * .30 + (100 - risk) * .20 + confidence * .16);
  return { quality, wealth, risk, confidence, overall };
}

function decision(s, t) {
  if (s.overall >= 78 && s.risk < 40 && t.trend !== 'DOWNTREND') return { action: 'BUY / ACCUMULATE', reason: ['Business quality and wealth creation are strong.', 'Risk-adjusted score is acceptable.', 'Technical trend is not fighting the thesis.'] };
  if (s.overall >= 68 && s.risk < 55) return { action: 'BUY ON WEAKNESS / HOLD', reason: ['Business profile is attractive.', 'Price/risk does not justify aggressive chasing.', 'Prefer better entry price or confirmation.'] };
  if (s.overall < 48 || s.risk >= 70) return { action: 'AVOID / REVIEW', reason: ['Risk/reward is unattractive under the current framework.', 'Re-underwrite the thesis before adding capital.'] };
  return { action: 'WAIT / WATCH', reason: ['Evidence is mixed.', 'Wait for valuation, fundamental or technical confirmation.'] };
}

const modules = ['price','summaryDetail','defaultKeyStatistics','financialData','summaryProfile','earningsTrend','majorHoldersBreakdown','assetProfile'];

export async function analyze(input) {
  const symbol = sym(input);

  // The previous version used Promise.all() for four Yahoo requests. One slow
  // NSE-index request then caused the whole /api/analyze request to become 502.
  // Stock summary + stock chart are required; NIFTY chart is optional.
  const [summaryResult, chartResult] = await Promise.allSettled([
    retry('Yahoo quoteSummary', () => yf.quoteSummary(symbol, { modules })),
    retry('Yahoo stock chart', () => yf.chart(symbol, {
      period1: new Date(Date.now() - 420 * 86400000),
      interval: '1d',
      includePrePost: false
    }))
  ]);

  if (summaryResult.status === 'rejected') throw summaryResult.reason;
  if (chartResult.status === 'rejected') throw chartResult.reason;

  const qs = summaryResult.value || {};
  const chart = chartResult.value || {};

  let market = { quotes: [] };
  try {
    market = await retry('Yahoo NIFTY chart', () => yf.chart('^NSEI', {
      period1: new Date(Date.now() - 420 * 86400000),
      interval: '1d',
      includePrePost: false
    }), 1);
  } catch (e) {
    console.warn('[analyze] NIFTY chart unavailable; continuing without market comparison:', e.message);
  }

  const q = qs.price || {};
  const f = qs.financialData || {};
  const sd = qs.summaryDetail || {};
  const ks = qs.defaultKeyStatistics || {};
  const profile = qs.summaryProfile || qs.assetProfile || {};
  const quotes = chart.quotes || [];
  const validHigh = quotes.map(x => x.high).filter(Number.isFinite);
  const validLow = quotes.map(x => x.low).filter(Number.isFinite);
  const d = {
    symbol: String(input).toUpperCase().replace(/\.NS$|\.BO$/i, ''),
    yahooSymbol: symbol,
    name: val(q.longName) || val(q.shortName) || symbol,
    sector: val(profile.sector) || 'Unknown',
    industry: val(profile.industry) || 'Unknown',
    price: n(val(q.regularMarketPrice) ?? val(q.regularMarketPreviousClose) ?? chart.meta?.regularMarketPrice),
    marketCap: n(val(q.marketCap)),
    pe: n(val(sd.trailingPE) ?? val(ks.trailingPE)),
    fpe: n(val(sd.forwardPE) ?? val(ks.forwardPE)),
    pb: n(val(ks.priceToBook)),
    peg: n(val(ks.pegRatio)),
    roe: n(val(f.returnOnEquity) * 100),
    roa: n(val(f.returnOnAssets) * 100),
    de: n(val(f.debtToEquity) / 100),
    npm: n(val(f.profitMargins) * 100),
    opm: n(val(f.operatingMargins) * 100),
    rg: n(val(f.revenueGrowth) * 100),
    eg: n(val(f.earningsGrowth) * 100),
    fcf: n(val(f.freeCashflow) / 1e7),
    operatingCashflow: n(val(f.operatingCashflow) / 1e7),
    totalCash: n(val(f.totalCash) / 1e7),
    totalDebt: n(val(f.totalDebt) / 1e7),
    payout: n(val(sd.payoutRatio) * 100),
    div: n(val(sd.dividendYield) * 100),
    beta: n(val(ks.beta)),
    heldInsiders: n(val(ks.heldPercentInsiders) * 100),
    heldInstitutions: n(val(ks.heldPercentInstitutions) * 100),
    description: val(profile.longBusinessSummary) || '',
    low: validLow.length ? Math.min(...validLow) : n(val(sd.fiftyTwoWeekLow)),
    high: validHigh.length ? Math.max(...validHigh) : n(val(sd.fiftyTwoWeekHigh)),
    revenue: n(val(f.totalRevenue)),
    profit: n(val(f.netIncomeToCommon) ?? val(f.netIncome)),
    revenueAvailable: n(val(f.totalRevenue)) != null,
    profitAvailable: n(val(f.netIncomeToCommon) ?? val(f.netIncome)) != null
  };

  if (d.price == null) throw new Error('Yahoo returned no current price for this symbol');
  if (d.low == null) d.low = d.price;
  if (d.high == null) d.high = d.price;

  const t = technical(quotes, market.quotes || []);
  const s = scoreStock(d, t);
  const dec = decision(s, t);
  return {
    stock: d,
    score: s,
    technical: t,
    decision: dec,
    source: 'Yahoo Finance via yahoo-finance2',
    asOf: new Date().toISOString()
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), provider: 'Yahoo Finance via yahoo-finance2' }));
app.get('/api/analyze', async (req, res) => {
  if (!req.query.symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const data = await analyze(req.query.symbol);
    return res.status(200).json(data);
  } catch (e) {
    console.error('[api/analyze]', e);
    return res.status(502).json({
      error: 'Live market data unavailable',
      detail: String(e?.message || e),
      symbol: String(req.query.symbol).toUpperCase()
    });
  }
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Compounder DNA LIVE running at http://localhost:${PORT}`));
}
