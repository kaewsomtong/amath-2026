'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { computeStandings, computeMatchResult, suggestGibsonize, AM_MAX_DIFF_FINAL, Player, GameRow, Standing } from '@/lib/am-logic'
import * as XLSX from 'xlsx'

type Level = 'มต้น' | 'มปลาย'

interface PairingRow { pair_num: number; player_a: Player; player_b: Player | null; is_bye: boolean }
interface PlayoffRow { round: string; pair_num: number; player_a: Player; player_b: Player; score_a: number | null; score_b: number | null }

const PRIMARY = 'linear-gradient(135deg,#0284C7,#38BDF8)'


function PastGamesSection({ pairings, gameRows, latestGame, totalGames, disp }: {
  pairings: Record<number, { pair_num: number; player_a: Player; player_b: Player | null; is_bye: boolean }[]>
  gameRows: GameRow[]; latestGame: number; totalGames: number; disp: (p: Player) => string
}) {
  const [show, setShow] = useState(false)
  const [viewGame, setViewGame] = useState(1)
  if (latestGame < 2) return null
  const rows = pairings[viewGame] || []
  const gr = gameRows.filter(g => g.game === viewGame)
  return (
    <div className="bg-white rounded-2xl border border-sky-100 shadow overflow-hidden">
      <button onClick={() => setShow(v => !v)} className="w-full p-5 flex justify-between items-center font-black text-sky-700 hover:bg-sky-50 transition">
        <span>📋 ผลเกมย้อนหลัง</span>
        <span className="text-sky-300">{show ? '▲' : '▼'}</span>
      </button>
      {show && (
        <div className="border-t border-sky-50 p-4">
          <div className="flex gap-2 flex-wrap mb-3">
            {Array.from({ length: latestGame }, (_, i) => i + 1).map(g => (
              <button key={g} onClick={() => setViewGame(g)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs border-2 transition ${viewGame === g ? 'text-white border-transparent' : 'border-sky-200 text-sky-600 bg-sky-50'}`}
                style={viewGame === g ? { background: 'linear-gradient(135deg,#0284C7,#38BDF8)' } : {}}>
                เกม {g}{g === totalGames ? ' ★' : ''}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            {rows.map(r => {
              const res = gr.find(g => g.pair_num === r.pair_num)
              return (
                <div key={r.pair_num} className="flex gap-2 items-center bg-sky-50 rounded-xl px-3 py-2 border border-sky-100 text-xs">
                  <span className="font-black text-sky-600 min-w-[40px]">โต๊ะ {r.pair_num}</span>
                  {r.is_bye
                    ? <span className="text-sky-400 flex-1">🎁 {disp(r.player_a)} ({r.player_a.code}) — BYE</span>
                    : <span className="flex-1">{disp(r.player_a)} ({r.player_a.code}) VS {r.player_b ? `${disp(r.player_b)} (${r.player_b.code})` : '—'}</span>
                  }
                  {!r.is_bye && res && res.score_a !== null
                    ? <span className="font-black text-sky-700 shrink-0">{res.score_a} – {res.score_b}</span>
                    : !r.is_bye && <span className="text-gray-300 shrink-0">—</span>
                  }
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function QRSection() {
  const [show, setShow] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/display` : '/display'
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
  return (
    <div className="bg-white rounded-2xl border border-sky-100 shadow overflow-hidden">
      <button onClick={() => setShow(v => !v)} className="w-full p-5 flex justify-between items-center font-black text-sky-700 hover:bg-sky-50 transition">
        <span>📱 QR Code หน้าจอแสดงผล</span>
        <span className="text-sky-300">{show ? '▲' : '▼'}</span>
      </button>
      {show && (
        <div className="border-t border-sky-50 p-5 flex flex-col items-center gap-3">
          <img src={qrUrl} alt="QR Code" className="w-40 h-40 rounded-xl border border-sky-100" />
          <p className="text-xs text-sky-500 font-semibold text-center break-all">{url}</p>
          <p className="text-xs text-sky-300">สแกนเพื่อเปิดหน้าจอแสดงผลบนอุปกรณ์อื่น</p>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const [level, setLevel] = useState<Level>('มต้น')
  const [players, setPlayers] = useState<Player[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [gameRows, setGameRows] = useState<GameRow[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [pairings, setPairings] = useState<Record<number, PairingRow[]>>({})
  const [playoffs, setPlayoffs] = useState<PlayoffRow[]>([])
  const [latestGame, setLatestGame] = useState(0)
  const [totalGames, setTotalGames] = useState(3)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingGame, setLoadingGame] = useState<number | null>(null)
  const prevProgressRef = useRef<number>(0)
  const initializedRef = useRef(false)

  const [showPlayers, setShowPlayers] = useState(false)
  const [showStandings, setShowStandings] = useState(false)

  // Add player form
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [newMember2, setNewMember2] = useState('')
  const [newLevel, setNewLevel] = useState<Level>('มต้น')

  // Edit player
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editSchool, setEditSchool] = useState('')
  const [editMember2, setEditMember2] = useState('')

  // Bulk import
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<{ code: string; name: string; school: string; member2: string; level: string }[]>([])
  const [importLoading, setImportLoading] = useState(false)

  // Gibsonize
  const [gibsonInput, setGibsonInput] = useState('')
  const [gibsonSuggest, setGibsonSuggest] = useState<{ code: string; name: string; rank: number; points: number }[] | null>(null)

  // Broadcast
  const [announcement, setAnnouncement] = useState('')
  const [announceLoading, setAnnounceLoading] = useState(false)

  const disp = (p: Player) => p.member2 ? `${p.name} + ${p.member2}` : p.name

  const loadData = useCallback(async () => {
    const [{ data: p }, { data: g }, pfRes, settingsRes] = await Promise.all([
      supabase.from('am_players').select('*').eq('level', level).order('code'),
      supabase.from('am_games').select('*').eq('level', level),
      fetch(`/api/playoffs?level=${encodeURIComponent(level)}`).then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ])
    const ps = (p || []) as Player[]
    const gs = (g || []) as GameRow[]
    const tot = settingsRes.totalGames || 3
    setPlayers(ps); setGameRows(gs); setTotalGames(tot)
    setStandings(computeStandings(ps, gs, tot))
    setPlayoffs((pfRes || []) as PlayoffRow[])

    const { data: pa } = await supabase.from('am_pairings')
      .select('*, player_a:player_a_id(*), player_b:player_b_id(*)')
      .eq('level', level).order('game').order('pair_num')
    const byGame: Record<number, PairingRow[]> = {}
    let maxGame = 0
    for (const row of (pa || [])) {
      if (!byGame[row.game]) byGame[row.game] = []
      byGame[row.game].push(row as unknown as PairingRow)
      if (row.game > maxGame) maxGame = row.game
    }
    setPairings(byGame); setLatestGame(maxGame)
  }, [level])

  const loadAllPlayers = useCallback(async () => {
    const { data } = await supabase.from('am_players').select('*').order('level').order('code')
    setAllPlayers((data || []) as Player[])
  }, [])

  useEffect(() => { loadData(); loadAllPlayers() }, [loadData, loadAllPlayers])
  useEffect(() => { if (showPlayers) loadAllPlayers() }, [showPlayers, loadAllPlayers])

  // Realtime — อัปเดตความคืบหน้า/อันดับ/เสียงเตือน เมื่อเครื่องกรอกคะแนนส่งผลเข้ามา
  useEffect(() => {
    const ch = supabase.channel(`admin-${level}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'am_games', filter: `level=eq.${level}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'am_pairings', filter: `level=eq.${level}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'am_playoffs', filter: `level=eq.${level}` }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [level, loadData])

  useEffect(() => {
    if (!latestGame) return
    const { scored, total } = getGameProgress(latestGame)
    if (!initializedRef.current) {
      // ครั้งแรกที่โหลด — จำค่าปัจจุบันไว้โดยไม่ดังเสียง
      initializedRef.current = true
      prevProgressRef.current = scored
      return
    }
    if (total > 0 && scored === total && prevProgressRef.current < total) {
      setStatus({ msg: `🎉 กรอกครบแล้วทุกคู่! (เกม ${latestGame}) พร้อมจัดคู่เกมต่อไป`, ok: true })
      playBeep()
    }
    prevProgressRef.current = scored
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameRows, latestGame])

  async function generatePairings(game: number) {
    setLoading(true); setLoadingGame(game); setStatus(null)
    const gibsonCodes = game === totalGames && gibsonInput.trim()
      ? gibsonInput.split(',').map(s => s.trim()).filter(Boolean)
      : []
    const res = await fetch('/api/pairings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, game, gibsonCodes }),
    })
    const data = await res.json()
    if (!res.ok) setStatus({ msg: data.error, ok: false })
    else { setStatus({ msg: `✅ จัดเกม ${game} เรียบร้อย`, ok: true }); await loadData() }
    setLoading(false); setLoadingGame(null)
  }

  async function generatePlayoff() {
    setLoading(true); setStatus(null)
    const res = await fetch('/api/playoffs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', level }),
    })
    const data = await res.json()
    if (!res.ok) setStatus({ msg: data.error, ok: false })
    else { setStatus({ msg: '✅ สร้างรอบชิงชนะเลิศสำเร็จ', ok: true }); await loadData() }
    setLoading(false)
  }

  async function setTotalGamesTo(n: number) {
    const clamped = Math.max(1, n)
    if (clamped < latestGame && !confirm(`⚠️ จัดคู่ไปแล้ว ${latestGame} เกม การลดเหลือ ${clamped} เกมจะทำให้ระบบใช้ cap ±200 ผิดเกม\nยืนยันหรือไม่?`)) return
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setTotal', total: clamped }) })
    setTotalGames(clamped)
    await loadData()
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!newCode.trim() || !newName.trim()) return
    const res = await fetch('/api/players', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: newCode, name: newName, level: newLevel, school: newSchool, member2: newMember2 }),
    })
    if (res.ok) { setNewCode(''); setNewName(''); setNewSchool(''); setNewMember2(''); await loadAllPlayers(); await loadData() }
    else { const d = await res.json(); setStatus({ msg: d.error, ok: false }) }
  }

  async function saveEdit() {
    if (!editingPlayer) return
    const res = await fetch('/api/players', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingPlayer.id, code: editCode, name: editName, school: editSchool, member2: editMember2 }),
    })
    if (!res.ok) { const d = await res.json(); setStatus({ msg: d.error || 'แก้ไขไม่สำเร็จ', ok: false }); return }
    setEditingPlayer(null); await loadAllPlayers(); await loadData()
  }

  async function deletePlayer(p: Player) {
    if (!confirm(`ยืนยันลบ "${disp(p)}" (${p.code}) ?`)) return
    await fetch('/api/players', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
    await loadAllPlayers(); await loadData()
  }

  function parseImportText(text: string) {
    return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split(/[\t,]/).map(s => s.trim())
      return { code: parts[0] || '', name: parts[1] || '', school: parts[2] || '', member2: parts[3] || '', level: newLevel }
    }).filter(r => r.code && r.name)
  }

  async function submitImport() {
    if (!importPreview.length) return
    setImportLoading(true)
    const res = await fetch('/api/players/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: newLevel, rows: importPreview }),
    })
    const data = await res.json()
    setImportLoading(false)
    if (!res.ok) { alert(data.error); return }
    alert(`นำเข้าสำเร็จ ${data.count} คน`)
    setImportText(''); setImportPreview([])
    await loadAllPlayers(); await loadData()
  }

  function isGameDone(game: number) {
    const gp = pairings[game] || []
    const gr = gameRows.filter(g => g.game === game)
    if (!gp.length) return false
    return gp.filter(p => !p.is_bye).every(p => {
      const r = gr.find(g => g.pair_num === p.pair_num)
      return r && r.score_a !== null && r.score_b !== null
    })
  }

  function getGameProgress(game: number) {
    const gp = (pairings[game] || []).filter(p => !p.is_bye)
    const gr = gameRows.filter(g => g.game === game)
    const scored = gp.filter(p => { const r = gr.find(g => g.pair_num === p.pair_num); return r && r.score_a !== null }).length
    return { scored, total: gp.length }
  }

  function getAwards() {
    const pfFinal = playoffs.find(p => p.round === 'ชิงชนะเลิศ')
    const pfThird = playoffs.find(p => p.round === 'ชิงที่3')
    let champion: Player | null = null, runnerUp: Player | null = null, third: Player | null = null
    if (pfFinal && pfFinal.score_a !== null && pfFinal.score_b !== null) {
      const r = computeMatchResult(pfFinal.score_a, pfFinal.score_b, AM_MAX_DIFF_FINAL)
      if (r.resultA === 'W') { champion = pfFinal.player_a; runnerUp = pfFinal.player_b }
      else if (r.resultB === 'W') { champion = pfFinal.player_b; runnerUp = pfFinal.player_a }
    }
    if (pfThird && pfThird.score_a !== null && pfThird.score_b !== null) {
      const r = computeMatchResult(pfThird.score_a, pfThird.score_b, AM_MAX_DIFF_FINAL)
      if (r.resultA === 'W') third = pfThird.player_a
      else if (r.resultB === 'W') third = pfThird.player_b
    }
    return { champion, runnerUp, third }
  }

  async function sendAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    if (!announcement.trim()) return
    setAnnounceLoading(true)
    await fetch('/api/broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'announcement', level, payload: { message: announcement.trim() } }),
    })
    setAnnounceLoading(false); setAnnouncement('')
    setStatus({ msg: '✅ ส่งข้อความไปยังหน้าจอแสดงผลแล้ว', ok: true })
  }

  async function resetResults() {
    if (!confirm(`รีเซ็ตผลการแข่งขันทั้งหมด (${level})? รายชื่อนักเรียนยังอยู่`)) return
    await supabase.from('am_games').delete().eq('level', level)
    await supabase.from('am_pairings').delete().eq('level', level)
    await supabase.from('am_playoffs').delete().eq('level', level)
    await supabase.from('am_broadcast').insert({ type: 'reset', level, payload: {} })
    setStatus({ msg: '✅ รีเซ็ตผลการแข่งขันแล้ว', ok: true }); await loadData()
  }

  async function resetAll() {
    if (!confirm('⚠️ ลบข้อมูลทั้งหมด รวมรายชื่อนักเรียน?\nไม่สามารถกู้คืนได้!')) return
    if (!confirm('กด OK อีกครั้งเพื่อยืนยัน')) return
    await supabase.from('am_games').delete().neq('id', 0)
    await supabase.from('am_pairings').delete().neq('id', 0)
    await supabase.from('am_playoffs').delete().neq('id', 0)
    await supabase.from('am_players').delete().neq('id', 0)
    await supabase.from('am_broadcast').insert({ type: 'reset', level: null, payload: {} })
    setStatus({ msg: '✅ รีเซ็ตข้อมูลทั้งหมดแล้ว', ok: true }); await loadData(); await loadAllPlayers()
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // เสียงแจ้งเตือนเมื่อกรอกครบ
  function playBeep() {
    try {
      const ctx = new AudioContext()
      const beep = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq; gain.gain.value = 0.3
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + duration)
      }
      beep(880, 0, 0.15)
      beep(1100, 0.2, 0.2)
    } catch { /* ไม่รองรับ AudioContext */ }
  }
  const awards = getAwards()

  return (
    <div className="min-h-screen pb-20" style={{ background: '#F0F9FF' }}>
      {/* Sticky tab bar */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-sky-100 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-1 px-3 py-2 overflow-x-auto">
          {[
            { label: '🎮 คัดเลือก', id: 'section-prelim' },
            { label: '🏆 รอบชิง', id: 'section-playoff' },
            { label: '📊 อันดับ', id: 'section-standings' },
            { label: '🏅 รางวัล', id: 'section-awards' },
            { label: '👥 จัดการ', id: 'section-manage' },
          ].map(tab => (
            <button key={tab.id} onClick={() => scrollTo(tab.id)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-black text-sky-700 hover:bg-sky-100 transition">
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 pt-5">
        <div className="rounded-3xl p-6 text-center shadow-xl mb-4" style={{ background: PRIMARY }}>
          <h1 style={{ fontFamily: "'Nunito',sans-serif" }} className="text-2xl font-black text-white">🛡️ แผงแอดมิน A-Math</h1>
          <p className="text-sky-100 text-sm font-semibold mt-1">โรงเรียนพูลเจริญวิทยาคม</p>
          <div className="flex justify-center gap-3 mt-4 flex-wrap">
            <a href="/display" target="_blank" className="px-4 py-2 bg-white/20 rounded-xl text-white font-bold text-sm hover:bg-white/30 transition">🖥️ กระดานคะแนน</a>
            <a href="/scoring" target="_blank" className="px-4 py-2 bg-white/20 rounded-xl text-white font-bold text-sm hover:bg-white/30 transition">✍️ กรอกคะแนน</a>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-4 space-y-5">
        {/* Level Toggle */}
        <div className="flex bg-white rounded-2xl p-1.5 border-2 border-sky-100 shadow">
          {(['มต้น', 'มปลาย'] as Level[]).map(lv => (
            <button key={lv} onClick={() => setLevel(lv)}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${level === lv ? 'text-white shadow' : 'text-sky-600'}`}
              style={level === lv ? { background: PRIMARY } : {}}>
              {lv === 'มต้น' ? 'ม.ต้น' : 'ม.ปลาย'}
              {allPlayers.filter(p => p.level === lv).length > 0 && (
                <span className="ml-1 opacity-75 text-xs">({allPlayers.filter(p => p.level === lv).length} คน)</span>
              )}
            </button>
          ))}
        </div>

        {/* Current game banner */}
        {latestGame > 0 && (
          <div className="rounded-2xl p-4 text-center font-black text-lg text-white shadow-lg" style={{ background: '#dc2626' }}>
            ⚠️ ขณะนี้อยู่ในเกม {latestGame} ({level})
          </div>
        )}

        {/* Status */}
        {status && (
          <div className={`rounded-xl p-3 text-center font-bold text-sm ${status.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {status.msg}
          </div>
        )}

        {/* ── รอบคัดเลือก ── */}
        <div id="section-prelim" className="bg-white rounded-2xl p-5 border border-sky-100 shadow scroll-mt-14">
          <p className="font-black text-sky-700 mb-3">🎮 รอบคัดเลือก</p>
          <div className="text-xs text-sky-600 bg-sky-50 rounded-lg p-3 mb-4">
            เกม 1: สุ่มจับคู่ &nbsp;|&nbsp; เกม 2+: King of the Hill (อันดับ 1v2, 3v4, ...)
          </div>

          {/* Game count control */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-sky-600">{totalGames} เกม</span>
            <div className="flex gap-2">
              {totalGames > 3 && (
                <button onClick={() => setTotalGamesTo(totalGames - 1)}
                  className="w-9 h-9 rounded-full font-black text-lg border-2 border-sky-200 text-sky-500 hover:bg-sky-100 transition flex items-center justify-center">−</button>
              )}
              <button onClick={() => setTotalGamesTo(totalGames + 1)}
                className="w-9 h-9 rounded-full font-black text-lg border-2 border-sky-300 text-white hover:opacity-90 transition flex items-center justify-center"
                style={{ background: PRIMARY }}>+</button>
            </div>
          </div>

          {/* Game cards */}
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: totalGames }, (_, i) => i + 1).map(g => {
              const done = isGameDone(g)
              const hasTable = !!(pairings[g] && pairings[g].length > 0)
              const locked = g > 1 && !isGameDone(g - 1) && !hasTable
              const label = g === 1 ? 'Random' : 'King of Hill'
              return (
                <button key={g} onClick={() => {
                    if (hasTable && !confirm(`⚠️ เกม ${g} จัดคู่ไปแล้ว${done ? '' : ' และมีผลบางส่วน'}\nจัดใหม่จะลบคู่และผลทั้งหมดของเกมนี้\nยืนยันหรือไม่?`)) return
                    generatePairings(g)
                  }} disabled={loading || locked}
                  className={`relative py-4 px-3 rounded-2xl font-bold text-sm border-2 transition text-center shadow-sm
                    ${done ? 'bg-green-50 border-green-400 text-green-800'
                    : hasTable && !done ? 'bg-sky-50 border-sky-300 text-sky-700'
                    : locked ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-white border-sky-200 text-sky-700 hover:bg-sky-50'}`}>
                  {locked && <span className="absolute top-2 right-2 text-base">🔒</span>}
                  {done && <span className="absolute top-2 right-2 text-base">✅</span>}
                  {g === totalGames && !done && <span className="absolute top-2 left-2 text-xs text-amber-500">★</span>}
                  {loadingGame === g
                    ? <span className="block animate-spin text-xl">⏳</span>
                    : <><span className="block text-base font-black">เกม {g}</span><span className="text-xs font-normal opacity-70">{label}</span></>
                  }
                </button>
              )
            })}
          </div>

          {/* Gibsonize — แสดงเฉพาะเมื่อกำลังจะจัดเกมสุดท้าย */}
          {latestGame === totalGames - 1 && <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200 mt-3">
            <p className="text-xs font-black text-sky-700 mb-1">🎯 Gibsonize — สำหรับเกมสุดท้าย (เกม {totalGames}) เท่านั้น</p>
            <p className="text-xs text-sky-400 mb-3">ผู้เล่นที่อันดับแน่นอนแล้ว จะได้ BYE แทนการแข่ง</p>
            <button
              onClick={() => {
                const remainingGames = Math.max(1, totalGames - latestGame)
                const suggested = suggestGibsonize(standings, remainingGames)
                setGibsonSuggest(suggested.map(s => ({ code: s.player.code, name: disp(s.player), rank: s.rank, points: s.points })))
                if (suggested.length > 0) setGibsonInput(suggested.map(s => s.player.code).join(','))
              }}
              className="w-full text-xs font-bold px-3 py-2 rounded-xl bg-white border border-sky-300 text-sky-700 hover:bg-sky-50 transition mb-2">
              🔍 ให้ระบบแนะนำอัตโนมัติ
            </button>
            {gibsonSuggest !== null && (
              <div className="mb-2 text-xs text-sky-700 bg-white rounded-xl p-2 border border-sky-100">
                {gibsonSuggest.length === 0
                  ? '✅ ยังไม่มีใครอันดับแน่นอน'
                  : gibsonSuggest.map(s => <div key={s.code}>อันดับ {s.rank} — {s.name} ({s.code}, {s.points} แต้ม)</div>)}
              </div>
            )}
            <input type="text" value={gibsonInput} onChange={e => setGibsonInput(e.target.value)}
              placeholder="รหัสผู้เล่น คั่นด้วยจุลภาค เช่น A01,A02"
              className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white text-sm focus:outline-none focus:border-sky-400" />
          </div>}

          {/* Current game pair list */}
          {latestGame > 0 && pairings[latestGame] && pairings[latestGame].length > 0 && (() => {
            const { scored, total } = getGameProgress(latestGame)
            const pct = total > 0 ? Math.round(scored / total * 100) : 0
            const gr = gameRows.filter(g => g.game === latestGame)
            const missing = (pairings[latestGame] || []).filter(p => !p.is_bye).filter(p => {
              const r = gr.find(g => g.pair_num === p.pair_num)
              return !(r && r.score_a !== null)
            }).map(p => p.pair_num)

            return (
              <div className="mt-4 space-y-3">
                {total > 0 && (
                  <div>
                    <div className="flex justify-between text-xs font-bold text-sky-600 mb-1">
                      <span>ความคืบหน้าเกม {latestGame}</span>
                      <span>{scored}/{total} คู่ {scored === total ? '✅ ครบแล้ว' : ''}</span>
                    </div>
                    <div className="w-full bg-sky-100 rounded-full h-2.5">
                      <div className="h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: scored === total ? '#16a34a' : PRIMARY }} />
                    </div>
                  </div>
                )}
                {missing.length > 0 && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
                    <p className="text-sm font-black text-amber-800 mb-2">⏳ โต๊ะเกมที่ {latestGame} ยังกรอกไม่ครบ — เหลือ {missing.length} โต๊ะ</p>
                    <div className="flex flex-wrap gap-1.5">
                      {missing.map(pn => (
                        <span key={pn} className="px-2.5 py-1 bg-amber-200 text-amber-900 text-xs font-black rounded-lg">โต๊ะ {pn}</span>
                      ))}
                    </div>
                    <p className="text-xs text-amber-600 mt-2 font-semibold">กรอกผลให้ครบก่อนจึงจะสามารถจัดโต๊ะเกมที่ {latestGame + 1} ได้</p>
                  </div>
                )}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-sky-600">โต๊ะเกมที่ {latestGame}:</p>
                    <button onClick={() => window.print()} className="px-3 py-1 rounded-lg border border-sky-300 text-sky-600 text-xs font-bold hover:bg-sky-50">🖨️ พิมพ์ใบปะหน้า</button>
                  </div>
                  <div className="space-y-1.5">
                    {pairings[latestGame].map(r => {
                      const res = gr.find(g => g.pair_num === r.pair_num)
                      const done = res && res.score_a !== null
                      return (
                        <div key={r.pair_num} className="flex gap-3 items-center bg-sky-50 rounded-xl px-4 py-2.5 border border-sky-100">
                          <div className="font-black text-sky-700 text-sm min-w-[48px]">โต๊ะ {r.pair_num}</div>
                          <div className="flex-1 text-sm">
                            {r.is_bye
                              ? <span className="text-sky-500">🎁 {disp(r.player_a)} <span className="text-sky-400">({r.player_a.code})</span> ได้ BYE</span>
                              : <span>{disp(r.player_a)} <span className="text-sky-400">({r.player_a.code})</span> <strong className="text-sky-600 mx-1">VS</strong> {r.player_b ? disp(r.player_b) : '—'} {r.player_b && <span className="text-sky-400">({r.player_b.code})</span>}</span>
                            }
                          </div>
                          {!r.is_bye && <span className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-emerald-400' : 'bg-gray-300'}`} />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── รอบชิงชนะเลิศ ── */}
        <div id="section-playoff" className="bg-white rounded-2xl p-5 border border-sky-100 shadow scroll-mt-14">
          <p className="font-black text-sky-700 mb-3">🏆 รอบชิงชนะเลิศ</p>
          <div className="text-xs text-sky-600 bg-sky-50 rounded-lg p-3 mb-4">
            กดหลังกรอกผลครบทุกเกม — ระบบดึง 4 อันดับแรก: อันดับ 1 vs 2 (ชิงที่ 1) และ อันดับ 3 vs 4 (ชิงที่ 3)
          </div>
          {(() => {
            const allDone = Array.from({ length: totalGames }, (_, i) => i + 1).every(g => isGameDone(g))
            const hasAllPairings = Array.from({ length: totalGames }, (_, i) => i + 1).every(g => pairings[g] && pairings[g].length > 0)
            const ready = allDone && hasAllPairings
            return (
              <>
                {!ready && (
                  <div className="mb-3 rounded-xl p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                    ⚠️ ต้องจัดคู่และกรอกผลให้ครบทุก {totalGames} เกมก่อน
                  </div>
                )}
                <button onClick={generatePlayoff} disabled={loading || !ready}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white shadow disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: PRIMARY }}>
                  🏆 สร้างคู่รอบชิงชนะเลิศ (top 4)
                </button>
              </>
            )
          })()}
          {playoffs.length > 0 && (
            <div className="mt-4 space-y-2">
              {playoffs.map((p, i) => (
                <div key={i} className="bg-sky-50 rounded-xl p-3 border border-sky-100 text-sm flex justify-between items-center">
                  <span className="font-black text-sky-700">{p.round}</span>
                  <span className="text-sky-600">{disp(p.player_a)} ({p.score_a ?? '—'}) vs {disp(p.player_b)} ({p.score_b ?? '—'})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ตารางอันดับ ── */}
        <div id="section-standings" className="bg-white rounded-2xl border border-sky-100 shadow overflow-hidden scroll-mt-14">
          <button onClick={() => setShowStandings(v => !v)} className="w-full p-5 flex justify-between items-center font-black text-sky-700 hover:bg-sky-50 transition">
            <span>📊 ตารางอันดับปัจจุบัน ({level})</span>
            <span className="text-sky-300">{showStandings ? '▲' : '▼'}</span>
          </button>
          {showStandings && (
            <div className="border-t border-sky-50 overflow-x-auto">
              {standings.length === 0
                ? <p className="text-center text-sky-200 py-4 px-5">ยังไม่มีข้อมูล</p>
                : (
                  <table className="w-full text-xs">
                    <thead><tr className="text-white" style={{ background: '#0369A1' }}>
                      <th className="p-2 text-center">อันดับ</th>
                      <th className="p-2 text-left">ชื่อ</th>
                      <th className="p-2 text-center">ห้อง</th>
                      <th className="p-2 text-center">W-T-L</th>
                      <th className="p-2 text-center">แต้ม</th>
                      <th className="p-2 text-center">ผลต่าง</th>
                    </tr></thead>
                    <tbody>
                      {standings.map((s, i) => (
                        <tr key={s.player.id} className={`border-b border-sky-50 ${i === 0 ? 'bg-sky-50' : i === 1 ? 'bg-slate-50' : i === 2 ? 'bg-orange-50' : ''}`}>
                          <td className="p-2 text-center">{i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-sky-500">{s.rank}</span>}</td>
                          <td className="p-2">{disp(s.player)} <span className="text-sky-300">({s.player.code})</span></td>
                          <td className="p-2 text-center text-sky-300">{s.player.school}</td>
                          <td className="p-2 text-center text-sky-500">{s.wins}-{s.ties}-{s.losses}</td>
                          <td className="p-2 text-center font-black text-sky-700">{s.points}</td>
                          <td className={`p-2 text-center font-bold ${s.diffSum > 0 ? 'text-emerald-600' : s.diffSum < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {s.diffSum > 0 ? '+' : ''}{s.diffSum}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          )}
        </div>

        {/* ── สรุปผลรางวัล ── */}
        <div id="section-awards" className="bg-white rounded-2xl p-5 border border-sky-100 shadow scroll-mt-14">
          <div className="flex justify-between items-center mb-4">
            <p className="font-black text-sky-700">🏅 สรุปผลรางวัล ({level})</p>
            <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg border border-sky-300 text-sky-700 text-xs font-bold hover:bg-sky-50">🖨️ พิมพ์</button>
          </div>
          {!awards.champion && !awards.runnerUp && !awards.third
            ? <p className="text-center text-sky-200 py-4">⏳ ยังไม่มีผลชิงชนะเลิศ</p>
            : <>
              {awards.champion && (
                <div className="rounded-xl p-4 mb-3 border-2 border-amber-300 bg-amber-50 flex gap-4 items-center">
                  <span className="text-4xl">🥇</span>
                  <div>
                    <p className="text-xs font-bold text-amber-700">ชนะเลิศ (ที่ 1)</p>
                    <p className="font-black text-base">{disp(awards.champion)}</p>
                    <p className="text-xs text-amber-600">{awards.champion.code} • {awards.champion.school}</p>
                  </div>
                </div>
              )}
              {awards.runnerUp && (
                <div className="rounded-xl p-4 mb-3 border-2 border-slate-300 bg-slate-50 flex gap-4 items-center">
                  <span className="text-4xl">🥈</span>
                  <div>
                    <p className="text-xs font-bold text-slate-600">รองชนะเลิศ (ที่ 2)</p>
                    <p className="font-black text-base">{disp(awards.runnerUp)}</p>
                    <p className="text-xs text-slate-500">{awards.runnerUp.code} • {awards.runnerUp.school}</p>
                  </div>
                </div>
              )}
              {awards.third && (
                <div className="rounded-xl p-4 mb-3 border-2 border-orange-300 bg-orange-50 flex gap-4 items-center">
                  <span className="text-4xl">🥉</span>
                  <div>
                    <p className="text-xs font-bold text-orange-700">อันดับ 3</p>
                    <p className="font-black text-base">{disp(awards.third)}</p>
                    <p className="text-xs text-orange-600">{awards.third.code} • {awards.third.school}</p>
                  </div>
                </div>
              )}
            </>
          }
        </div>


        {/* ── ผลเกมย้อนหลัง ── */}
        <PastGamesSection pairings={pairings} gameRows={gameRows} latestGame={latestGame} totalGames={totalGames} disp={disp} />

        {/* ── QR Code ── */}
        <QRSection />

        {/* ── Export Excel ── */}
        <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow">
          <p className="font-black text-sky-700 mb-1">📊 Export ผลคะแนน</p>
          <p className="text-xs text-sky-400 mb-4">ดาวน์โหลดอันดับและผลเป็นไฟล์ Excel</p>
          <div className="flex gap-2">
            {(['มต้น', 'มปลาย'] as const).map(lv => (
              <button key={lv} onClick={async () => {
                const res = await fetch(`/api/standings?level=${encodeURIComponent(lv)}`)
                const { standings: st } = await res.json()
                const rows = (st || []).map((s: Standing) => ({
                  อันดับ: s.rank,
                  รหัส: s.player.code,
                  ชื่อ: s.player.name,
                  สมาชิก2: s.player.member2 || '',
                  ห้อง: s.player.school,
                  W: s.wins, T: s.ties, L: s.losses,
                  แต้ม: s.points,
                  ผลต่าง: s.diffSum,
                }))
                const ws = XLSX.utils.json_to_sheet(rows)
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, lv === 'มต้น' ? 'ม.ต้น' : 'ม.ปลาย')
                XLSX.writeFile(wb, `amath-${lv === 'มต้น' ? 'junior' : 'senior'}.xlsx`)
              }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 active:scale-95 transition-all">
                📊 {lv === 'มต้น' ? 'ม.ต้น' : 'ม.ปลาย'} (.xlsx)
              </button>
            ))}
          </div>
        </div>

        {/* ── Backup & Restore ── */}
        <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow">
          <p className="font-black text-sky-700 mb-1">💾 Backup & Restore</p>
          <p className="text-xs text-sky-400 mb-4">Export ข้อมูลทั้งหมด (ผู้เล่น + ผลการแข่งขัน) เป็นไฟล์ JSON</p>
          <button onClick={async () => {
            const [{ data: players }, { data: games }, { data: pairingData }, { data: playoffs }] = await Promise.all([
              supabase.from('am_players').select('*'),
              supabase.from('am_games').select('*'),
              supabase.from('am_pairings').select('*'),
              supabase.from('am_playoffs').select('*'),
            ])
            const backup = { players, games, pairings: pairingData, playoffs, exportedAt: new Date().toISOString() }
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `amath-backup-${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.json`
            a.click(); URL.revokeObjectURL(url)
          }}
            className="w-full py-3 rounded-xl font-bold text-sm text-white shadow hover:opacity-90 active:scale-95 transition-all mb-4"
            style={{ background: 'linear-gradient(135deg,#6366F1,#818CF8)' }}>
            💾 Download Backup (.json)
          </button>
          <p className="text-xs font-bold text-red-500 mb-2">⚠️ Restore จะลบข้อมูลทั้งหมดในระบบก่อน แล้วนำเข้าจากไฟล์</p>
          <div className="flex gap-2 items-center">
            <label className="px-4 py-2 rounded-xl border-2 border-sky-200 bg-sky-50 text-sky-700 font-bold text-sm cursor-pointer hover:bg-sky-100 transition shrink-0">
              เลือกไฟล์
              <input type="file" accept=".json" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return
                try {
                  const text = await file.text()
                  const data = JSON.parse(text)
                  if (!confirm('⚠️ ข้อมูลทั้งหมดจะถูกลบและนำเข้าใหม่\nยืนยันหรือไม่?')) return
                  await Promise.all([
                    supabase.from('am_games').delete().neq('id', 0),
                    supabase.from('am_pairings').delete().neq('id', 0),
                    supabase.from('am_playoffs').delete().neq('id', 0),
                    supabase.from('am_players').delete().neq('id', 0),
                  ])
                  // restore ต้องเก็บ id ไว้เพื่อให้ FK (player_a_id, player_b_id) ยังถูกต้อง
                  if (data.players?.length) await supabase.from('am_players').insert(data.players)
                  if (data.games?.length) await supabase.from('am_games').insert(data.games)
                  if (data.pairings?.length) await supabase.from('am_pairings').insert(data.pairings)
                  if (data.playoffs?.length) await supabase.from('am_playoffs').insert(data.playoffs)
                  alert('✅ Restore สำเร็จ'); await loadData(); await loadAllPlayers()
                } catch { alert('❌ ไฟล์ไม่ถูกต้อง') }
                e.target.value = ''
              }} />
            </label>
            <span className="text-xs text-sky-400">เลือกไฟล์ .json ที่ backup ไว้</span>
          </div>
        </div>

        {/* ── Broadcast ── */}
        <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow">
          <p className="font-black text-sky-700 mb-3">📢 ส่งข้อความไปหน้าจอ</p>
          <form onSubmit={sendAnnouncement} className="flex gap-2">
            <input type="text" value={announcement} onChange={e => setAnnouncement(e.target.value)}
              placeholder="เช่น พักรับประทานอาหาร 30 นาที"
              className="flex-1 px-3 py-2.5 rounded-xl border-2 border-sky-100 bg-sky-50 text-sm font-semibold focus:outline-none focus:border-sky-300" />
            <button type="submit" disabled={!announcement.trim() || announceLoading}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-white shadow hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 shrink-0"
              style={{ background: PRIMARY }}>
              {announceLoading ? '⏳' : '📤 ส่ง'}
            </button>
          </form>
          <p className="text-xs text-sky-300 mt-2">ข้อความจะแสดงบนหน้าจอ display 30 วินาที</p>
        </div>

        {/* ── Reset ── */}
        <div className="bg-white rounded-2xl p-5 border border-red-100 shadow">
          <p className="font-black text-red-700 mb-1">🗑️ รีเซ็ตข้อมูล</p>
          <p className="text-xs text-red-400 mb-2 font-semibold">⚠️ แนะนำ Backup ก่อนทุกครั้ง — การรีเซ็ตไม่สามารถกู้คืนได้</p>
          <div className="flex gap-2">
            <button onClick={resetResults}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-amber-100 text-amber-800 border-2 border-amber-300 hover:bg-amber-200 active:scale-95 transition-all">
              🔄 Reset ผลแข่ง ({level})<br /><span className="text-xs font-normal">เก็บรายชื่อไว้</span>
            </button>
            <button onClick={resetAll}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-red-100 text-red-700 border-2 border-red-300 hover:bg-red-200 active:scale-95 transition-all">
              💣 Reset ทั้งหมด<br /><span className="text-xs font-normal">ลบทุกอย่าง</span>
            </button>
          </div>
        </div>

        {/* ── จัดการผู้เล่น ── */}
        <div id="section-manage" className="bg-white rounded-2xl border border-sky-100 shadow overflow-hidden scroll-mt-14">
          <button onClick={() => setShowPlayers(v => !v)} className="w-full p-5 flex justify-between items-center font-black text-sky-700 hover:bg-sky-50 transition">
            <span>👥 จัดการรายชื่อผู้เข้าแข่งขัน</span>
            <span>{showPlayers ? '▲' : '▼'}</span>
          </button>
          {showPlayers && (
            <div className="p-5 border-t border-sky-50 space-y-5">
              {/* Add player form */}
              <form onSubmit={addPlayer} className="space-y-3">
                <p className="font-bold text-sky-600 text-sm">เพิ่มผู้เข้าแข่งขันทีละคน</p>
                <select value={newLevel} onChange={e => setNewLevel(e.target.value as Level)} className="w-full px-3 py-2 border-2 border-sky-100 rounded-xl text-sm font-semibold bg-sky-50">
                  <option value="มต้น">ม.ต้น</option>
                  <option value="มปลาย">ม.ปลาย</option>
                </select>
                <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="รหัส * (เช่น A01)" className="w-full px-3 py-2 border-2 border-sky-100 rounded-xl text-sm" required />
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ชื่อ-นามสกุล (สมาชิก 1) *" className="w-full px-3 py-2 border-2 border-sky-100 rounded-xl text-sm" required />
                <input value={newSchool} onChange={e => setNewSchool(e.target.value)} placeholder="ห้อง (เช่น ม.3/5)" className="w-full px-3 py-2 border-2 border-sky-100 rounded-xl text-sm" />
                {newLevel === 'มต้น' && (
                  <input value={newMember2} onChange={e => setNewMember2(e.target.value)} placeholder="สมาชิก 2 (ม.ต้น)" className="w-full px-3 py-2 border-2 border-sky-100 rounded-xl text-sm" />
                )}
                <button type="submit" className="w-full py-2 rounded-xl text-white font-bold text-sm" style={{ background: PRIMARY }}>+ เพิ่มผู้เข้าแข่งขัน</button>
              </form>

              {/* Bulk import */}
              <div className="border-t pt-4">
                <p className="font-bold text-sky-600 text-sm mb-1">นำเข้าหลายคนพร้อมกัน</p>
                <select value={newLevel} onChange={e => { setNewLevel(e.target.value as Level); setImportPreview(parseImportText(importText)) }} className="w-full px-3 py-2 border-2 border-sky-100 rounded-xl text-sm font-semibold bg-sky-50 mb-2">
                  <option value="มต้น">ม.ต้น</option>
                  <option value="มปลาย">ม.ปลาย</option>
                </select>
                <p className="text-xs text-sky-400 mb-2">
                  {newLevel === 'มต้น'
                    ? 'แต่ละบรรทัด: รหัส[Tab]ชื่อ[Tab]ห้อง[Tab]สมาชิก2'
                    : 'แต่ละบรรทัด: รหัส[Tab]ชื่อ[Tab]ห้อง'}
                </p>
                <textarea
                  value={importText}
                  onChange={e => { setImportText(e.target.value); setImportPreview(parseImportText(e.target.value)) }}
                  placeholder={newLevel === 'มต้น'
                    ? 'A01\tสมชาย ใจดี\tม.3/2\tสมหญิง มีสุข\nA02\tวิชัย รักเรียน\tม.3/5'
                    : 'B01\tสมชาย ใจดี\tม.6/2\nB02\tวิชัย รักเรียน\tม.5/3'}
                  rows={4}
                  className="w-full px-3 py-2 border-2 border-sky-100 rounded-xl text-xs font-mono bg-sky-50 focus:outline-none focus:border-sky-400"
                />
                {importPreview.length > 0 && (
                  <div className="bg-sky-50 rounded-xl p-3 mt-2 text-xs">
                    <p className="font-bold mb-1">พบ {importPreview.length} รายการ ({newLevel === 'มต้น' ? 'ม.ต้น' : 'ม.ปลาย'})</p>
                    {importPreview.slice(0, 3).map((r, i) => <p key={i}>{r.code} — {r.name} {r.school && `/ ${r.school}`}</p>)}
                    {importPreview.length > 3 && <p>... อีก {importPreview.length - 3} คน</p>}
                    <button onClick={submitImport} disabled={importLoading} className="mt-2 px-4 py-1.5 rounded-lg text-white font-bold disabled:opacity-50" style={{ background: PRIMARY }}>
                      {importLoading ? '⏳ กำลังนำเข้า...' : `นำเข้า ${importPreview.length} คน`}
                    </button>
                  </div>
                )}
              </div>

              {/* Player list */}
              {(() => {
                const lvPlayers = allPlayers.filter(p => p.level === newLevel)
                return (
                  <div className="border-t pt-4">
                    <p className="text-xs font-bold text-sky-700 mb-2">
                      👤 รายชื่อ {newLevel === 'มต้น' ? 'ม.ต้น' : 'ม.ปลาย'} ({lvPlayers.length} คน)
                    </p>
                    {lvPlayers.length === 0
                      ? <p className="text-xs text-sky-300 text-center py-4">ยังไม่มีผู้เข้าแข่งขัน</p>
                      : (
                        <div className="overflow-y-auto rounded-xl border border-sky-100 space-y-1.5 p-2" style={{ maxHeight: 320 }}>
                          {lvPlayers.map(p => (
                            <div key={p.id} className="flex items-center gap-2 text-sm bg-sky-50 rounded-xl px-3 py-2.5 border border-sky-100">
                              <span className="font-black text-sky-400 min-w-[40px] text-xs">{p.code}</span>
                              {editingPlayer?.id === p.id ? (
                                <>
                                  <div className="flex-1 grid grid-cols-2 gap-1">
                                    <input value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="รหัส" className="px-2 py-1 border border-sky-200 rounded-lg text-xs" />
                                    <input value={editSchool} onChange={e => setEditSchool(e.target.value)} placeholder="ห้อง" className="px-2 py-1 border border-sky-200 rounded-lg text-xs" />
                                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="ชื่อ" className="px-2 py-1 border border-sky-200 rounded-lg text-xs col-span-2" />
                                    {p.level === 'มต้น' && (
                                      <input value={editMember2} onChange={e => setEditMember2(e.target.value)} placeholder="สมาชิก 2" className="px-2 py-1 border border-sky-200 rounded-lg text-xs col-span-2" />
                                    )}
                                  </div>
                                  <button onClick={saveEdit} className="px-2 py-1 bg-green-600 text-white rounded-lg text-xs font-bold shrink-0">บันทึก</button>
                                  <button onClick={() => setEditingPlayer(null)} className="px-2 py-1 bg-gray-200 rounded-lg text-xs shrink-0">ยกเลิก</button>
                                </>
                              ) : (
                                <>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800 text-sm truncate">{disp(p)}</p>
                                    {p.school && <p className="text-sky-400 text-xs">{p.school}</p>}
                                  </div>
                                  <button onClick={() => { setEditingPlayer(p); setEditCode(p.code); setEditName(p.name); setEditSchool(p.school); setEditMember2(p.member2) }}
                                    className="px-2.5 py-1.5 text-xs border border-sky-200 rounded-lg text-sky-600 hover:bg-sky-100 font-bold shrink-0">✏️</button>
                                  <button onClick={() => deletePlayer(p)} className="px-2 py-1.5 text-xs border border-red-200 rounded-lg text-red-400 hover:bg-red-50 shrink-0">🗑️</button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-pairs { display: block !important; visibility: visible; position: fixed; top: 0; left: 0; width: 100%; padding: 24px; }
          #print-pairs * { visibility: visible; }
        }
        #print-pairs { display: none; }
      `}</style>

      <div id="print-pairs">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900 }}>🎮 เกม {latestGame} — {level}</h2>
          <p style={{ fontSize: 13 }}>โรงเรียนพูลเจริญวิทยาคม</p>
        </div>
        {latestGame > 0 && (pairings[latestGame] || []).map(r => (
          <div key={r.pair_num} style={{ border: '2px solid #BAE6FD', borderRadius: 12, padding: 16, marginBottom: 12, breakInside: 'avoid' }}>
            <p style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>โต๊ะ {r.pair_num}</p>
            <p style={{ fontSize: 14 }}>
              {r.is_bye
                ? `${disp(r.player_a)} (${r.player_a.code}) — BYE`
                : `${disp(r.player_a)} (${r.player_a.code}) VS ${r.player_b ? disp(r.player_b) : '—'} ${r.player_b ? `(${r.player_b.code})` : ''}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
