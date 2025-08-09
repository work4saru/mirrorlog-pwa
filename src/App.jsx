import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = window.ENV_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_ANON_KEY || ''
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
const VAPID_PUBLIC = window.ENV_VAPID_PUBLIC_KEY || ''

let supabase = null
if (SUPABASE_ENABLED) supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function usePWA(){
  useEffect(()=>{
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(()=>{}) }
  },[])
}

function Splash({ onUnlock }){
  const [ripples, setRipples] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{ const t = setTimeout(()=>setLoading(false),900); return ()=>clearTimeout(t)},[])

  function addRipple(e){
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const id = crypto.randomUUID()
    setRipples(rs => [...rs, { id, x, y }])
    setTimeout(()=>setRipples(rs => rs.filter(r => r.id !== id)), 800)
  }

  async function tryBiometric(){
    try{
      if (!('PublicKeyCredential' in window)) throw new Error('no webauthn')
      const challenge = new Uint8Array(32); crypto.getRandomValues(challenge)
      await navigator.credentials.create({ publicKey: { challenge, rp:{name:'Mirrorlog'}, user:{id:new Uint8Array(16),name:'user',displayName:'user'}, pubKeyCredParams:[{type:'public-key', alg:-7}], authenticatorSelection:{ userVerification:'required' } } })
      onUnlock()
    }catch(e){
      if (confirm('Biometric not available here. Continue?')) onUnlock()
    }
  }

  return (
    <div className="center" style={{minHeight:'100vh'}}>
      <div className="stack" style={{alignItems:'center'}}>
        <div className="mirror center" role="button" aria-label="Mirror" onClick={addRipple} style={{position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute', inset:0, background:'radial-gradient(circle at 30% 20%, rgba(255,255,255,.7), transparent 60%)'}}/>
          {ripples.map(r => (
            <span key={r.id} style={{position:'absolute', left:r.x-5, top:r.y-5, width:10, height:10, borderRadius:'999px', boxShadow:'0 0 0 0 rgba(59,130,246,0.35)', animation:'ripple .8s ease-out forwards'}}/>
          ))}
          <div style={{position:'relative', zIndex:1, fontSize:42}}>🪞</div>
        </div>
        <h1>Mirrorlog</h1>
        <p className="muted">A calm space to reflect, grow, and remember.</p>
        {loading ? <div className="muted">Preparing your space…</div> : (
          <div className="stack" style={{alignItems:'stretch', minWidth:320}}>
            <button className="btn" onClick={tryBiometric}>Unlock with Face ID / Touch ID</button>
            <button className="btn secondary" onClick={onUnlock}>Enter without biometrics</button>
          </div>
        )}
        <p className="muted">Install to Home Screen for 1‑tap access. Works offline.</p>
      </div>
    </div>
  )
}

function useStreak(entries){
  return useMemo(()=>{
    if(!entries.length) return 0
    const days = new Set(entries.map(e => new Date(e.created).toDateString()))
    let streak = 0; const d = new Date()
    while(true){ const k = d.toDateString(); if(days.has(k)){ streak++; d.setDate(d.getDate()-1)} else break }
    return streak
  },[entries])
}

async function ensurePushPermission(){
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission==='granted') return 'granted'
  if (Notification.permission==='denied') return 'denied'
  return await Notification.requestPermission()
}
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i=0;i<rawData.length;++i) outputArray[i]=rawData.charCodeAt(i)
  return outputArray
}
async function subscribePush(){
  if (!('serviceWorker' in navigator)) return null
  if (!VAPID_PUBLIC) return null
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) return sub
  return reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) })
}

export default function App(){
  const [unlocked, setUnlocked] = useState(false)
  const [entries, setEntries] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [chunks, setChunks] = useState([])
  const [note, setNote] = useState("")
  const [reminder, setReminder] = useState("off")
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const timerRef = useRef(null)

  usePWA()
  const streak = useStreak(entries)

  useEffect(()=>{
    if (videoRef.current && streamRef.current && !isRecording){
      videoRef.current.srcObject = streamRef.current
    }
  },[isRecording])

  async function startRecording(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'user'}, audio:true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=h264') ? 'video/mp4;codecs=h264' :
        (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
      const mr = new MediaRecorder(stream, { mimeType })
      const local = []
      mr.ondataavailable = e => { if (e.data.size>0) local.push(e.data) }
      mr.onstop = () => setChunks(local)
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true); setDuration(0)
      timerRef.current = setInterval(()=> setDuration(d => d+1), 1000)
      setTimeout(()=>{ /* cap at 10 mins for MVP */ }, 0)
    }catch(e){
      alert('Camera & mic needed. Please allow.')
    }
  }
  function stopRecording(){
    if (mediaRecorderRef.current && mediaRecorderRef.current.state!=='inactive') mediaRecorderRef.current.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setIsRecording(false)
    if (streamRef.current){ streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null }
  }

  async function saveEntry(){
    if (!chunks.length) return
    const blob = new Blob(chunks, { type: chunks[0].type || 'video/webm' })
    const url = URL.createObjectURL(blob)
    const entry = { id: crypto.randomUUID(), url, blob, created: new Date().toISOString(), duration, note, reminder, type:'anchor', tags:[], highlight:false }
    setEntries(e => [entry, ...e])
    setChunks([]); setDuration(0); setNote("")

    // Push opt-in when reminder set
    if (reminder!=='off'){
      const perm = await ensurePushPermission()
      if (perm==='granted'){ await subscribePush() }
    }
    // TODO: Upload to Supabase if keys are present (left out to keep demo minimal)
  }

  function downloadEntry(entry){
    const a = document.createElement('a'); a.href = entry.url; a.download = `mirrorlog_${entry.id}.webm`; a.click()
  }

  if (!unlocked) return <Splash onUnlock={()=>setUnlocked(true)} />

  return (
    <div>
      <div className="header">
        <div className="container center" style={{justifyContent:'space-between', padding:'10px 16px'}}>
          <div className="row">
            <div className="pill">🪞 Mirrorlog</div>
            <div className="badge">Streak {streak}d</div>
          </div>
          <div className="muted">{SUPABASE_ENABLED ? 'Cloud-ready' : 'Local demo'}</div>
        </div>
      </div>

      <div className="container" style={{paddingTop:20}}>
        <div className="card" style={{padding:16, marginBottom:16}}>
          <div className="stack">
            <div className="row">
              <div className="badge">Anchor (10m cap)</div>
              <div className="row">
                <label className="muted">Reminder:</label>
                <select className="pill" value={reminder} onChange={e=>setReminder(e.target.value)}>
                  <option value="off">Off</option>
                  <option value="7">Every 7 days</option>
                  <option value="30">Every 30 days</option>
                </select>
              </div>
            </div>

            <div className="video-shell">
              <div style={{aspectRatio:'16/9'}}>
                <video ref={videoRef} autoPlay muted playsInline style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              </div>
              <div className="row" style={{justifyContent:'space-between', padding:12}}>
                <div className="row">
                  <span className="badge">Elapsed {Math.floor(duration/60)}:{String(duration%60).padStart(2,'0')}</span>
                </div>
                <div className="row">
                  {!isRecording ? (
                    <button className="btn" onClick={startRecording}>Start</button>
                  ) : (
                    <button className="btn destructive" onClick={stopRecording}>Stop</button>
                  )}
                  {!isRecording && chunks.length>0 && (
                    <button className="btn" onClick={saveEntry}>Save Entry</button>
                  )}
                </div>
              </div>
            </div>

            <input className="input" placeholder="Optional note…" value={note} onChange={e=>setNote(e.target.value)} />
          </div>
        </div>

        <div className="card" style={{padding:16}}>
          <h3>Your reflections</h3>
          <div className="grid" style={{marginTop:12}}>
            {entries.map(e => (
              <div key={e.id} className="card" style={{padding:12}}>
                <video src={e.url} controls style={{width:'100%'}}/>
                <div className="row" style={{justifyContent:'space-between', marginTop:8}}>
                  <span className="muted">{new Date(e.created).toLocaleString()}</span>
                  <span className="muted">{Math.floor(e.duration/60)}:{String(e.duration%60).padStart(2,'0')}</span>
                </div>
                {e.note && <p>{e.note}</p>}
                <div className="row" style={{justifyContent:'flex-end'}}>
                  <button className="btn secondary" onClick={()=>downloadEntry(e)}>Export</button>
                </div>
              </div>
            ))}
          </div>
          {entries.length===0 && <div className="muted center" style={{padding:24}}>Your reflections will appear here. Record one to get started.</div>}
        </div>
      </div>
    </div>
  )
}
