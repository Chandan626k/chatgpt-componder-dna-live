const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const ticker=input=>{let x=String(input||'').trim().toUpperCase().replace(/\s+/g,'');if(!x)throw Error('Stock symbol is required');if(x.endsWith('.NS')||x.endsWith('.BO')||x.startsWith('^'))return x;return x+'.NS'};

async function yahooChart(symbol,range='1y',interval='1d'){
  const c=new AbortController(); const timer=setTimeout(()=>c.abort(),9000);
  try{
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div%2Csplits`;
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:c.signal});
    const text=await r.text();
    if(!r.ok) throw Error(`Yahoo HTTP ${r.status}`);
    const j=JSON.parse(text); const x=j?.chart?.result?.[0];
    if(!x) throw Error('Yahoo returned no market data');
    const q=x.indicators?.quote?.[0]||{}; const ts=x.timestamp||[];
    const rows=[]; for(let i=0;i<ts.length;i++){const close=num(q.close?.[i]),high=num(q.high?.[i]),low=num(q.low?.[i]),volume=num(q.volume?.[i]); if(close!=null&&high!=null&&low!=null&&volume!=null) rows.push({date:new Date(ts[i]*1000).toISOString(),close,high,low,volume});}
    if(rows.length<30) throw Error(`Insufficient Yahoo chart data (${rows.length} points)`);
    return {symbol,currency:x.meta?.currency||'INR',exchange:x.meta?.exchangeName||'',price:num(x.meta?.regularMarketPrice)??rows.at(-1).close,rows};
  }catch(e){ if(e?.name==='AbortError') throw Error('Yahoo request timed out'); throw e; } finally{clearTimeout(timer)}
}

function sma(a,n){return a.length<n?null:a.slice(-n).reduce((s,v)=>s+v,0)/n}
function ema(a,n){if(a.length<n)return null;let e=a.slice(0,n).reduce((s,v)=>s+v,0)/n,k=2/(n+1);for(let i=n;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a,n=14){if(a.length<=n)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=a[i]-a[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}g/=n;l/=n;for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}return l===0?100:100-100/(1+g/l)}
function atr(rows,n=14){if(rows.length<=n)return null;const tr=[];for(let i=1;i<rows.length;i++){const x=rows[i],p=rows[i-1];tr.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)))}return sma(tr,n)}
function pct(a,n){return a.length<=n?null:(a.at(-1)/a.at(-1-n)-1)*100}
function technical(rows){const c=rows.map(r=>r.close),v=rows.map(r=>r.volume),last=c.at(-1),s20=sma(c,20),s50=sma(c,50),s200=sma(c,200),e20=ema(c,20),e50=ema(c,50),e200=ema(c,200),rr=rsi(c),aa=atr(rows),avgV=sma(v,20),hi20=Math.max(...rows.slice(-20).map(r=>r.high)),lo20=Math.min(...rows.slice(-20).map(r=>r.low)),hi60=Math.max(...rows.slice(-60).map(r=>r.high)),lo60=Math.min(...rows.slice(-60).map(r=>r.low));
 const trend=e200!=null?(last>e20&&e20>e50&&e50>e200?'STRONG UPTREND':last>e50&&e50>e200?'UPTREND':last<e50&&e50<e200?'DOWNTREND':'RECOVERING / MIXED'):(last>(s50||last)?'UPTREND':'RECOVERING / MIXED');
 return {prices:c,s20,s50,s200,e20,e50,e200,rsi:rr,atr:aa,high:hi60,low:lo60,support:lo20,resistance:hi20,volume:v.at(-1),avgVolume:avgV,volumeSpike:avgV? v.at(-1)/avgV:null,trend,last,change1d:pct(c,1),change20d:pct(c,20)};
}
function scoreStock(d,t){
 const quality=50,wealth=50,debt=Number.isFinite(d.de)?clamp(d.de,0,100):50,val= d.price && d.high ? clamp((d.price/d.high<.7?25:d.price/d.high<.85?45:65)) : 50;
 const tech=t.trend==='DOWNTREND'?75:t.rsi>72?55:30; const risk=clamp(debt*.4+val*.25+tech*.2+25*.15); const confidence=clamp(t.prices.length>=200?100:70); const overall=clamp(quality*.32+wealth*.28+(100-risk)*.22+confidence*.18);
 return {quality,wealth,risk,confidence,overall};
}
function decision(s,t){if(s.overall>=78&&s.risk<40&&t.trend!=='DOWNTREND')return{action:'BUY / ACCUMULATE',reason:['Technical trend supports the setup.','Risk is acceptable under the current framework.']};if(s.overall>=68&&s.risk<55)return{action:'BUY ON WEAKNESS / HOLD',reason:['Setup is constructive but entry quality matters.','Prefer confirmation or a better price.']};if(s.overall<48||s.risk>=70)return{action:'AVOID / REVIEW',reason:['Risk/reward is unattractive right now.','Re-check the thesis before adding capital.']};return{action:'WAIT / WATCH',reason:['Evidence is mixed.','Wait for valuation or technical confirmation.']}}

export async function analyze(input){
 const symbol=ticker(input); const main=await yahooChart(symbol,'1y','1d'); const t=technical(main.rows); const d={symbol:String(input).toUpperCase().replace(/\.NS$|\.BO$/i,''),yahooSymbol:symbol,name:symbol,sector:'N/A',industry:'N/A',price:main.price,marketCap:null,pe:null,pb:null,roe:null,de:null,npm:null,opm:null,rg:null,eg:null,fcf:null,low:Math.min(...main.rows.map(r=>r.low)),high:Math.max(...main.rows.map(r=>r.high)),dataNote:'Live price/technical data fetched from Yahoo Finance chart endpoint.'}; const s=scoreStock(d,t); return {stock:d,score:s,technical:t,decision:decision(s,t),source:'Yahoo Finance chart API',asOf:new Date().toISOString()};
}
