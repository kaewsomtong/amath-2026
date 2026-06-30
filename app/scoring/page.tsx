'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { computeMatchResult, AM_MAX_DIFF, AM_MAX_DIFF_FINAL } from '@/lib/am-logic'

type Level = 'มต้น' | 'มปลาย'
type Mode = 'qualify' | 'playoff'

interface Player { id: number; code: string; name: string; level: string; school: string; member2: string }
interface PairingRow { pair_num: number; player_a: Player; player_b: Player | null; is_bye: boolean }
interface PlayoffRow { round: string; pair_num: number; player_a: Player; player_b: Player; score_a: number | null; score_b: number | null }

const PRIMARY = 'linear-gradient(135deg,#0284C7,#38BDF8)'

export default function ScoringPage() {
  const [level, setLevel] = useState<Level>('มต้น')
  const [mode, setMode] = useState<Mode>('qualify')
  const [latestGame, setLatestGame] = useState(0)
  const [totalGames, setTotalGames] = useState(3)
  const [game, setGame] = useState(1)
  const [userPickedGame, setUserPickedGame] = useState(false)

  const [pairNum, setPairNum] = useState('')
  const [lookupResult, setLookupResult] = useState<PairingRow | null>(null)
  const [lookupMsg, setLookupMsg] = useState('')
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'ok' | 'warn' | 'error'>('idle')
  const [existingScore, setExistingScore] = useState<{ score_a: number; score_b: number } | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ scoreA: string; scoreB: string } | null>(null)

  const [nameA, setNameA] = useState('')
  const [nameB, setNameB] = useState('')
  const [codeA, setCodeA] = useState('')
  const [codeB, setCodeB] = useState('')
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')

  const [pfRound, setPfRound] = useState('ชิงชนะเลิศ')
  const [pfPairs, setPfPairs] = useState<PlayoffRow[]>([])
  const [pfPair, setPfPair] = useState('')
  const [currentPlayoff, setCurrentPlayoff] = useState<PlayoffRow | null>(null)

  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // สถานะโต๊ะทั้งหมด
  const [tablePairings, setTablePairings] = useState<{ pair_num: number; is_bye: boolean }[]>([])
  const [scoredSet, setScoredSet] = useState<Set<number>>(new Set())

  const pairNumRef = useRef<HTMLInputElement>(null)
  const scoreARef = useRef<HTMLInputElement>(null)
  const scoreBRef = useRef<HTMLInputElement>(null)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disp = (p: Player) => p.member2 ? `${p.name} + ${p.member2}` : p.name

  const fetchGameInfo = useCallback(async () => {
    const [settingsRes, { data: latestRow }] = await Promise.all([
      fetch('/api/settings').then(r => r.json()),
      supabase.from('am_pairings').select('game').eq('level', level).order('game', { ascending: false }).limit(1),
    ])
    setTotalGames(settingsRes.totalGames || 3)
    const g = latestRow?.[0]?.game || 0
    setLatestGame(g)
    if (g > 0 && !userPickedGame) setGame(g)
  }, [level, userPickedGame])

  useEffect(() => { fetchGameInfo() }, [fetchGameInfo])

  // โหลดสถานะโต๊ะทั้งหมดของเกมปัจจุบัน
  const loadTableStatus = useCallback(async () => {
    if (!game || mode !== 'qualify') return
    const [{ data: pairs }, { data: games }] = await Promise.all([
      supabase.from('am_pairings').select('pair_num, is_bye').eq('level', level).eq('game', game).order('pair_num'),
      supabase.from('am_games').select('pair_num, score_a').eq('level', level).eq('game', game),
    ])
    setTablePairings((pairs || []) as { pair_num: number; is_bye: boolean }[])
    setScoredSet(new Set((games || []).filter((g: { score_a: number | null; pair_num: number }) => g.score_a !== null).map((g: { pair_num: number }) => g.pair_num)))
  }, [level, game, mode])

  useEffect(() => {
    if (mode !== 'qualify') { setTablePairings([]); return }
    loadTableStatus()
    const ch = supabase.channel(`scoring-status-${level}-${game}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'am_games', filter: `level=eq.${level}` }, loadTableStatus)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [level, game, mode, loadTableStatus])

  useEffect(() => {
    const ch = supabase.channel('broadcast-scoring')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'am_broadcast' }, payload => {
        const { type, level: bLevel, payload: p } = payload.new as { type: string; level: string; payload: { game?: number } }
        if (type === 'current_game' && bLevel === level) {
          const newGame = p.game || 0
          setLatestGame(newGame)
          if (!userPickedGame) setGame(newGame)
        }
        if (type === 'reset') clearForm()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [level, userPickedGame])

  // Debounced lookup by pair_num
  useEffect(() => {
    if (mode !== 'qualify') return
    if (lookupTimer.current) clearTimeout(lookupTimer.current)
    if (!pairNum) {
      setLookupState('idle'); setLookupMsg(''); setLookupResult(null)
      setNameA(''); setNameB(''); return
    }
    lookupTimer.current = setTimeout(() => doLookup(Number(pairNum)), 300)
    return () => { if (lookupTimer.current) clearTimeout(lookupTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairNum, game, level, mode])

  async function doLookup(num: number) {
    setLookupState('loading'); setLookupMsg('กำลังค้นหา...')
    setLookupResult(null); setExistingScore(null); setNameA(''); setNameB('')

    const { data: pa } = await supabase.from('am_pairings')
      .select('*, player_a:player_a_id(*), player_b:player_b_id(*)')
      .eq('level', level).eq('game', game).eq('pair_num', num).single()

    if (!pa) { setLookupState('error'); setLookupMsg(`ไม่พบคู่ที่ ${num} ในเกม ${game}`); return }
    if (pa.is_bye) { setLookupState('warn'); setLookupMsg('คู่นี้เป็น BYE — บันทึกให้อัตโนมัติแล้ว ไม่ต้องกรอก'); return }

    setLookupResult(pa as PairingRow)
    setNameA(disp(pa.player_a as Player))
    setNameB(pa.player_b ? disp(pa.player_b as Player) : '')
    setCodeA((pa.player_a as Player).code)
    setCodeB(pa.player_b ? (pa.player_b as Player).code : '')

    const { data: existing } = await supabase.from('am_games')
      .select('score_a, score_b').eq('level', level).eq('game', game).eq('pair_num', num).single()

    if (existing && existing.score_a !== null) {
      setExistingScore(existing as { score_a: number; score_b: number })
      setLookupState('warn')
      setLookupMsg(`กรอกไปแล้ว: ${existing.score_a} – ${existing.score_b} (กรอกใหม่เพื่อแก้ไข)`)
    } else {
      setLookupState('ok')
      setLookupMsg(`✅ พบคู่ที่ ${num}`)
    }
    setTimeout(() => scoreARef.current?.focus(), 50)
  }

  const loadPfPairs = useCallback(async (round: string) => {
    const res = await fetch(`/api/playoffs?level=${encodeURIComponent(level)}`)
    const data: PlayoffRow[] = await res.json()
    setPfPairs(data.filter(p => p.round === round))
  }, [level])

  useEffect(() => {
    if (mode === 'playoff') {
      setPfPair(''); setNameA(''); setNameB(''); setScoreA(''); setScoreB('')
      setCurrentPlayoff(null); loadPfPairs(pfRound)
    }
  }, [pfRound, level, mode, loadPfPairs])

  async function doSubmit(force = false) {
    setSubmitting(true); setStatus(null)
    const sa = Number(scoreA), sb = Number(scoreB)

    if (mode === 'qualify') {
      if (!lookupResult) { setSubmitting(false); return }
      const res = await fetch('/api/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game, level, pair_num: lookupResult.pair_num,
          player_a_id: lookupResult.player_a.id, score_a: sa,
          player_b_id: lookupResult.player_b?.id || null, score_b: sb,
          ...(force ? { force: true } : {}),
        }),
      })
      if (res.status === 409 && !force) { setConfirmOverwrite({ scoreA, scoreB }); setSubmitting(false); return }
      if (!res.ok) { const d = await res.json(); setStatus({ msg: d.error, ok: false }); setSubmitting(false); return }
      const cap = game === totalGames ? AM_MAX_DIFF_FINAL : AM_MAX_DIFF
      const r = computeMatchResult(sa, sb, cap)
      const diff = Math.max(-cap, Math.min(cap, sa - sb))
      const winner = r.resultA === 'W' ? nameA : r.resultB === 'W' ? nameB : null
      setStatus({ msg: `✅ บันทึกคู่ที่ ${lookupResult.pair_num} — ${winner ? winner + ' ชนะ' : 'เสมอ'} (ผลต่าง ${diff > 0 ? '+' : ''}${diff})`, ok: true })
    } else {
      if (!currentPlayoff) { setSubmitting(false); return }
      const res = await fetch('/api/playoffs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', level, round: pfRound, pair_num: currentPlayoff.pair_num, score_a: sa, score_b: sb }),
      })
      if (!res.ok) { const d = await res.json(); setStatus({ msg: d.error, ok: false }); setSubmitting(false); return }
      const cap = AM_MAX_DIFF_FINAL
      const diff = Math.max(-cap, Math.min(cap, sa - sb))
      const r = computeMatchResult(sa, sb, cap)
      const winner = r.resultA === 'W' ? nameA : r.resultB === 'W' ? nameB : null
      setStatus({ msg: `✅ บันทึก${pfRound} — ${winner ? winner + ' ชนะ' : 'เสมอ'} (ผลต่าง ${diff > 0 ? '+' : ''}${diff})`, ok: true })
      await loadPfPairs(pfRound)   // รีโหลดคู่รอบชิงให้ pill แสดงคะแนนล่าสุด ไม่ค้างค่าเก่า
    }

    clearForm(); setSubmitting(false)
    // คงเกมที่เลือกไว้ถ้ากำลังตามกรอกเกมเก่า — รีเซ็ตให้ตามเกมล่าสุดเฉพาะเมื่อกรอกเกมล่าสุดอยู่แล้ว
    if (mode === 'qualify' && game === latestGame) setUserPickedGame(false)
    setTimeout(() => pairNumRef.current?.focus(), 100)
  }

  async function submitResult(e: React.FormEvent) {
    e.preventDefault()
    if (scoreA === '' || scoreB === '') { alert('กรุณากรอกคะแนนทั้งสองฝั่ง'); return }
    if (!Number.isInteger(Number(scoreA)) || !Number.isInteger(Number(scoreB))) { alert('คะแนนไม่ถูกต้อง — กรุณากรอกตัวเลข'); return }
    if (Number(scoreA) === Number(scoreB)) {
      if (!confirm(`⚠️ คะแนนเท่ากัน ${scoreA} – ${scoreB} (เสมอ)\nยืนยันบันทึกหรือไม่?`)) return
    }
    await doSubmit(false)
  }

  function clearForm() {
    setPairNum(''); setLookupResult(null); setLookupMsg(''); setLookupState('idle'); setExistingScore(null)
    setNameA(''); setNameB(''); setCodeA(''); setCodeB(''); setScoreA(''); setScoreB(''); setConfirmOverwrite(null)
    setPfPair(''); setCurrentPlayoff(null)
  }

  const sa = Number(scoreA), sb = Number(scoreB)
  const cap = mode === 'playoff' ? AM_MAX_DIFF_FINAL : (game === totalGames ? AM_MAX_DIFF_FINAL : AM_MAX_DIFF)
  const diff = scoreA !== '' && scoreB !== '' ? Math.max(-cap, Math.min(cap, sa - sb)) : 0
  const win = scoreA !== '' && scoreB !== ''
    ? (sa > sb ? (nameA || 'ผู้เล่น A') + ' ชนะ' : sa < sb ? (nameB || 'ผู้เล่น B') + ' ชนะ' : 'เสมอ')
    : ''
  const previewColor = sa > sb ? 'bg-green-100 text-green-800 border-green-300'
    : sa < sb ? 'bg-red-100 text-red-800 border-red-300'
    : 'bg-gray-100 text-gray-700 border-gray-200'

  const subLabel = pairNum ? `โต๊ะที่ ${pairNum}` : ''
  const submitLabel = mode === 'qualify' && (lookupState === 'ok' || lookupState === 'warn')
    ? `🚀 ${lookupState === 'warn' && lookupResult ? '✏️ แก้ไขผล' : 'บันทึกผล'} ${subLabel} เกม ${game}`
    : mode === 'playoff' && currentPlayoff ? `🚀 บันทึก${pfRound}`
    : '🚀 บันทึกผลแมตช์'

  const nonByePairings = tablePairings.filter(p => !p.is_bye)
  const pendingCount = nonByePairings.filter(p => !scoredSet.has(p.pair_num)).length
  const pct = nonByePairings.length > 0 ? Math.round((nonByePairings.length - pendingCount) / nonByePairings.length * 100) : 0

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pb-10" style={{ background: '#F0F9FF' }}>
      {/* Header */}
      <div className="w-full max-w-md rounded-3xl p-6 text-center text-white mb-4 shadow-xl" style={{ background: PRIMARY }}>
        <div className="text-3xl mb-1">✍️</div>
        <h1 className="text-xl font-black" style={{ fontFamily: "'Nunito',sans-serif" }}>กรอกผลแมตช์ A-Math</h1>
        <p className="text-sky-100 text-xs mt-1 font-semibold">โรงเรียนพูลเจริญวิทยาคม</p>
      </div>

      <div className="w-full max-w-md space-y-3">
        {/* Level toggle */}
        <div className="flex bg-white rounded-2xl p-1.5 border-2 border-sky-100 shadow-sm">
          {(['มต้น', 'มปลาย'] as Level[]).map(lv => (
            <button key={lv} onClick={() => { setLevel(lv); clearForm(); setUserPickedGame(false) }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${level === lv ? 'text-white shadow' : 'text-sky-600 hover:text-sky-800'}`}
              style={level === lv ? { background: PRIMARY } : {}}>
              {lv === 'มต้น' ? '🌱 ม.ต้น' : '🌸 ม.ปลาย'}
            </button>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="flex bg-white rounded-2xl p-1.5 border-2 border-sky-100 shadow-sm">
          {([['qualify', '🎮 รอบคัดเลือก'], ['playoff', '🏆 รอบชิงชนะเลิศ']] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m as Mode); clearForm() }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${mode === m ? 'text-white shadow' : 'text-sky-600'}`}
              style={mode === m ? { background: 'linear-gradient(135deg,#F98B8B,#FDBBBB)' } : {}}>
              {label}
            </button>
          ))}
        </div>

        {/* ── สถานะโต๊ะทั้งหมด ── */}
        {mode === 'qualify' && tablePairings.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-black text-sky-700">📋 ความคืบหน้าเกม {game}</p>
              <p className="text-xs font-bold text-sky-500">
                {nonByePairings.length - pendingCount}/{nonByePairings.length} คู่
                {pendingCount === 0 && nonByePairings.length > 0 && <span className="ml-1 text-green-600">✅ ครบแล้ว!</span>}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-sky-100 rounded-full h-2 mb-3">
              <div className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : PRIMARY }} />
            </div>
            {/* โต๊ะ pills */}
            <div className="flex flex-wrap gap-1.5">
              {tablePairings.map(p => (
                <button key={p.pair_num} type="button"
                  onClick={() => {
                    if (p.is_bye) return
                    setPairNum(String(p.pair_num))
                    setTimeout(() => pairNumRef.current?.focus(), 50)
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black border transition-all
                    ${p.is_bye
                      ? 'bg-sky-50 text-sky-300 border-sky-100 cursor-default'
                      : String(p.pair_num) === pairNum
                        ? 'bg-sky-500 text-white border-sky-600 ring-2 ring-sky-300 active:scale-95'
                        : scoredSet.has(p.pair_num)
                          ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                          : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 active:scale-95'
                    }`}>
                  {p.pair_num}{p.is_bye ? ' 🎁' : ''}
                </button>
              ))}
            </div>
            {pendingCount > 0 && (
              <p className="text-xs text-red-500 font-semibold mt-2">🔴 = ยังไม่ได้กรอก (กดเพื่อเลือก) &nbsp;🟢 = กรอกแล้ว</p>
            )}
          </div>
        )}

        <form onSubmit={submitResult} className="bg-white rounded-3xl p-5 shadow-sm border border-sky-100 space-y-4">
          {mode === 'qualify' && (
            <>
              {/* Game pills */}
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-2">🎮 เกมที่</label>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: latestGame || 1 }, (_, i) => i + 1).map(g => (
                    <button key={g} type="button"
                      onClick={() => { setGame(g); setUserPickedGame(true); clearForm() }}
                      className={`relative flex-1 min-w-[44px] py-2.5 rounded-xl font-black text-sm border-2 transition-all active:scale-95 ${game === g ? 'text-white shadow border-sky-400' : 'bg-sky-50 border-sky-200 text-sky-600 hover:border-amber-400'}`}
                      style={game === g ? { background: PRIMARY } : {}}>
                      {g}
                      {latestGame === g && (
                        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {game < latestGame && (
                <div className="rounded-xl p-3 bg-amber-50 border-2 border-amber-300 text-amber-800 text-xs font-bold">
                  ⚠️ คุณกำลังกรอกเกม {game} แต่จัดคู่เกม {latestGame} แล้ว
                </div>
              )}

              {/* Pair number input */}
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-2">🪑 โต๊ะ</label>
                <input
                  ref={pairNumRef}
                  value={pairNum}
                  onChange={e => setPairNum(e.target.value.replace(/\D/g, ''))}
                  placeholder="หมายเลขโต๊ะ (1, 2, 3...)"
                  inputMode="numeric"
                  className="w-full px-3 py-3 border-2 border-sky-100 rounded-xl text-lg font-black text-center bg-sky-50 focus:outline-none focus:border-sky-400"
                />
                <div className="mt-2 min-h-[1.25rem]">
                  {lookupState === 'loading' && <p className="text-xs font-bold text-sky-400">⏳ กำลังค้นหา...</p>}
                  {lookupState === 'ok' && <p className="text-xs font-bold text-green-700">{lookupMsg}</p>}
                  {lookupState === 'warn' && <p className="text-xs font-bold text-orange-600">⚠️ {lookupMsg}</p>}
                  {lookupState === 'error' && <p className="text-xs font-bold text-red-600">❌ {lookupMsg}</p>}
                </div>
              </div>
            </>
          )}

          {mode === 'playoff' && (
            <>
              <div className="flex bg-white rounded-2xl p-1.5 border-2 border-pink-100 shadow-sm gap-1">
                {(['ชิงชนะเลิศ', 'ชิงที่3'] as const).map(r => (
                  <button key={r} type="button" onClick={() => { setPfRound(r); setPfPair(''); setNameA(''); setNameB(''); setScoreA(''); setScoreB(''); setCurrentPlayoff(null) }}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${pfRound === r ? 'text-white shadow' : 'text-pink-400'}`}
                    style={pfRound === r ? { background: 'linear-gradient(135deg,#F98B8B,#FDBBBB)' } : {}}>
                    {r === 'ชิงชนะเลิศ' ? '🏆 ชิงอันดับ 1' : '🥉 ชิงอันดับ 3'}
                  </button>
                ))}
              </div>
              {pfPairs.length > 0 ? (
                <div>
                  <label className="block text-xs font-bold text-sky-700 mb-2">🎯 เลือกคู่</label>
                  <div className="flex gap-2 flex-wrap">
                    {pfPairs.map(p => (
                      <button key={p.pair_num} type="button"
                        onClick={() => {
                          setPfPair(String(p.pair_num)); setCurrentPlayoff(p)
                          setNameA(disp(p.player_a)); setNameB(disp(p.player_b))
                          setCodeA(p.player_a.code); setCodeB(p.player_b.code)
                          setScoreA(p.score_a !== null ? String(p.score_a) : '')
                          setScoreB(p.score_b !== null ? String(p.score_b) : '')
                          setTimeout(() => scoreARef.current?.focus(), 50)
                        }}
                        className={`flex-1 min-w-[80px] py-2.5 px-3 rounded-xl font-bold text-sm border-2 transition-all active:scale-95 ${pfPair === String(p.pair_num) ? 'text-white border-transparent' : 'bg-sky-50 border-sky-100 text-sky-700'}`}
                        style={pfPair === String(p.pair_num) ? { background: PRIMARY } : {}}>
                        คู่ {p.pair_num}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-sky-300 text-sm py-3 font-semibold">ยังไม่มีข้อมูล{pfRound}</p>
              )}
            </>
          )}

          {/* Player cards */}
          {(codeA || codeB) && (
            <div className="flex gap-2 items-center">
              <div className="flex-1 rounded-2xl p-3 border-2 border-sky-100 bg-sky-50 text-center">
                <p className="text-[10px] font-black text-sky-400 uppercase tracking-wider mb-1">ฝั่ง A</p>
                <p className="font-black text-amber-500 text-2xl leading-tight">{codeA || '—'}</p>
              </div>
              <div className="font-black text-sky-300 text-xl">VS</div>
              <div className="flex-1 rounded-2xl p-3 border-2 border-sky-100 bg-sky-50 text-center">
                <p className="text-[10px] font-black text-sky-400 uppercase tracking-wider mb-1">ฝั่ง B</p>
                <p className="font-black text-amber-500 text-2xl leading-tight">{codeB || '—'}</p>
              </div>
            </div>
          )}

          {/* Score inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-sky-700 mb-1 text-center truncate">{nameA || 'ผู้เล่น A'}</label>
              <input ref={scoreARef} value={scoreA} onChange={e => setScoreA(e.target.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scoreBRef.current?.focus() } }}
                placeholder="0" type="text" inputMode="numeric" pattern="[0-9]*"
                className="w-full px-3 py-4 border-2 border-sky-100 rounded-xl text-2xl font-black text-center bg-sky-50 focus:outline-none focus:border-sky-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-sky-700 mb-1 text-center truncate">{nameB || 'ผู้เล่น B'}</label>
              <input ref={scoreBRef} value={scoreB} onChange={e => setScoreB(e.target.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''))}
                placeholder="0" type="text" inputMode="numeric" pattern="[0-9]*"
                className="w-full px-3 py-4 border-2 border-sky-100 rounded-xl text-2xl font-black text-center bg-sky-50 focus:outline-none focus:border-sky-400" />
            </div>
          </div>

          {/* Preview */}
          {scoreA !== '' && scoreB !== '' && (
            <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-black border-2 ${previewColor}`}>
              {win} {sa !== sb ? `(ผลต่าง ${diff > 0 ? '+' : ''}${diff})` : ''}
              {Math.abs(sa - sb) > cap && <span className="ml-2 text-orange-600">⚠️ cap ±{cap}</span>}
            </div>
          )}

          {/* Confirm overwrite */}
          {confirmOverwrite && (
            <div className="rounded-2xl p-4 border-2 border-sky-200 bg-sky-50 space-y-3">
              <p className="text-sm font-black text-sky-700">⚠️ คู่ที่ {pairNum} เกม {game} มีผลอยู่แล้ว</p>
              <p className="text-xs text-sky-600">ผลเดิม: <strong>{existingScore?.score_a} – {existingScore?.score_b}</strong></p>
              <p className="text-xs text-sky-500">ต้องการเขียนทับด้วย {confirmOverwrite.scoreA} – {confirmOverwrite.scoreB} หรือไม่?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => doSubmit(true)} disabled={submitting}
                  className="flex-1 py-2 rounded-xl text-white font-bold text-sm active:scale-95 transition disabled:opacity-40"
                  style={{ background: PRIMARY }}>✅ ยืนยันเขียนทับ</button>
                <button type="button" onClick={() => setConfirmOverwrite(null)}
                  className="flex-1 py-2 rounded-xl bg-white border-2 border-sky-100 text-sky-600 font-bold text-sm hover:bg-sky-50 active:scale-95 transition">ยกเลิก</button>
              </div>
            </div>
          )}

          <button type="submit"
            disabled={submitting
              || (mode === 'qualify' && lookupState !== 'ok' && lookupState !== 'warn')
              || (mode === 'qualify' && lookupState === 'warn' && lookupResult === null)
              || (mode === 'playoff' && !currentPlayoff)}
            className="w-full py-3.5 rounded-2xl font-black text-base text-white shadow-lg transition-all active:scale-95 disabled:opacity-40"
            style={{ background: PRIMARY }}>
            {submitting ? '⏳ กำลังบันทึก...' : submitLabel}
          </button>

          {status && (
            <div className={`rounded-xl px-4 py-3 border-2 font-bold text-sm ${status.ok ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
              {status.msg}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
