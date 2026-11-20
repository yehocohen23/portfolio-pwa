// Daily prices from a no-key source. Yahoo's chart endpoint returns about two years of
// daily closes, which is enough for the monthly T1–T3 and drawdown rules.
// A symbol that fails is returned as null — the caller must not invent a price.

const UA = 'Mozilla/5.0 (compatible; PortfolioPWA/1.0; personal market research)';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function yahooSymbol(symbol) {
  return symbol.replace(/\./g, '-');
}

export function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)).then(() => out);
}

async function getJson(url, headers, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
      if (res.status === 429 || res.status >= 500) {
        last = new Error('HTTP ' + res.status);
        await sleep(800 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      last = err;
      await sleep(500 * (i + 1));
    }
  }
  throw last;
}

export async function yahooDaily(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(yahooSymbol(symbol)) + '?range=2y&interval=1d&includePrePost=false';
  const data = await getJson(url, { 'User-Agent': UA, Accept: 'application/json' });
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp || !result.indicators?.quote?.[0]) return null;
  const closes = result.indicators.quote[0].close;
  const dates = [];
  const px = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = closes[i];
    if (!Number.isFinite(c)) continue;
    const day = new Date(result.timestamp[i] * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    dates.push(day);
    px.push(c);
  }
  if (px.length < 2) return null;
  return { dates, closes: px, source: 'Yahoo Finance chart, daily bars, no API key' };
}

export async function finnhubDaily(symbol, token) {
  if (!token) return null;
  const to = Math.floor(Date.now() / 1000);
  const from = to - 800 * 86400;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(yahooSymbol(symbol))}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(token)}`;
  const data = await getJson(url, { 'User-Agent': UA, Accept: 'application/json' });
  if (data?.s !== 'ok' || !Array.isArray(data.c)) return null;
  const dates = [];
  const px = [];
  for (let i = 0; i < data.c.length; i++) {
    if (!Number.isFinite(data.c[i])) continue;
    dates.push(new Date(data.t[i] * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
    px.push(data.c[i]);
  }
  if (px.length < 2) return null;
  return { dates, closes: px, source: 'Finnhub stock/candle, daily, free tier' };
}

export async function loadPrices(symbol, finnhubKey) {
  try {
    const y = await yahooDaily(symbol);
    if (y) return y;
  } catch { /* fall through */ }
  if (!finnhubKey) return null;
  try { return await finnhubDaily(symbol, finnhubKey); }
  catch { return null; }
}

export async function usdIls() {
  const data = await getJson('https://www.boi.org.il/PublicApi/GetExchangeRates?asXml=false', { 'User-Agent': UA, Accept: 'application/json' });
  const row = (data.exchangeRates || []).find(r => r.key === 'USD');
  if (!row || !Number.isFinite(row.currentExchangeRate)) throw new Error('Bank of Israel USD rate missing');
  const date = String(row.lastUpdate || '').slice(0, 10);
  return { USDILS: row.currentExchangeRate, date, source: 'בנק ישראל, שער יציג (PublicApi/GetExchangeRates)' };
}

export async function cryptoUsd() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';
  const data = await getJson(url, { 'User-Agent': UA, Accept: 'application/json' });
  const btc = data?.bitcoin?.usd, eth = data?.ethereum?.usd;
  if (!Number.isFinite(btc) || !Number.isFinite(eth)) throw new Error('CoinGecko price missing');
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return {
    BTC: { usd: btc, date, source: 'CoinGecko simple price, no API key' },
    ETH: { usd: eth, date, source: 'CoinGecko simple price, no API key' },
    source: 'CoinGecko simple price, no API key',
  };
}
