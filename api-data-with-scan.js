
/*
 * REPLACE api/data.js with this version if your current backend does not have
 * a `scan` endpoint. It keeps summary/chart/news and adds:
 *
 * POST /api/data { type:"scan", symbols:[...], range:"6mo" }
 *
 * The scan is intentionally technical only. The frontend then calculates
 * the final swing score, entry/SL/targets and explanation.
 */
import { isRateLimited } from '../lib/cache.js';

const CACHE=new Map(), TTL=30*60*1000;
const H={'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://finance.yahoo.com/'};
const CORS={
 'Access-Control-Allow-Origin':process.env.ALLOWED_ORIGIN||'*',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'Content-Type'
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=(k)=>{const x=CACHE.get(k);if(!x||Date.now()>x.exp){CACHE.delete(k);return null}return x.data};
const set=(k,v)=>{if(CACHE.size>500)CACHE.delete(CACHE.keys().next().value);CACHE.set(k,{data:v,exp:Date.now()+TTL})};
async function yFetch(url){
 let last;
 for(let a=0;a<2;a++){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
  try{
   const r=await fetch(url,{headers:H,signal:c.signal}),txt=await r.text(); clearTimeout(t);
   if(r.status===429){last=new Error('RATE_LIMIT');await sleep(1500*(a+1));continue}
   if(!r.ok)throw new Error(`Yahoo ${r.status}`);
   return JSON.parse(txt);
  }catch(e){clearTimeout(t);last=e;if(a===0)await sleep(1000)}
 }
 throw last||new Error('Yahoo fetch failed');
}
function send(res,status,body){res.setHeader('Access-Control-Allow-Origin',CORS['Access-Control-Allow-Origin']);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');return res.status(status).json(body)}
function valid(s){return /^[A-Z0-9.&_-]{1,25}(?:\.NS|\.BO)?$/i.test(String(s||''))}
function norm(s){s=String(s).trim().toUpperCase();return s.endsWith('.NS')||s.endsWith('.BO')?s:`${s}.NS`}

async function getChart(ticker,range='1y'){
 const sym=norm(ticker),key=`chart:${sym}:${range}`;let d=get(key);if(d)return d;
 const raw=await yFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`);
 const c=raw?.chart?.result?.[0];if(!c)throw new Error(`No chart data for ${sym}`);
 const q=c.indicators?.quote?.[0]||{},ts=c.timestamp||[];
 const prices=ts.map((t,i)=>({t,c:q.close?.[i],o:q.open?.[i],h:q.high?.[i],l:q.low?.[i],v:q.volume?.[i]})).filter(x=>Number.isFinite(x.c)&&x.c>0);
 if(prices.length<30)throw new Error(`Only ${prices.length} days for ${sym}`);
 d={prices,meta:{ticker:sym,price:c.meta?.regularMarketPrice||prices.at(-1)?.c,currency:c.meta?.currency||'INR'}};set(key,d);return d;
}

async function getSummary(ticker){return getChart(ticker,'1y')}
async function getNews(query){
 const q=String(query||'').trim();if(!q)throw new Error('query required');
 const key=`news:${q.toLowerCase()}`;let d=get(key);if(d)return d;
 const raw=await yFetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=8&quotesCount=0`);
 d=(raw?.news||[]).slice(0,5).map(n=>({title:n.title||'',publisher:n.publisher||'',link:n.link||'#',publishedAt:n.providerPublishTime?new Date(n.providerPublishTime*1000).toISOString():''}));
 set(key,d);return d;
}

export default async function handler(req,res){
 if(req.method==='OPTIONS')return res.status(204).set(CORS).end();
 if(req.method!=='POST')return send(res,405,{error:'POST only'});
 const rate=isRateLimited(req.headers['x-forwarded-for']||'unknown');
 if(rate.limited)return send(res,429,{error:'Rate limit exceeded',resetAt:rate.resetAt});
 let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body||{}}catch{return send(res,400,{error:'Invalid JSON'})}
 try{
  if(b.type==='summary'){
   if(!valid(b.ticker))return send(res,400,{error:'Invalid ticker'});
   return send(res,200,{success:true,data:await getSummary(b.ticker)});
  }
  if(b.type==='chart'){
   if(!valid(b.ticker))return send(res,400,{error:'Invalid ticker'});
   return send(res,200,{success:true,data:await getChart(b.ticker,b.range||'1y')});
  }
  if(b.type==='news')return send(res,200,{success:true,data:await getNews(b.query||b.ticker)});
  if(b.type==='scan'){
   const symbols=Array.isArray(b.symbols)?b.symbols.slice(0,40):[];
   const results=[];
   for(const s of symbols){
    if(!valid(s))continue;
    try{const d=await getChart(s,b.range||'6mo');results.push({ticker:norm(s),...d})}catch{}
   }
   return send(res,200,{success:true,data:results});
  }
  return send(res,400,{error:'Unknown type'});
 }catch(e){return send(res,502,{success:false,error:e.message||'Backend error'})}
}
