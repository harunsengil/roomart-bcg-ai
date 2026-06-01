import { useState, useRef } from 'react'
import { Play, Square, RotateCcw, Flame, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

const PRODUCTS = ['Çamaşır Makinesi Dolabı','Banyo Dolabı','Mutfak Adası','Kitaplıklı Çalışma Masası','Sehpa']
const FIREBASE_URL = 'https://roomart-bcg-ai-default-rtdb.europe-west1.firebasedatabase.app'
const MODEL = 'openai/gpt-oss-120b:free'
const BCG_COLORS = {
  'Star':          { bg:'bg-yellow-500/10', text:'text-yellow-400', border:'border-yellow-500/30' },
  'Cash Cow':      { bg:'bg-green-500/10',  text:'text-green-400',  border:'border-green-500/30'  },
  'Question Mark': { bg:'bg-blue-500/10',   text:'text-blue-400',   border:'border-blue-500/30'   },
  'Dog':           { bg:'bg-red-500/10',    text:'text-red-400',    border:'border-red-500/30'    },
}
function parseBCG(t) {
  const u = t.toUpperCase()
  if (u.includes('STAR')||u.includes('YILDIZ')) return 'Star'
  if (u.includes('CASH')||u.includes('NAKİT')||u.includes('NAKIT')) return 'Cash Cow'
  if (u.includes('QUESTION')||u.includes('SORU')) return 'Question Mark'
  return 'Dog'
}
async function callOpenRouter(apiKey, system, userMessage) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://harunsengil.github.io/roomart-bcg-ai/',
      'X-Title': 'RoomArt BCG Intelligence'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage }
      ]
    })
  })
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error?.message||`HTTP ${res.status}`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}
async function writeFirebase(product, payload) {
  const key = product.replace(/\s+/g,'_').replace(/[^\w\u00C0-\u024F]/g,'')
  const res = await fetch(`${FIREBASE_URL}/bcg_results/${key}.json`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,updatedAt:new Date().toISOString()})})
  return res.ok
}
export default function BatchRunner() {
  const [apiKey,setApiKey] = useState('')
  const [results,setResults] = useState(PRODUCTS.map(()=>({status:'pending',bcg:null})))
  const [logs,setLogs] = useState([{type:'info',msg:"OpenRouter API key gir ve Başlat'a tıkla."}])
  const [running,setRunning] = useState(false)
  const [stats,setStats] = useState({done:0,err:0,fire:0,elapsed:null})
  const stopRef = useRef(false)
  const startRef = useRef(null)
  const addLog = (msg,type='info') => { const t=new Date().toTimeString().slice(0,8); setLogs(p=>[...p.slice(-80),{type,msg,t}]) }
  const updateResult = (i,patch) => setResults(p=>p.map((r,idx)=>idx===i?{...r,...patch}:r))
  const reset = () => { if(running)return; setResults(PRODUCTS.map(()=>({status:'pending',bcg:null}))); setLogs([{type:'info',msg:'Sıfırlandı.'}]); setStats({done:0,err:0,fire:0,elapsed:null}) }
  const run = async () => {
    if(running)return
    if(!apiKey.trim()){addLog('OpenRouter API key gerekli!','err');return}
    stopRef.current=false; setRunning(true); startRef.current=Date.now()
    let done=0,err=0,fire=0
    addLog(`━━━ Batch başladı (${MODEL}) ━━━`,'ok')
    for(let i=0;i<PRODUCTS.length;i++){
      if(stopRef.current){addLog('Durduruldu.','warn');break}
      const product=PRODUCTS[i]
      updateResult(i,{status:'running',bcg:null})
      addLog(`[${i+1}/5] ${product}`,'info')
      try{
        addLog('  ↳ Pazarlama Direktörü…','info')
        const mkt = await callOpenRouter(apiKey,'Sen Akar Mutfak Mobilyaları Pazarlama Direktörüsün. Rakipler: Rani Mobilya, Kenzlife, Bofigo. Türkçe, 2 paragraf, sayısal tahminlerle.',`BCG analizi: "${product}" — pazar büyümesi ve rekabetçi konum.`)
        addLog('  ↳ IT Direktörü…','info')
        const it = await callOpenRouter(apiKey,'Sen Akar Mutfak Mobilyaları IT Direktörüsün. Pazarlama analizindeki veri güvenilirliğini değerlendir. Türkçe, 2 paragraf.',`Ürün: "${product}"\nPazarlama:\n${mkt}\n\nVeri güvenilirliği?`)
        addLog('  ↳ Strateji Direktörü (JSON)…','info')
        const csoRaw = await callOpenRouter(apiKey,`Sen Akar Mutfak Mobilyaları Strateji Direktörüsün. YALNIZCA şu JSON ile yanıt ver, başka hiçbir şey yazma:\n{"bcg":"Star|Cash Cow|Question Mark|Dog","gerekce":"max 1 cümle","strateji":"max 1 cümle","metrikler":["m1","m2","m3"]}`,`Ürün: "${product}"\nPazarlama: ${mkt.slice(0,400)}\nIT: ${it.slice(0,300)}\n\nBCG kararı ver.`)
        let cso={}
        try{cso=JSON.parse(csoRaw.replace(/```json|```/g,'').trim())}
        catch{cso={bcg:parseBCG(csoRaw),gerekce:csoRaw.slice(0,120),strateji:'—',metrikler:[]};addLog('  ⚠ JSON fallback','warn')}
        const bcgLabel=cso.bcg||parseBCG(cso.gerekce||'')
        updateResult(i,{status:'done',bcg:bcgLabel})
        done++; addLog(`  ✓ ${product} → ${bcgLabel}`,'ok')
        const ok=await writeFirebase(product,{product,bcgSquare:bcgLabel,strategy:cso.strateji,metrics:cso.metrikler,rationale:cso.gerekce,mktSummary:mkt.slice(0,500),itSummary:it.slice(0,300)})
        if(ok){fire++;addLog('  🔥 Firebase yazıldı','fire')}else addLog('  ⚠ Firebase yazma başarısız','warn')
      }catch(e){updateResult(i,{status:'error'});err++;addLog(`  ✗ ${product}: ${e.message}`,'err')}
      setStats({done,err,fire,elapsed:((Date.now()-startRef.current)/1000).toFixed(1)})
      if(i<PRODUCTS.length-1&&!stopRef.current){addLog('  ⏳ 3 sn…','info');await new Promise(r=>setTimeout(r,3000))}
    }
    setStats(s=>({...s,elapsed:((Date.now()-startRef.current)/1000).toFixed(1)}))
    addLog(`━━━ Bitti — ${done} başarı, ${err} hata, ${fire} Firebase yazma ━━━`,'ok')
    setRunning(false)
  }
  const logColors={info:'text-white/30',ok:'text-green-400/70',warn:'text-yellow-400/70',err:'text-red-400/70',fire:'text-orange-400/70'}
  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-5 space-y-4" style={{background:'var(--bg-card)',borderColor:'var(--border)'}}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg tracking-widest text-white uppercase">BCG Batch Runner</h2>
            <p className="text-xs font-mono mt-0.5" style={{color:'var(--text-muted)'}}>3 ajan × 5 ürün → Roundtable → Firebase</p>
          </div>
          <div className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg border ${running?'text-yellow-400 bg-yellow-500/10 border-yellow-500/30 animate-pulse':stats.done>0?'text-green-400 bg-green-500/10 border-green-500/30':'border-white/10'}`} style={!running&&stats.done===0?{color:'var(--text-muted)'}:{}}>
            <Clock size={12}/>{running?'ÇALIŞIYOR':stats.done>0?'TAMAMLANDI':'BEKLEMEDE'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono tracking-widest shrink-0" style={{color:'var(--text-muted)'}}>OPENROUTER KEY</label>
          <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-or-..." className="flex-1 bg-black/30 border rounded-lg px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-yellow-500/50 transition-colors placeholder:text-white/15" style={{borderColor:'var(--border-subtle)'}} disabled={running}/>
          <button onClick={run} disabled={running||!apiKey.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-medium tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed" style={{background:'var(--gold)',color:'#000'}}><Play size={12}/>BAŞLAT</button>
          <button onClick={()=>{stopRef.current=true}} disabled={!running} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono border border-white/10 text-white/50 hover:border-red-500/40 hover:text-red-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"><Square size={12}/></button>
          <button onClick={reset} disabled={running} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono border border-white/10 text-white/50 hover:border-white/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"><RotateCcw size={12}/></button>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border overflow-hidden" style={{background:'var(--bg-card)',borderColor:'var(--border)'}}>
          <div className="px-4 py-3 border-b text-xs font-mono tracking-widest uppercase" style={{borderColor:'var(--border-subtle)',color:'var(--text-muted)'}}>Ürün Kuyruğu</div>
          <div className="divide-y" style={{borderColor:'var(--border-subtle)'}}>
            {PRODUCTS.map((p,i)=>{
              const r=results[i]; const bcgStyle=r.bcg?BCG_COLORS[r.bcg]:null
              return(<div key={p} className={`flex items-center gap-3 px-4 py-3 transition-colors ${r.status==='running'?'bg-yellow-500/5':r.status==='done'?'bg-green-500/3':''}`}>
                <span className="text-xs font-mono w-5 shrink-0" style={{color:'var(--text-muted)'}}>{String(i+1).padStart(2,'0')}</span>
                <span className={`flex-1 text-xs font-mono ${r.status==='running'?'text-yellow-300':r.status==='done'?'text-green-300':'text-white/40'}`}>{p}</span>
                {r.bcg&&bcgStyle?(<span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${bcgStyle.bg} ${bcgStyle.text} ${bcgStyle.border}`}>{r.bcg}</span>):r.status==='running'?(<span className="text-[10px] font-mono text-yellow-400/60 animate-pulse">analiz…</span>):(<span className="text-[10px] font-mono text-white/15">—</span>)}
                <span className="text-xs shrink-0">{r.status==='done'?<CheckCircle size={13} className="text-green-400"/>:r.status==='error'?<AlertTriangle size={13} className="text-red-400"/>:r.status==='running'?<Clock size={13} className="text-yellow-400 animate-spin"/>:<span className="w-3 h-3 rounded-full border border-white/10 inline-block"/>}</span>
              </div>)
            })}
          </div>
        </div>
        <div className="rounded-xl border flex flex-col" style={{background:'var(--bg-card)',borderColor:'var(--border)'}}>
          <div className="px-4 py-3 border-b text-xs font-mono tracking-widest uppercase shrink-0" style={{borderColor:'var(--border-subtle)',color:'var(--text-muted)'}}>Çalışma Logu</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-0.5 font-mono text-[11px]" style={{maxHeight:280}}>
            {logs.map((l,i)=>(<div key={i} className="flex gap-3"><span className="text-white/15 shrink-0">{l.t||'—'}</span><span className={logColors[l.type]||'text-white/30'}>{l.msg}</span></div>))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[{label:'Tamamlanan',val:stats.done,color:'text-green-400'},{label:'Hata',val:stats.err,color:'text-red-400'},{label:'Firebase',val:stats.fire,color:'text-orange-400',icon:<Flame size={12}/>},{label:'Süre (sn)',val:stats.elapsed??'—',color:'text-white/60'}].map(s=>(
          <div key={s.label} className="rounded-xl border p-4 text-center" style={{background:'var(--bg-card)',borderColor:'var(--border)'}}>
            <div className={`font-display text-2xl font-bold tracking-wider ${s.color} flex items-center justify-center gap-1`}>{s.icon}{s.val}</div>
            <div className="text-[9px] font-mono tracking-widest uppercase mt-1" style={{color:'var(--text-muted)'}}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
