const $=id=>document.getElementById(id),usd=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n)+' USDToilet',price=n=>n>=1?n.toLocaleString('en-US',{maximumFractionDigits:5}):n>=.0001?n.toFixed(7):n.toPrecision(5),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EVENT_INITIAL=100000;
let marketFilter='all';
let eventDeadline=0,eventServerOffset=0,eventClosed=false;
const STORE='toilet-paperx-free-v4';let state;try{state=JSON.parse(localStorage.getItem(STORE))}catch{}state=state&&Number.isFinite(state.cash)&&state.cash>=0&&Array.isArray(state.positions)&&Array.isArray(state.history)?state:{cash:100000,positions:[],history:[]};let markets=[],selected=null,side='LONG',candles=[],busy=false,lastRefresh=0,searchTimer=null,marketSource='';
function save(){localStorage.setItem(STORE,JSON.stringify(state))}function toast(s){$('toast').textContent=s;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),4000)}
function current(p){const m=markets.find(x=>x.address===p.address);return m?.price>0?m.price:p.lastPrice||p.entryPrice}function pnl(p){const mark=current(p);return (mark-p.entryPrice)*p.quantity*(p.side==='LONG'?1:-1)}function unreal(){return state.positions.reduce((s,p)=>s+Math.max(-p.margin,pnl(p)),0)}
function renderBalances(){const locked=state.positions.reduce((s,p)=>s+p.margin,0),u=unreal();$('equity').textContent=usd(state.cash+locked+u);$('cash').textContent=usd(state.cash);$('unrealized').textContent=usd(u);$('unrealized').className=u>=0?'positive':'negative';$('position-count').textContent=state.positions.length;renderChallengeScore()}
function tokenLogo(m){
  // The market provider associates the logo with the token's contract, not just its ticker.
  // Never guess a remote logo by symbol: many unrelated tokens reuse the same ticker.
  const symbol=String(m.symbol||'').toUpperCase();
  const raw=String(m.logoUrl||'');
  const safe=/^https:\/\/[^\s<>"']+$/i.test(raw)?raw:'';
  const fallback=symbol==='SUI'?'<img class="market-logo" src="./sui-logo.svg" alt="SUI logo" loading="lazy">':(m.change24h>=0?'🚀':'🪙');
  if(!safe)return fallback;
  return `<img class="market-logo" src="${esc(safe)}" alt="${esc(m.symbol)} logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="logo-fallback" hidden>${symbol==='SUI'?'💧':m.change24h>=0?'🚀':'🪙'}</span>`;
}
// Pin only verified live pairs; never invent a quote or a price.
const priorityPairs=['TOILET/SUI','SUI/USDC','DEEP/USDC','WAL/USDC'];
function canonicalPair(m){return String(m.name||'').toUpperCase().replace(/\s/g,'').replace(/[-–]/g,'/').replace(/\/+/g,'/').trim()}
function marketRank(m){const k=canonicalPair(m);return priorityPairs.findIndex(x=>x===k)}
function sortFeatured(list){return [...list].sort((a,b)=>{const x=marketRank(a),y=marketRank(b);return (x<0?999:x)-(y<0?999:y)||((b.liquidity||0)-(a.liquidity||0))})}
// GitHub Pages static mode: market data is fetched from public HTTPS APIs.
const GECKO='https://api.geckoterminal.com/api/v2';
const DEX='https://api.dexscreener.com';
async function publicJSON(url,timeout=14000){const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('Market provider HTTP '+r.status);return r.json()}
function geckoMarkets(d){const inc=new Map((d.included||[]).map(x=>[x.id,x]));return(d.data||[]).map(p=>{const a=p.attributes||{},rel=p.relationships||{};const b=inc.get(rel.base_token?.data?.id)?.attributes||{};const q=inc.get(rel.quote_token?.data?.id)?.attributes||{};return{id:p.id,address:a.address,name:a.name||`${b.symbol||'?'} / ${q.symbol||'?'}`,symbol:b.symbol||String(a.name||'').split('/')[0].trim(),logoUrl:b.image_url||null,price:Number(a.base_token_price_usd),liquidity:Number(a.reserve_in_usd||0),volume24h:Number(a.volume_usd?.h24||0),change24h:Number(a.price_change_percentage?.h24||0),provider:'GeckoTerminal',chartAddress:a.address}}).filter(x=>x.address&&x.price>0)}
function dexMarkets(d){return(d.pairs||[]).filter(x=>String(x.chainId).toLowerCase()==='sui'&&Number(x.priceUsd)>0).map(x=>({id:x.pairAddress,address:x.pairAddress,name:(x.baseToken?.symbol||'?')+' / '+(x.quoteToken?.symbol||'?'),symbol:x.baseToken?.symbol||'?',logoUrl:x.info?.imageUrl||null,price:Number(x.priceUsd),liquidity:Number(x.liquidity?.usd||0),volume24h:Number(x.volume?.h24||0),change24h:Number(x.priceChange?.h24||0),provider:'DexScreener',chartAddress:x.pairAddress}))}
function dedupeMarkets(list){const m=new Map();for(const x of list){if(!x?.address||!(x.price>0))continue;const key=canonicalPair(x);if(!m.has(key)||(m.get(key).liquidity||0)<x.liquidity)m.set(key,x)}return [...m.values()].sort((a,b)=>b.liquidity-a.liquidity).slice(0,120)}
async function discoverMarkets(){
 // Search across multiple public market pages, rather than only page 1.
 // Each endpoint can be rate-limited; partial successful results are still usable.
 const tasks=[1,2,3,4,5].map(page=>publicJSON(GECKO+'/networks/sui/pools?include=base_token,quote_token&page='+page).then(geckoMarkets));
 for(const q of ['SUI','DEEP','TOILET','WAL','IKA','CETUS','NAVX','USDC'])tasks.push(publicJSON(DEX+'/latest/dex/search?q='+encodeURIComponent(q)).then(dexMarkets));
 const results=await Promise.allSettled(tasks);
 const list=dedupeMarkets(results.filter(x=>x.status==='fulfilled').flatMap(x=>x.value));
 if(!list.length)throw Error('Public market APIs unavailable or blocked by browser');
 return {markets:list,source:'GeckoTerminal / DexScreener'};
}
async function searchPublicMarkets(q){const tasks=[publicJSON(GECKO+'/search/pools?query='+encodeURIComponent(q)+'&network=sui&include=base_token,quote_token').then(geckoMarkets),publicJSON(DEX+'/latest/dex/search?q='+encodeURIComponent(q)).then(dexMarkets)];const results=await Promise.allSettled(tasks);const list=dedupeMarkets(results.filter(x=>x.status==='fulfilled').flatMap(x=>x.value));if(!list.length&&results.every(x=>x.status==='rejected'))throw Error('Search APIs unavailable');return {markets:list,source:'Public Sui market search'}}
async function publicCandles(address){const d=await publicJSON(GECKO+'/networks/sui/pools/'+encodeURIComponent(address)+'/ohlcv/minute?aggregate=5&limit=120&currency=usd&token=base');return {candles:(d.data?.attributes?.ohlcv_list||[]).map(v=>({time:v[0],open:v[1],high:v[2],low:v[3],close:v[4],volume:v[5]})).sort((a,b)=>a.time-b.time),source:'GeckoTerminal'}}
async function fetchFeaturedMarkets(){const missing=priorityPairs.filter(k=>!markets.some(m=>canonicalPair(m)===k));if(!missing.length)return;const results=await Promise.allSettled(missing.map(async pair=>{const d=await searchPublicMarkets(pair);return (d.markets||[]).filter(m=>canonicalPair(m)===pair&&Number(m.price)>0)}));if($('search').value.trim())return;for(const r of results)if(r.status==='fulfilled')for(const m of r.value){if(!markets.some(x=>canonicalPair(x)===canonicalPair(m)))markets.push(m)}markets=sortFeatured(markets);renderMarkets()}
function renderMarkets(){const el=$('markets');el.innerHTML=markets.filter(m=>marketFilter==='all'||(marketFilter==='gainers'?m.change24h>0:m.change24h<0)).map(m=>`<button class="market ${selected?.address===m.address?'selected':''}" data-address="${esc(m.address)}"><div class="market-identity"><span class="market-token-icon">${tokenLogo(m)}</span><span><strong>${esc(m.symbol)}</strong><small>${esc(m.name)}</small></span></div><div class="market-price"><b>${price(m.price)}</b><small class="${m.change24h>=0?'positive':'negative'}">${m.change24h>=0?'+':''}${m.change24h.toFixed(2)}%</small></div></button>`).join('')||'<p class="empty">No markets available.</p>';$('market-count').textContent=markets.length+' pairs';el.querySelectorAll('button').forEach(b=>b.onclick=()=>selectMarket(markets.find(m=>m.address===b.dataset.address)))}

function renderOrder(){const margin=Number($('margin').value),lev=Number($('leverage').value);$('leverage-label').textContent=lev+'×';$('degen-level').textContent=lev<=3?'🛡️ ROOKIE MODE · LOW RISK':lev<=8?'🔥 WARMING UP':lev<=14?'🚀 FULL SEND · HIGH RISK':'💀 ABSOLUTE MANIAC · EXTREME RISK';$('degen-level').classList.toggle('danger',lev>=15);$('notional').textContent=usd(margin*lev);$('entry').textContent=selected?price(selected.price):'—';$('fee').textContent=usd(margin*lev*.0005);const liq=selected?(side==='LONG'?selected.price*(1-1/lev):selected.price*(1+1/lev)):null;$('liq').textContent=liq&&liq>0?price(liq):'—';$('open').textContent='OPEN PAPER '+side+'';$('open').disabled=!selected||busy;$('long').classList.toggle('active',side==='LONG');$('short').classList.toggle('active',side==='SHORT')}
function renderPositions(){const tbody=$('positions');tbody.innerHTML=state.positions.length?state.positions.map(p=>{const v=Math.max(-p.margin,pnl(p));return `<tr class="degen-position ${v>=0?'winning':'losing'}"><td><b> ${v>=0?'🚀':'💀'} ${esc(p.symbol)}</b><small class="trade-mood">${v>=0?'TO THE MOON':'HOLDING THE BAG'}</small></td><td class="${p.side==='LONG'?'positive':'negative'}">${p.side}</td><td>${usd(p.margin)}</td><td>${p.leverage}×</td><td>${price(p.entryPrice)}</td><td>${price(current(p))}</td><td class="${v>=0?'positive':'negative'}">${usd(v)}</td><td><button class="outline close" data-id="${p.id}">Close</button></td></tr>`}).join(''):'<tr><td colspan="8" class="empty">No open positions</td></tr>';tbody.querySelectorAll('.close').forEach(b=>b.onclick=()=>closePosition(b.dataset.id));$('history').innerHTML=(state.history||[]).length?state.history.slice(0,15).map(h=>`<div class="history-row ${h.result>=0?'history-win':'history-loss'}"><span><span class="history-emoji">${h.result>=0?'🏆':'🪦'}</span> ${esc(h.symbol)} ${h.side} · ${new Date(h.closedAt).toLocaleString('en-US')}${h.liquidated?' · LIQUIDATED':''}</span><b class="${h.result>=0?'positive':'negative'}">${usd(h.result)}</b></div>`).join(''):'No closed trades yet.';renderBalances()}
function closePosition(id,liquidated=false){const i=state.positions.findIndex(p=>p.id===id);if(i<0)return;const p=state.positions[i],mark=current(p),result=liquidated?-p.margin:Math.max(-p.margin,pnl(p));const closingFee=liquidated?0:p.margin*p.leverage*.0005;state.cash+=Math.max(0,p.margin+result-closingFee);state.positions.splice(i,1);state.history.unshift({symbol:p.symbol,side:p.side,result:result-p.openFee-closingFee,closedAt:Date.now(),liquidated});save();renderPositions();toast(liquidated?'Paper liquidation: margin lost':'Paper position closed at last available price')}
function liquidations(){for(const p of [...state.positions])if(pnl(p)<=-p.margin)closePosition(p.id,true)}
function openPosition(){if(!selected||busy)return;const margin=Number($('margin').value),leverage=Number($('leverage').value),notional=margin*leverage,fee=notional*.0005;if(!Number.isFinite(margin)||margin<1||margin+fee>state.cash||leverage<1||leverage>20){$('order-error').textContent='Invalid margin or leverage, or insufficient virtual credits.';return}if(Date.now()-lastRefresh>90000){$('order-error').textContent='Stale price: wait for the next refresh.';return}const p={id:crypto.randomUUID(),address:selected.address,symbol:selected.symbol,side,margin,leverage,entryPrice:selected.price,lastPrice:selected.price,quantity:notional/selected.price,openFee:fee,openedAt:Date.now()};state.cash-=margin+fee;state.positions.push(p);save();$('order-error').textContent='';renderPositions();toast('Paper position '+side+' fictive opened on '+p.symbol);document.dispatchEvent(new CustomEvent('paperx:trade-opened',{detail:{side:p.side}}))}
function drawChart(){const el=$('chart');if(!candles.length){el.innerHTML='<div class="empty">No candles available for this pool.</div>';return}const W=920,H=340,pad={l:16,r:85,t:18,b:28};const low=Math.min(...candles.map(c=>c.low)),high=Math.max(...candles.map(c=>c.high)),span=Math.max(high-low,high*.00001);const y=v=>pad.t+(high-v)/span*(H-pad.t-pad.b),x=i=>pad.l+(i+.5)*(W-pad.l-pad.r)/candles.length,bw=Math.max(2,(W-pad.l-pad.r)/candles.length*.65);let s=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Real price candles">`;for(let i=0;i<5;i++){const v=low+span*i/4,yy=y(v);s+=`<line x1="0" y1="${yy}" x2="${W}" y2="${yy}" stroke="#253149" stroke-dasharray="3 5"/><text x="${W-80}" y="${yy-5}" fill="#9aaac4" font-size="12">${price(v)}</text>`}const maxVol=Math.max(1,...candles.map(c=>Number(c.volume)||0));candles.forEach((c,i)=>{const xx=x(i),col=c.close>=c.open?'#27d4a2':'#f06575',top=y(Math.max(c.open,c.close)),bottom=y(Math.min(c.open,c.close));s+=`<rect x="${xx-bw/2}" y="${H-pad.b-((Number(c.volume)||0)/maxVol)*42}" width="${bw}" height="${((Number(c.volume)||0)/maxVol)*42}" fill="${col}" opacity="0.27"/><line x1="${xx}" x2="${xx}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${col}" stroke-width="1.5"/><rect x="${xx-bw/2}" y="${top}" width="${bw}" height="${Math.max(1.4,bottom-top)}" fill="${col}"/>`});s+='</svg>';el.innerHTML=s;$('chart-time').textContent=new Date(candles[candles.length-1].time*1000).toLocaleString('en-US')+' · last candle'}
async function selectMarket(m){if(!m)return;selected=m;renderMarkets();$('pair').textContent=m.name;$('pool-meta').textContent='Pool '+m.address.slice(0,13)+'… · Liquidité '+usd(m.liquidity);$('last-price').textContent='$'+price(m.price);$('change').textContent=(m.change24h>=0?'+':'')+m.change24h.toFixed(2)+'% (24 h)';$('change').className=m.change24h>=0?'positive':'negative';renderOrder();candles=[];$('chart').innerHTML='<div class="empty">Loading real market candles…</div>';const address=m.address;if(m.provider==='DexScreener'){showDexChart(m);return}try{const d=await publicCandles(address);if(selected.address!==address)return;candles=d.candles||[];drawChart();$('chart-source').textContent='SOURCE: '+(d.source||'GeckoTerminal')+' · Historical 5-minute candles · Indicative prices'}catch(e){if(selected.address===address)showDexChart(selected)}}
function showDexChart(m){if(!m)return;const addr=encodeURIComponent(m.chartAddress||m.address);const full='https://dexscreener.com/sui/'+addr;const embed=full+'?embed=1&theme=dark&trades=0&info=0';$('chart').innerHTML='<div class="external-chart-notice">LIVE CHART · DEXSCREENER <a href="'+full+'" target="_blank" rel="noopener noreferrer">OPEN FULL CHART ↗</a></div><iframe class="external-chart" title="DexScreener Sui trading chart" loading="eager" src="'+embed+'"></iframe>';$('chart-source').textContent='SOURCE: DexScreener · External chart; availability depends on provider';$('chart-time').textContent='External chart'}

async function loadMarkets(){if(busy)return;busy=true;if(!markets.length)$('markets').innerHTML='<div class="market-loading"><b>⏳ Discovering Sui markets…</b><br>Fetching real pairs; this may take a few seconds.</div>';try{const d=await discoverMarkets();const newMarkets=d.markets||[];if(!newMarkets.length)throw Error('No Sui pools returned');marketSource=d.source||'GeckoTerminal';$('market-error').hidden=true;$('retry-markets').hidden=true;markets=sortFeatured(newMarkets);lastRefresh=Date.now();$('feed-status').textContent='● LIVE · '+marketSource+' · '+new Date().toLocaleTimeString('en-US');$('feed-status').className='pill live';if(selected){const updated=markets.find(m=>m.address===selected.address);if(updated){selected=updated;$('last-price').textContent='$'+price(selected.price);$('change').textContent=(selected.change24h>=0?'+':'')+selected.change24h.toFixed(2)+'% (24 h)';$('change').className=selected.change24h>=0?'positive':'negative'}}else if(markets.length)selectMarket(markets[0]);if(!$('search').value.trim())fetchFeaturedMarkets().catch(console.warn);liquidations();renderMarkets();renderPositions();renderOrder()}catch(e){$('feed-status').textContent='● DATA UNAVAILABLE';$('feed-status').className='pill error';if(!markets.length)$('markets').innerHTML='<p class="empty">Live Sui markets are temporarily unavailable.</p>';$('market-error').textContent='Live market discovery failed: '+e.message+'. Public data providers may be rate-limited or block browser access. Click Retry.';$('market-error').hidden=false;$('retry-markets').hidden=false;console.warn(e)}finally{busy=false}}
$('search').addEventListener('input',()=>{clearTimeout(searchTimer);const q=$('search').value.trim();if(!q){markets=[];loadMarkets();return}searchTimer=setTimeout(async()=>{try{const d=await searchPublicMarkets(q);markets=sortFeatured(d.markets||[]);renderMarkets();$('search-hint').textContent='GeckoTerminal results for “'+q+'”'}catch(e){$('search-hint').textContent='Search unavailable: '+e.message}},450)});
$('long').onclick=()=>{side='LONG';renderOrder()};$('short').onclick=()=>{side='SHORT';renderOrder()};$('margin').oninput=renderOrder;$('leverage').oninput=renderOrder;$('open').onclick=openPosition;$('reset').onclick=()=>{if(confirm('Reset your free 100,000 USDToilet balance and delete all paper positions and history?')){state={cash:100000,positions:[],history:[]};save();renderPositions();toast('Compte réinitialisé')}};$('clear-history').onclick=()=>{state.history=[];save();renderPositions()};renderPositions();renderOrder();loadMarkets();setInterval(()=>{if(!$('search').value.trim())loadMarkets()},30000);setInterval(()=>{if(selected)selectMarket(selected)},60000);

$('start-trading') && ($('start-trading').onclick=()=>{document.getElementById('trading-terminal').scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('search').focus({preventScroll:true}),650)});

$('retry-markets').onclick=()=>loadMarkets();
$('copy-token').onclick=async()=>{try{await navigator.clipboard.writeText($('token-address').textContent.trim());toast('Official TOILET token type copied')}catch{toast('Select and copy the token type manually')}};

// V7: server-synchronized limited event + honest, locally calculated community challenge.
// Event constants and state are initialized near the top of this file.
function virtualEquity(){return state.cash+state.positions.reduce((n,p)=>n+p.margin,0)+unreal()}
function challengePct(){return (virtualEquity()/EVENT_INITIAL-1)*100}
function getDegenRank(p){if(p<=-50)return {icon:'💀',name:'REKT LEGEND',color:'#ff3da6'};if(p<-10)return {icon:'🧻',name:'PAPER HANDS',color:'#ff9bcb'};if(p<10)return {icon:'🎰',name:'CERTIFIED DEGEN',color:'#b7ff00'};if(p<50)return {icon:'🚀',name:'MOON WALKER',color:'#b7ff00'};if(p<100)return {icon:'👑',name:'TOILET KING',color:'#ffd14b'};return {icon:'🌌',name:'GALACTIC FLUSH LORD',color:'#60efff'}}
function renderChallengeScore(){const p=challengePct();const rank=getDegenRank(p);const badge=$('degen-rank');if(badge){badge.textContent=rank.icon+' '+rank.name;badge.style.setProperty('--rank-color',rank.color)}const el=$('challenge-return');if(!el)return;el.textContent=(p>=0?'+':'')+p.toFixed(2)+'%';el.className='score-big '+(p>=0?'positive':'negative');$('challenge-equity').textContent=usd(virtualEquity())+' virtual equity';$('challenge-trades').textContent=state.history.length+' closed trades · '+state.positions.length+' open positions';const levelScore=$('level-four-pnl');if(levelScore){levelScore.textContent=(p>=0?'+':'')+p.toFixed(2)+'%';levelScore.classList.toggle('negative',p<0)}}
function updateEventClock(){if(!eventDeadline)return;const remain=Math.max(0,eventDeadline-(Date.now()+eventServerOffset));const n=Math.floor(remain/1000);const parts=[Math.floor(n/86400),Math.floor(n%86400/3600),Math.floor(n%3600/60),n%60];$('event-clock').innerHTML=parts.map((v,i)=>'<span>'+String(v).padStart(2,'0')+'<small>'+['DAYS','HRS','MIN','SEC'][i]+'</small></span>').join('');if(remain<=0&&!eventClosed)endEvent()}
function endEvent(){eventClosed=true;document.body.classList.add('event-ended');$('event-expired').hidden=false;$('open').disabled=true;if($('start-trading'))$('start-trading').disabled=true;$('screenshot-performance').disabled=false;$('share-x').disabled=false}
// Static hosting has no shared event server. The deadline is local to each browser.
function loadEvent(){const key='toiletpaperx-static-event-end-v1';let end=Number(localStorage.getItem(key));if(!Number.isFinite(end)||end<=0){end=Date.now()+7*86400000;localStorage.setItem(key,String(end))}eventDeadline=end;eventServerOffset=0;updateEventClock()}
// V38 Vice City performance cards: every background contains the two banner protagonists and Toilet DUST.
// No preprinted performance figures; all numbers below are computed from the live fictional portfolio.
const PUBLIC_SITE_URL='https://gore1988.github.io/toiletpaperx/';
const cardTiers=[
 {min:-Infinity,title:'WASTED · TOTAL REKT',color:'#ff477f',art:1},
 {min:-50,title:'REKT SURVIVOR',color:'#ff5c9d',art:2},
 {min:-25,title:'PAPER HANDS',color:'#ff83cb',art:3},
 {min:-10,title:'FLUSH ROOKIE',color:'#c990ff',art:4},
 {min:0,title:'MISSION STARTED',color:'#baff00',art:5},
 {min:5,title:'MISSION PASSED',color:'#baff00',art:6},
 {min:15,title:'MOON WALKER',color:'#62ffbd',art:7},
 {min:35,title:'TOILET CHAMPION',color:'#ffe34e',art:8},
 {min:100,title:'WHALE MODE · +100%',color:'#ffd057',art:9},
 {min:1000,title:'LEGENDARY DEGEN · +1000%',color:'#65efff',art:10}
];
function getCardTier(p){return [...cardTiers].reverse().find(t=>p>=t.min)||cardTiers[0]}
const cardImageCache=new Map();
function loadPerformanceCardImage(tier){
 const src='./cards/vice-performance-'+String(tier.art).padStart(2,'0')+'.jpg';
 if(!cardImageCache.has(src))cardImageCache.set(src,new Promise((resolve,reject)=>{
  const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Vice City card artwork unavailable: '+src));im.src=src;
 }));
 return cardImageCache.get(src);
}
function cardText(c,value,x,y,maxWidth,size,color,align='center'){
 c.save();c.textAlign=align;c.textBaseline='middle';c.font=`900 ${size}px Arial, sans-serif`;
 while(c.measureText(value).width>maxWidth&&size>17){size-=2;c.font=`900 ${size}px Arial, sans-serif`}
 c.shadowColor='#090213';c.shadowBlur=9;c.lineWidth=5;c.strokeStyle='#10051e';c.strokeText(value,x,y);
 c.fillStyle=color;c.fillText(value,x,y);c.restore();
}
async function drawCard(){
 const p=challengePct(),tier=getCardTier(p),bg=await loadPerformanceCardImage(tier);
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
 const c=canvas.getContext('2d');c.drawImage(bg,0,0,1280,720);
 const percent=(p>=0?'+':'')+p.toFixed(2)+'%';
 cardText(c,'TOILET PAPERX · VICE CITY',640,57,1120,43,'#ffffff');
 cardText(c,tier.title,640,462,1050,50,tier.color);
 cardText(c,percent,640,550,850,88,tier.color);
 cardText(c,'VIRTUAL EQUITY: '+usd(virtualEquity()),640,617,850,30,'#ffffff');
 cardText(c,state.history.length+' CLOSED TRADES   ·   '+state.positions.length+' OPEN POSITIONS',640,652,850,22,'#ffffff');
 cardText(c,'PLAY FREE AT '+PUBLIC_SITE_URL.replace(/^https?:\/\//,'')+' · FICTIONAL TRADING',640,690,1180,21,'#dfff00');
 return canvas;
}
async function savePerformanceCard(){
 try{const c=await drawCard();const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed')),'image/png'));const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='TOILET-PaperX-'+getCardTier(challengePct()).title.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+new Date().toISOString().slice(0,10)+'.png';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},30000);toast('PNG downloaded. Attach it to your X post!')}
 catch(e){console.error(e);toast('Could not create performance card: '+e.message)}
}
$('screenshot-performance').onclick=savePerformanceCard;
// Share to X: avoid the Windows native share sheet. X Web Intent cannot
// pre-attach a local PNG, so download the card and open a prefilled X post.
$('share-x').onclick=async()=>{
 const p=challengePct();
 const tier=getCardTier(p);
 const pct=(p>=0?'+':'')+p.toFixed(2)+'%';
 const postText=`🚀 My ToiletPaperX Vice City paper trading score: ${pct} — ${tier.title}!\n🎮 Real charts. Fake money. Zero risk. Full flush.\n#ToiletPaperX #SUI #ToiletDust`;
 // Open synchronously to avoid popup blockers while the PNG is generated.
 const composer=window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(postText)+'&url='+encodeURIComponent(PUBLIC_SITE_URL),'_blank');
 try{
  const canvas=await drawCard();
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed')),'image/png'));
  const filename='TOILET-PaperX-'+tier.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+new Date().toISOString().slice(0,10)+'.png';
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast(composer?'X opened and PNG downloaded. Attach the PNG to your post.':'PNG downloaded. Allow pop-ups for this site to open X, then attach the PNG.');
 }catch(err){console.error(err);toast('Could not generate the performance card: '+err.message)}
};
const originalOpen=$('open').onclick;$('open').onclick=()=>{if(eventClosed||!eventDeadline){toast('The challenge is closed or its deadline cannot be verified');return}originalOpen()};
loadEvent();setInterval(updateEventClock,1000);renderChallengeScore();

// V10 market discovery filters (real data only).
document.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>{marketFilter=b.dataset.filter;document.querySelectorAll('.filter-btn').forEach(x=>x.classList.toggle('active',x===b));renderMarkets()}));

// V19: jump straight into the paper terminal and reuse the tested card/X actions.
$('join-challenge')?.addEventListener('click',e=>{e.preventDefault();$('trading-terminal').scrollIntoView({behavior:'smooth',block:'start'})});
$('level-four-download')?.addEventListener('click',()=> $('screenshot-performance').click());
$('level-four-share')?.addEventListener('click',()=> $('share-x').click());

// V27 — distinct Web Audio arcade sound cues. Audio starts only after a user gesture.
(() => {
  let soundOn = true, audioCtx = null;
  const soundButton = document.getElementById('sound-toggle');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function context(){
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
  }
  function note(ctx, freq, start, duration, shape='square', volume=.16, endFreq=null){
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type=shape;
    osc.frequency.setValueAtTime(Math.max(30,freq),start);
    if(endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),start+duration);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(volume,start+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(start);osc.stop(start+duration+.015);
  }
  function sound(kind){
    if(!soundOn)return;
    try{
      const ctx=context(), t=ctx.currentTime+.008;
      const sequence=(arr,spacing=.08,shape='square',vol=.15)=>arr.forEach((f,i)=>note(ctx,f,t+i*spacing,.11,shape,vol));
      if(kind==='pick')sequence([370,555,740],.065,'square',.16);
      else if(kind==='leverage'){note(ctx,180,t,.25,'sawtooth',.15,820);note(ctx,500,t+.18,.12,'square',.12,960)}
      else if(kind==='flex')sequence([523,659,784,1047],.085,'triangle',.19);
      else if(kind==='challenge')sequence([392,523,659,784,1047],.095,'square',.16);
      else if(kind==='battle'){note(ctx,180,t,.18,'sawtooth',.19,380);sequence([440,660,880],.085,'square',.15)}
      else if(kind==='trade'){ // Exclusive successful order cue: bass punch, laser sweep, victory burst.
        note(ctx,95,t,.30,'sawtooth',.24,55);
        note(ctx,240,t+.10,.36,'sawtooth',.19,1280);
        [784,988,1175,1568].forEach((f,i)=>note(ctx,f,t+.38+i*.08,.16,'square',.20));
      }
      else if(kind==='loss')sequence([440,330],.08,'triangle',.13);
      else if(kind==='slide')note(ctx,480,t,.045,'triangle',.10);
      else sequence([560,720],.065,'square',.13);
    }catch(err){console.debug('Arcade sound unavailable',err)}
  }
  soundButton?.addEventListener('click',()=>{
    soundOn=!soundOn;
    soundButton.textContent=soundOn?'🔊 SOUND ON':'🔇 SOUND OFF';
    soundButton.setAttribute('aria-pressed',String(soundOn));
    soundButton.title=soundOn?'Disable arcade sound effects':'Enable arcade sound effects';
    if(soundOn)sound('flex');
  });
  document.addEventListener('paperx:trade-opened',()=>{
    sound('trade');
    const btn=document.getElementById('open');
    if(btn&&!reduceMotion.matches){btn.classList.remove('paperx-trade-burst');void btn.offsetWidth;btn.classList.add('paperx-trade-burst')}
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest('button, a, .v26-hero-jump');
    if(!el||el===soundButton||el.disabled)return;
    const label=(el.textContent||'').trim().toUpperCase();
    let kind='tap';
    if(el.classList.contains('v21-hero-character'))kind='battle';
    else if(el.classList.contains('v21-hero-trophy'))kind='challenge';
    else if(el.closest('.v21-hero-steps'))kind=label.includes('PICK')?'pick':label.includes('LEVERAGE')?'leverage':label.includes('FLEX')?'flex':'tap';
    else if(el.id==='join-challenge')kind='challenge';
    else if(el.id==='open')kind=null; // Played only after a successful position opening.
    else if(el.classList.contains('close'))kind='loss';
    if(kind)sound(kind);
    if(!reduceMotion.matches){el.classList.remove('arcade-pressed');void el.offsetWidth;el.classList.add('arcade-pressed');el.addEventListener('animationend',()=>el.classList.remove('arcade-pressed'),{once:true})}
  },true);
  const leverage=document.getElementById('leverage');let lastSlide=0;
  leverage?.addEventListener('input',()=>{if(Date.now()-lastSlide>100){sound('slide');lastSlide=Date.now()}});
})();

// V26: both hero illustrations scroll to the trading terminal; keyboard accessible.
document.querySelectorAll('.v26-hero-jump').forEach(el => {
  const jump = () => document.getElementById('trading-terminal')?.scrollIntoView({behavior:'smooth',block:'start'});
  el.addEventListener('click', jump);
  el.addEventListener('keydown', e => {
    if(e.key === 'Enter' || e.key === ' '){e.preventDefault();jump();}
  });
});
