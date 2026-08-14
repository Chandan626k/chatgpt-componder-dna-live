
/*
 * Compounder DNA — AUTO MODE UPGRADE v1
 * Add this script just before </body> in the existing HTML.
 *
 * Features:
 * 1) Stock-name autocomplete: partial name/symbol -> suggestions
 * 2) DNA Auto Mode toggle
 * 3) Swing Auto Scan: scans a predefined liquid NSE universe
 * 4) Radar Auto Scan: automatically ranks Long-term / Swing / Momentum
 * 5) Beginner-friendly BUY / WAIT / AVOID explanation
 *
 * It reuses the existing frontend functions:
 * resolveSymbol(), backendFetch(), taFetchHistory(), taSMA(), taRSI(),
 * taTrend(), swSupportResistance(), swATR(), swBreakout(), swLevels().
 */

(() => {
  const AUTO_STOCKS = [
    ['TITAN','Titan Company Ltd'],['TCS','Tata Consultancy Services Ltd'],
    ['INFY','Infosys Ltd'],['HDFCBANK','HDFC Bank Ltd'],['ICICIBANK','ICICI Bank Ltd'],
    ['RELIANCE','Reliance Industries Ltd'],['BAJFINANCE','Bajaj Finance Ltd'],
    ['KOTAKBANK','Kotak Mahindra Bank Ltd'],['AXISBANK','Axis Bank Ltd'],
    ['SBIN','State Bank of India'],['LT','Larsen & Toubro Ltd'],
    ['BHARTIARTL','Bharti Airtel Ltd'],['MARUTI','Maruti Suzuki India Ltd'],
    ['M&M','Mahindra & Mahindra Ltd'],['SUNPHARMA','Sun Pharmaceutical Industries Ltd'],
    ['HINDUNILVR','Hindustan Unilever Ltd'],['ITC','ITC Ltd'],
    ['ASIANPAINT','Asian Paints Ltd'],['PIDILITIND','Pidilite Industries Ltd'],
    ['DMART','Avenue Supermarts Ltd'],['POLYCAB','Polycab India Ltd'],
    ['HAVELLS','Havells India Ltd'],['NESTLEIND','Nestle India Ltd'],
    ['WIPRO','Wipro Ltd'],['LTIM','LTIMindtree Ltd'],
    ['TATASTEEL','Tata Steel Ltd'],['JSWSTEEL','JSW Steel Ltd'],
    ['NTPC','NTPC Ltd'],['POWERGRID','Power Grid Corporation of India Ltd'],
    ['ONGC','Oil & Natural Gas Corporation Ltd'],['COALINDIA','Coal India Ltd'],
    ['TRENT','Trent Ltd'],['HAL','Hindustan Aeronautics Ltd'],
    ['BEL','Bharat Electronics Ltd'],['SIEMENS','Siemens Ltd'],
    ['ABB','ABB India Ltd'],['DIXON','Dixon Technologies Ltd'],
    ['TRENT','Trent Ltd'],['IRCTC','Indian Railway Catering & Tourism Corp'],
    ['PERSISTENT','Persistent Systems Ltd'],['HCLTECH','HCL Technologies Ltd'],
    ['TECHM','Tech Mahindra Ltd'],['DRREDDY','Dr Reddy’s Laboratories Ltd'],
    ['CIPLA','Cipla Ltd'],['APOLLOHOSP','Apollo Hospitals Enterprise Ltd']
  ];

  const uniq = [...new Map(AUTO_STOCKS.map(x => [x[0], x])).values()];
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function addStyles() {
    if (document.getElementById('autoModeStyles')) return;
    const s = document.createElement('style');
    s.id = 'autoModeStyles';
    s.textContent = `
      .auto-suggest{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:9999;
        background:var(--card);border:1px solid var(--border2);border-radius:9px;overflow:hidden;
        box-shadow:0 16px 35px rgba(0,0,0,.45);display:none}
      .auto-suggest.show{display:block}
      .auto-suggest-item{padding:10px 13px;cursor:pointer;border-bottom:1px solid var(--border);
        display:flex;justify-content:space-between;gap:12px}
      .auto-suggest-item:hover,.auto-suggest-item.active{background:rgba(0,229,255,.08)}
      .auto-suggest-symbol{font-family:var(--mono);color:var(--c-score);font-weight:600;font-size:11px}
      .auto-suggest-name{font-size:12px;color:var(--text);text-align:right}
      .auto-toggle{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:10px;
        color:var(--muted);margin-top:11px;user-select:none}
      .auto-toggle input{accent-color:#00e5ff}
      .auto-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:5px;
        border:1px solid rgba(0,229,255,.25);background:rgba(0,229,255,.06);color:var(--c-score);
        font-family:var(--mono);font-size:10px;letter-spacing:1px}
      .auto-result-card{background:var(--card);border:1px solid var(--border);border-radius:12px;
        padding:16px;margin-bottom:10px}
      .auto-rank{font-family:var(--mono);font-size:11px;color:var(--c-score)}
      .auto-score{font-family:var(--mono);font-size:22px;font-weight:600}
      .auto-mini{font-family:var(--mono);font-size:10px;color:var(--muted);line-height:1.7}
      .auto-decision{font-family:var(--mono);font-weight:600;font-size:11px;padding:4px 9px;border-radius:5px}
      .auto-scan-btn{margin-left:auto;font-family:var(--mono);font-size:11px;padding:7px 13px;border-radius:6px;
        border:1px solid rgba(0,229,255,.3);background:rgba(0,229,255,.08);color:var(--c-score);cursor:pointer}
      @media(max-width:650px){.auto-suggest-name{max-width:190px}.auto-scan-btn{margin-left:0}}
    `;
    document.head.appendChild(s);
  }

  function setupAutocomplete() {
    const input = document.getElementById('stockInput');
    if (!input || input.dataset.autoReady) return;
    input.dataset.autoReady = '1';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;flex:1;min-width:220px;';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const box = document.createElement('div');
    box.className = 'auto-suggest';
    wrap.appendChild(box);

    const render = q => {
      q = q.trim().toLowerCase();
      if (!q) { box.classList.remove('show'); return; }
      const matches = uniq.filter(([sym,name]) =>
        sym.toLowerCase().includes(q) || name.toLowerCase().includes(q)
      ).slice(0,7);
      if (!matches.length) { box.classList.remove('show'); return; }
      box.innerHTML = matches.map(([sym,name]) =>
        `<div class="auto-suggest-item" data-sym="${esc(sym)}">
          <span class="auto-suggest-symbol">${esc(sym)}</span>
          <span class="auto-suggest-name">${esc(name)}</span>
        </div>`).join('');
      box.classList.add('show');
      box.querySelectorAll('.auto-suggest-item').forEach(el => {
        el.onclick = () => {
          input.value = el.dataset.sym;
          box.classList.remove('show');
          if (window.__AUTO_MODE) runDNA();
        };
      });
    };

    input.addEventListener('input', () => render(input.value));
    input.addEventListener('focus', () => render(input.value));
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) box.classList.remove('show'); });
  }

  function addAutoToggle() {
    const input = document.getElementById('stockInput');
    if (!input || document.getElementById('dnaAutoToggle')) return;
    const panel = input.closest('.input-panel');
    if (!panel) return;
    const row = document.createElement('label');
    row.className = 'auto-toggle';
    row.id = 'dnaAutoToggle';
    row.innerHTML = `<input type="checkbox" id="dnaAutoMode"> <span>AUTO MODE — analyze automatically when a stock is selected</span>`;
    input.closest('.input-row').after(row);
    const cb = document.getElementById('dnaAutoMode');
    cb.checked = true;
    window.__AUTO_MODE = true;
    cb.onchange = () => window.__AUTO_MODE = cb.checked;
  }

  async function autoChart(sym) {
    const data = await backendFetch('chart', {ticker: sym.yahoo});
    const prices = data?.prices || data;
    if (!prices || prices.length < 60) throw new Error('Insufficient chart history');
    return prices;
  }

  function calcSwing(prices) {
    const sma20 = taSMA(prices,20);
    const sma50 = taSMA(prices,50);
    const sma200 = taSMA(prices,200);
    const rsi = taRSI(prices);
    const i = prices.length-1, price = prices[i].c;
    const s20=sma20[i], s50=sma50[i], s200=sma200[i], rv=rsi[rsi.length-1];
    const trend = taTrend(prices,sma50,sma200);
    const sr = swSupportResistance(prices);
    const atr = swATR(prices);
    const bo = swBreakout(price,sr.resistance,s50);
    const lvl = swLevels(price,sr.support,sr.resistance,atr);

    let score=50;
    if(trend==='STRONG_UPTREND') score+=22;
    else if(trend==='RECOVERING'||trend==='PULLBACK') score+=10;
    else if(trend==='DOWNTREND') score-=22;
    if(rv>=40&&rv<=62) score+=12;
    else if(rv>72) score-=15;
    else if(rv<30) score-=5;
    if(price>s20) score+=5;
    if(s50&&price>s50) score+=5;
    if(s200&&price>s200) score+=5;
    if(lvl.rr>=2.5) score+=15;
    else if(lvl.rr>=2) score+=10;
    else if(lvl.rr<1.2) score-=15;
    if(bo.detected) score+=10;
    score=Math.max(0,Math.min(100,Math.round(score)));

    let decision='WAIT', color='#f59e0b';
    if(score>=82 && lvl.rr>=2) {decision='BUY SETUP';color='#00e5ff';}
    else if(score>=70 && lvl.rr>=1.5) {decision='WATCH / WAIT';color='#22c55e';}
    else if(score<50) {decision='AVOID';color='#ff4444';}

    return {score,decision,color,price,s20,s50,s200,rsi:rv,trend,support:sr.support,resistance:sr.resistance,atr,breakout:bo,lvl};
  }

  async function autoSwingScan() {
    const panel = document.getElementById('swingPanel');
    if (!panel) return;
    const inputPanel = panel.querySelector('.input-panel');
    if (!inputPanel || document.getElementById('autoSwingBtn')) return;

    const btn=document.createElement('button');
    btn.id='autoSwingBtn'; btn.className='auto-scan-btn'; btn.textContent='⚡ AUTO SCAN TODAY';
    const heading=inputPanel.querySelector('.panel-label');
    heading.parentElement.appendChild(btn);

    const host=document.createElement('div');
    host.id='autoSwingResults';
    panel.insertBefore(host, document.getElementById('sw-results'));
    btn.onclick=async()=>{
      btn.disabled=true; btn.textContent='⏳ SCANNING...';
      host.innerHTML='<div class="auto-result-card"><div class="auto-mini">Scanning liquid NSE universe... technical + trend + RSI + breakout + risk/reward...</div></div>';
      const out=[];
      for(const [ticker,name] of uniq){
        try{
          const sym=resolveSymbol(ticker);
          const prices=await autoChart(sym);
          const x=calcSwing(prices);
          if(x.score>=55) out.push({ticker,name,...x});
        }catch(e){}
      }
      out.sort((a,b)=>b.score-a.score);
      host.innerHTML = `
        <div class="auto-result-card">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div><div class="fp-title" style="margin:0 0 5px">// TODAY'S AUTO SWING RANKING</div>
            <div class="auto-mini">Only setups passing the technical filter are shown. No setup = no trade.</div></div>
            <div class="auto-badge">✓ ${out.length} CANDIDATES</div>
          </div>
        </div>` +
        (out.length ? out.slice(0,10).map((x,i)=>`
          <div class="auto-result-card">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div class="auto-rank">#${i+1}</div>
              <div style="flex:1;min-width:150px"><div style="font-weight:700;color:var(--text)">${esc(x.name)}</div>
                <div class="auto-mini">${esc(x.ticker)} · ${esc(x.trend)} · RSI ${x.rsi.toFixed(1)}</div></div>
              <div class="auto-score" style="color:${x.color}">${x.score}</div>
              <span class="auto-decision" style="background:${x.color}18;color:${x.color}">${x.decision}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px">
              <div class="auto-mini">PRICE<br><b style="color:var(--text)">₹${x.price.toFixed(2)}</b></div>
              <div class="auto-mini">SUPPORT<br><b style="color:var(--text)">₹${x.support.toFixed(2)}</b></div>
              <div class="auto-mini">RESISTANCE<br><b style="color:var(--text)">₹${x.resistance.toFixed(2)}</b></div>
              <div class="auto-mini">R:R<br><b style="color:var(--text)">${x.lvl.rr.toFixed(2)}</b></div>
            </div>
            <div class="auto-mini" style="margin-top:9px">
              ${x.breakout.detected?'🟢 Breakout confirmation detected. ':' '}
              ${x.rsi>70?'⚠ RSI elevated — chasing risky. ':x.rsi<35?'RSI weak — wait for confirmation. ':'RSI zone acceptable. '}
              ${x.lvl.rr>=2?'Risk/reward is favourable.':'Risk/reward is not strong enough yet.'}
            </div>
          </div>`).join('') :
          `<div class="auto-result-card"><div style="color:#f59e0b">NO TRADE TODAY — no sufficiently strong setup passed the filter.</div></div>`);
      btn.disabled=false; btn.textContent='⚡ AUTO SCAN TODAY';
    };
  }

  function addRadarAutoButton() {
    const panel=document.getElementById('radarPanel');
    if(!panel || document.getElementById('radarAutoBtn')) return;
    const heading=panel.querySelector('.panel-label');
    const btn=document.createElement('button');
    btn.id='radarAutoBtn'; btn.className='auto-scan-btn'; btn.textContent='🎯 AUTO SCAN';
    heading.parentElement.appendChild(btn);
    btn.onclick=()=>{
      const input=document.getElementById('radar-symbols');
      if(input) input.value=uniq.map(x=>x[0]).join(',');
      radarRun();
    };
  }

  function boot() {
    addStyles();
    setupAutocomplete();
    addAutoToggle();
    autoSwingScan();
    addRadarAutoButton();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
