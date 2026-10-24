// Public read-only quote endpoints. No DeepSeek credential is sent to these hosts.
function createMarketQuotes({fetchImpl,now=()=>Date.now()}){
 const cache=new Map();
 async function json(url){const r=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Quote unavailable');return r.json();}
 const positive=value=>{const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error('Invalid price');return n;};
 const timestamp=value=>{const n=Date.parse(value);if(!Number.isFinite(n)||n>now()+120000)throw Error('Invalid quote time');return new Date(n).toISOString();};
 async function get(asset){
  const cached=cache.get(asset);if(cached&&now()-cached.at<30000)return cached.source;
  let quote,url,title;
  if(['BTC','ETH'].includes(asset)){
   const base='https://api.exchange.coinbase.com/products/'+asset+'-USD';
   const [ticker,stats]=await Promise.all([json(base+'/ticker'),json(base+'/stats')]);
   const price=positive(ticker.price),open=positive(stats.open),quotedAt=timestamp(ticker.time);
   quote={asset,price,currency:'USD',unit:asset,quotedAt,change24hPercent:(price/open-1)*100,changeMethod:'(last_trade_price / Coinbase rolling 24h open - 1) * 100',statisticsFetchedAt:new Date(now()).toISOString(),status:now()-Date.parse(quotedAt)>600000?'last_known':'recent'};
   url=base+'/ticker';title='Coinbase Exchange — '+asset+'/USD';
  }else if(asset==='XAU'){
   url='https://api.gold-api.com/price/XAU';const data=await json(url);
   if(data.symbol!=='XAU'||(data.currency&&data.currency!=='USD'))throw Error('Wrong instrument');
   const quotedAt=timestamp(data.updatedAt);quote={asset,price:positive(data.price),currency:'USD',unit:'trojska unca zlata',quotedAt,change24hPercent:null,changeMethod:'Izvor ne vraća promenu za poslednja 24 sata.',status:now()-Date.parse(quotedAt)>21600000?'last_known':'recent'};
   title='Gold API — XAU/USD';
  }else throw Error('Unsupported asset');
  const source={url,title,asset,content:JSON.stringify(quote),quote,contentKind:'market_api',refreshStatus:'fetched_now',publishedAt:null};cache.set(asset,{source,at:now()});return source;
 }
 return {get};
}
module.exports={createMarketQuotes};
