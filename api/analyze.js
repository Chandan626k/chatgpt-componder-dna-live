import { isRateLimited } from '../lib/cache.js';
import { analyze } from '../lib/market-engine.js';

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin',process.env.ALLOWED_ORIGIN||'*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({error:'GET only'});
  const symbol=String(req.query?.symbol||'').trim();
  if(!symbol) return res.status(400).json({error:'symbol required'});
  const rate=isRateLimited(req.headers['x-forwarded-for']||'unknown');
  if(rate.limited) return res.status(429).json({error:'Rate limit exceeded',resetAt:rate.resetAt});
  try{return res.status(200).json(await analyze(symbol));}
  catch(e){return res.status(502).json({error:'Live market data unavailable',detail:e?.message||String(e),symbol:symbol.toUpperCase()});}
}
