'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { computeMatchResult, AM_MAX_DIFF_FINAL } from '@/lib/am-logic'

type Level = 'มต้น' | 'มปลาย'
type View = 'standings' | 'tables' | 'playoff' | 'awards'
interface Player { id: number; code: string; name: string; school: string; member2: string }
interface Standing { rank: number; player: Player; points: number; diffSum: number; wins: number; ties: number; losses: number; gamesPlayed: number }
interface PairingRow { pair_num: number; player_a: Player; player_b: Player | null; is_bye: boolean }
interface PlayoffRow { round: string; pair_num: number; player_a: Player; player_b: Player; score_a: number | null; score_b: number | null }

const PRIMARY = 'linear-gradient(135deg,#0284C7,#38BDF8)'

export default function DisplayPage() {
  const [level, setLevel] = useState<Level>('มต้น')
  const [view, setView] = useState<View>('standings')
  const [standings, setStandings] = useState<Standing[]>([])
  const [pairings, setPairings] = useState<PairingRow[]>([])
  const [latestGame, setLatestGame] = useState(0)
  const [totalGames, setTotalGames] = useState(3)
  const [playoffs, setPlayoffs] = useState<PlayoffRow[]>([])
  const [scoredPairs, setScoredPairs] = useState<Set<number>>(new Set())
  const [lastUpdate, setLastUpdate] = useState('')
  const [realtimeOk, setRealtimeOk] = useState(true)
  const [dark, setDark] = useState(false)
  const [projector, setProjector] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [clock, setClock] = useState('')
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const views: View[] = ['standings', 'tables', 'playoff', 'awards']

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!autoRotate) return
    const id = setInterval(() => setView(v => views[(views.indexOf(v) + 1) % views.length]), 15000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRotate])

  const loadAll = useCallback(async () => {
    const [settingsRes, standingsRes, pfRes] = await Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch(`/api/standings?level=${encodeURIComponent(level)}`).then(r => r.json()),
      fetch(`/api/playoffs?level=${encodeURIComponent(level)}`).then(r => r.json()),
    ])
    setTotalGames(settingsRes.totalGames || 3)
    setStandings(standingsRes.standings || [])
    setPlayoffs((pfRes || []) as PlayoffRow[])

    const { data: latestRow } = await supabase.from('am_pairings')
      .select('game').eq('level', level).order('game', { ascending: false }).limit(1)
    const maxGame = latestRow?.[0]?.game || 0
    setLatestGame(maxGame)

    if (maxGame > 0) {
      const [{ data: pa }, { data: gs }] = await Promise.all([
        supabase.from('am_pairings').select('*, player_a:player_a_id(*), player_b:player_b_id(*)').eq('level', level).eq('game', maxGame).order('pair_num'),
        supabase.from('am_games').select('pair_num, score_a').eq('level', level).eq('game', maxGame),
      ])
      setPairings((pa || []) as PairingRow[])
      setScoredPairs(new Set((gs || []).filter(g => g.score_a !== null).map(g => g.pair_num as number)))
    } else {
      setPairings([]); setScoredPairs(new Set())
    }

    setLastUpdate(new Date().toLocaleTimeString('th-TH'))
    setRealtimeOk(true)
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current)
    realtimeTimer.current = setTimeout(() => setRealtimeOk(false), 60000)
  }, [level])

  useEffect(() => {
    loadAll()
    const ch = supabase.channel(`display-${level}-${reconnectKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'am_games', filter: `level=eq.${level}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'am_pairings', filter: `level=eq.${level}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'am_playoffs', filter: `level=eq.${level}` }, loadAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'am_broadcast' }, payload => {
        const { type, level: bLevel, payload: bp } = payload.new as { type: string; level: string; payload: { message?: string } }
        if (type === 'announcement' && bp?.message) {
          setAnnouncement(bp.message)
          setTimeout(() => setAnnouncement(null), 30000)
        } else if (bLevel === level || type === 'reset') loadAll()
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setRealtimeOk(true)
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeOk(false)
          reconnectTimer.current = setTimeout(() => setReconnectKey(k => k + 1), 10000)
        }
      })
    return () => {
      supabase.removeChannel(ch)
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [level, loadAll, reconnectKey])

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

  const disp = (p: Player) => p.member2 ? `${p.name} + ${p.member2}` : p.name
  const awards = getAwards()

  const sz = projector
    ? { name: 'text-xl', stat: 'text-lg', pts: 'text-2xl', cell: 'p-4', award: 'text-7xl', awardName: 'text-3xl', awardSub: 'text-base' }
    : { name: 'text-base', stat: 'text-sm', pts: 'text-lg', cell: 'p-3', award: 'text-5xl', awardName: 'text-xl', awardSub: 'text-sm' }

  const dk = dark
    ? { bg: '#0c1a2e', card: '#0f2340', border: '#1e3a5f', text: 'text-sky-100', subtext: 'text-sky-400', thead: '#075985', rowEven: 'bg-sky-950/20' }
    : { bg: '#F0F9FF', card: 'white', border: '#BAE6FD', text: 'text-gray-900', subtext: 'text-sky-500', thead: '#0369A1', rowEven: 'bg-sky-50/40' }

  return (
    <div className="min-h-screen pb-16 transition-colors duration-300" style={{ background: dk.bg }}>
      {/* Header */}
      <div className="rounded-b-3xl p-5 text-center shadow-xl mb-4" style={{ background: PRIMARY, color: 'white' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-black text-sky-100 tabular-nums text-sm w-24 text-left">{clock}</span>
          <h1 className="font-black text-xl flex-1" style={{ fontFamily: "'Nunito',sans-serif" }}>🔢 A-Math</h1>
          <div className="flex gap-1.5 w-24 justify-end">
            <button onClick={() => setDark(v => !v)}
              className={`text-xs font-bold px-2 py-1.5 rounded-lg transition ${dark ? 'bg-white text-sky-800' : 'bg-white/20 text-sky-100 hover:bg-white/30'}`}>
              {dark ? '☀️' : '🌙'}
            </button>
            <button onClick={() => setProjector(v => !v)}
              className={`text-xs font-bold px-2 py-1.5 rounded-lg transition ${projector ? 'bg-white text-sky-800' : 'bg-white/20 text-sky-100 hover:bg-white/30'}`}>
              {projector ? '🔍' : '📽️'}
            </button>
            <button onClick={() => setAutoRotate(v => !v)}
              className={`text-xs font-bold px-2 py-1.5 rounded-lg transition ${autoRotate ? 'bg-white text-sky-800' : 'bg-white/20 text-sky-100 hover:bg-white/30'}`}>
              {autoRotate ? '⏸️' : '▶️'}
            </button>
            <button onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen() }}
              className="text-xs font-bold px-2 py-1.5 rounded-lg bg-white/20 text-sky-100 hover:bg-white/30 transition">⛶</button>
          </div>
        </div>
        <p className="text-sky-100 text-xs font-semibold">โรงเรียนพูลเจริญวิทยาคม</p>
      </div>

      {!realtimeOk && (
        <div className="mx-4 mb-3 rounded-2xl p-3 bg-red-100 border-2 border-red-300 text-red-700 font-bold text-sm text-center flex items-center justify-center gap-2 flex-wrap">
          ⚠️ การเชื่อมต่อหลุด — กำลัง reconnect...
          <button onClick={() => setReconnectKey(k => k + 1)} className="px-3 py-1 bg-red-600 text-white rounded-xl text-xs font-bold">reconnect เดี๋ยวนี้</button>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4">
        {/* Level + View toggles */}
        <div className="mb-4 space-y-2">
          <div className="flex rounded-2xl p-1 border-2 gap-1" style={{ background: dk.card, borderColor: dk.border }}>
            {(['มต้น', 'มปลาย'] as Level[]).map(lv => (
              <button key={lv} onClick={() => setLevel(lv)}
                className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all ${level === lv ? 'text-white shadow' : `${dk.subtext} hover:opacity-80`}`}
                style={level === lv ? { background: PRIMARY } : {}}>
                {lv === 'มต้น' ? '🌱 ม.ต้น' : '🌸 ม.ปลาย'}
              </button>
            ))}
          </div>
          <div className="flex rounded-2xl p-1 border-2 gap-0.5" style={{ background: dk.card, borderColor: dk.border }}>
            {([['standings', '📊 อันดับ'], ['tables', '🪑 โต๊ะ'], ['playoff', '🏆 รอบชิง'], ['awards', '🎖️ รางวัล']] as [View, string][]).map(([v, label]) => (
              <button key={v} onClick={() => { setView(v); setAutoRotate(false) }}
                className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${view === v ? 'text-white shadow' : `${dk.subtext} hover:opacity-80`}`}
                style={view === v ? { background: 'linear-gradient(135deg,#F59E0B,#FBBF24)' } : {}}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Announcement */}
        {announcement && (
          <div className="mb-4 rounded-2xl p-4 text-center font-black text-white text-lg shadow-xl animate-pulse"
            style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
            📢 {announcement}
            <button onClick={() => setAnnouncement(null)} className="ml-3 text-sm opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Current game badge */}
        {latestGame > 0 && (
          <div className="rounded-2xl p-3 mb-4 text-center text-white font-black text-sm shadow" style={{ background: PRIMARY }}>
            ⚡ ขณะนี้อยู่ในเกมที่ {latestGame}
          </div>
        )}

        {/* ── STANDINGS ── */}
        {view === 'standings' && (
          <div className="rounded-3xl overflow-hidden shadow border" style={{ background: dk.card, borderColor: dk.border }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: dk.thead }} className="text-white">
                  <th className={`${sz.cell} text-center`}>อันดับ</th>
                  <th className={`${sz.cell} text-left`}>ชื่อ-สกุล</th>
                  <th className={`${sz.cell} text-center hidden sm:table-cell`}>ห้อง</th>
                  <th className={`${sz.cell} text-center`}>W-T-L</th>
                  <th className={`${sz.cell} text-center`}>แต้ม</th>
                  <th className={`${sz.cell} text-center`}>ผลต่าง</th>
                </tr>
              </thead>
              <tbody>
                {standings.length === 0 && <tr><td colSpan={6} className={`text-center py-12 ${dk.subtext}`}>ยังไม่มีข้อมูล</td></tr>}
                {standings.map((s, i) => (
                  <tr key={s.player.id} className={`border-b ${i === 0 ? 'bg-yellow-50' : i === 1 ? 'bg-slate-50' : i === 2 ? 'bg-orange-50' : i % 2 === 0 ? '' : dk.rowEven}`}
                    style={{ borderColor: dk.border }}>
                    <td className={`${sz.cell} text-center`}>
                      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-black text-sm ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-amber-100 text-amber-700'}`}>
                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : s.rank}
                      </span>
                    </td>
                    <td className={`${sz.cell} font-semibold ${sz.name} ${dk.text}`}>
                      {disp(s.player)}
                      <span className={`font-normal text-xs ml-1 ${dk.subtext}`}>({s.player.code})</span>
                    </td>
                    <td className={`${sz.cell} text-center ${sz.stat} ${dk.subtext} hidden sm:table-cell`}>{s.player.school}</td>
                    <td className={`${sz.cell} text-center ${sz.stat} text-sky-500`}>{s.wins}-{s.ties}-{s.losses}</td>
                    <td className={`${sz.cell} text-center font-black ${sz.pts} ${dk.text}`}>{s.points}</td>
                    <td className={`${sz.cell} text-center font-bold ${sz.stat} ${s.diffSum > 0 ? 'text-emerald-600' : s.diffSum < 0 ? 'text-red-500' : dk.subtext}`}>
                      {s.diffSum > 0 ? '+' : ''}{s.diffSum}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TABLES (คู่แข่งเกมปัจจุบัน) ── */}
        {view === 'tables' && (
          <div>
            {pairings.length === 0
              ? <p className={`text-center py-12 ${dk.subtext}`}>ยังไม่มีการจัดคู่</p>
              : (
                <>
                  <p className={`font-black text-amber-700 mb-3 ${projector ? 'text-2xl' : 'text-sm'}`}>โต๊ะเกมที่ {latestGame}:</p>
                  <div className="space-y-2">
                    {pairings.map(r => (
                      <div key={r.pair_num} className="rounded-2xl overflow-hidden shadow-sm border" style={{ background: dk.card, borderColor: dk.border }}>
                        <div className="px-4 py-2.5 text-white font-black text-sm flex items-center gap-2" style={{ background: PRIMARY }}>
                          <span>โต๊ะ {r.pair_num}</span>
                          {!r.is_bye && (
                            <span className={`inline-block w-2 h-2 rounded-full ml-auto ${scoredPairs.has(r.pair_num) ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                          )}
                        </div>
                        <div className={`px-4 py-3 ${sz.name}`}>
                          {r.is_bye
                            ? <span className="text-sky-500">🎁 {disp(r.player_a)} ได้ BYE</span>
                            : <span className={dk.text}>
                              {disp(r.player_a)} <span className={`font-black ${dk.subtext}`}>({r.player_a.code})</span>
                              <strong className="text-sky-500 mx-2">VS</strong>
                              {r.player_b ? disp(r.player_b) : '—'} {r.player_b && <span className={`font-black ${dk.subtext}`}>({r.player_b.code})</span>}
                            </span>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
          </div>
        )}

        {/* ── PLAYOFF ── */}
        {view === 'playoff' && (
          <div className="space-y-3">
            {playoffs.length === 0
              ? <p className={`text-center py-12 ${dk.subtext}`}>ยังไม่มีข้อมูลรอบชิง</p>
              : playoffs.map((p, i) => {
                const cap = AM_MAX_DIFF_FINAL
                const r = (p.score_a !== null && p.score_b !== null) ? computeMatchResult(p.score_a, p.score_b, cap) : null
                const p1win = r?.resultA === 'W'; const p2win = r?.resultB === 'W'
                const hasTie = p.score_a !== null && p.score_b !== null && p.score_a === p.score_b
                return (
                  <div key={i} className="rounded-2xl overflow-hidden shadow-sm border" style={{ background: dk.card, borderColor: dk.border }}>
                    <div className="px-4 py-2.5 text-white font-black text-sm" style={{ background: PRIMARY }}>
                      {p.round === 'ชิงชนะเลิศ' ? '🏆 ชิงชนะเลิศ (อันดับ 1)' : '🥉 ชิงอันดับ 3'}
                    </div>
                    <div className={`px-4 py-4 flex items-center gap-3 ${sz.name}`}>
                      <div className={`flex-1 text-center p-3 rounded-xl ${p1win ? 'bg-emerald-100' : p2win ? 'bg-red-50' : ''}`}>
                        <p className={`font-black ${p1win ? 'text-emerald-700' : p2win ? 'text-red-400' : dk.text}`}>{disp(p.player_a)}</p>
                        <p className={`text-xs ${dk.subtext}`}>({p.player_a.code})</p>
                        {p.score_a !== null && <p className="font-black text-2xl text-amber-700">{p.score_a}</p>}
                      </div>
                      <div className="font-black text-amber-400 text-xl">VS</div>
                      <div className={`flex-1 text-center p-3 rounded-xl ${p2win ? 'bg-emerald-100' : p1win ? 'bg-red-50' : ''}`}>
                        <p className={`font-black ${p2win ? 'text-emerald-700' : p1win ? 'text-red-400' : dk.text}`}>{disp(p.player_b)}</p>
                        <p className={`text-xs ${dk.subtext}`}>({p.player_b.code})</p>
                        {p.score_b !== null && <p className="font-black text-2xl text-amber-700">{p.score_b}</p>}
                      </div>
                    </div>
                    {r && !hasTie && (
                      <div className="px-4 pb-3 text-center">
                        <span className="text-xs font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                          ✅ {p1win ? disp(p.player_a) : disp(p.player_b)} ชนะ
                        </span>
                      </div>
                    )}
                    {hasTie && (
                      <div className="px-4 pb-3 text-center">
                        <span className="text-xs font-black text-amber-600 bg-amber-100 px-3 py-1 rounded-full">⚠️ เสมอ — กรรมการต้องตัดสิน</span>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}

        {/* ── AWARDS ── */}
        {view === 'awards' && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => window.print()}
                className="px-4 py-2 rounded-xl border border-sky-300 text-sky-700 text-xs font-bold hover:bg-sky-50 transition">
                🖨️ พิมพ์รายชื่อผู้ได้รับรางวัล
              </button>
            </div>
            {awards.champion && (
              <div className="rounded-3xl p-5 mb-3 flex gap-4 items-center border-2 border-yellow-300 bg-yellow-50 shadow-lg">
                <span className={sz.award}>🥇</span>
                <div>
                  <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-1">ชนะเลิศ อันดับ 1</p>
                  <p className={`font-black ${sz.awardName} text-gray-900`}>{disp(awards.champion)}</p>
                  <p className={`text-amber-600 ${sz.awardSub} font-semibold`}>{awards.champion.code} · {awards.champion.school}</p>
                </div>
              </div>
            )}
            {awards.runnerUp && (
              <div className="rounded-3xl p-5 mb-3 flex gap-4 items-center border-2 border-slate-300 bg-slate-50 shadow-lg">
                <span className={sz.award}>🥈</span>
                <div>
                  <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-1">รองชนะเลิศ อันดับ 2</p>
                  <p className={`font-black ${sz.awardName} text-gray-900`}>{disp(awards.runnerUp)}</p>
                  <p className={`text-slate-500 ${sz.awardSub} font-semibold`}>{awards.runnerUp.code} · {awards.runnerUp.school}</p>
                </div>
              </div>
            )}
            {awards.third && (
              <div className="rounded-3xl p-5 mb-3 flex gap-4 items-center border-2 border-orange-300 bg-orange-50 shadow-lg">
                <span className={sz.award}>🥉</span>
                <div>
                  <p className="text-xs font-black text-orange-700 uppercase tracking-widest mb-1">อันดับ 3</p>
                  <p className={`font-black ${sz.awardName} text-gray-900`}>{disp(awards.third)}</p>
                  <p className={`text-orange-600 ${sz.awardSub} font-semibold`}>{awards.third.code} · {awards.third.school}</p>
                </div>
              </div>
            )}
            {!awards.champion && !awards.runnerUp && !awards.third && (
              <p className={`text-center py-12 ${dk.subtext}`}>⏳ ยังไม่มีผลชิงชนะเลิศ</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6 text-xs font-semibold">
          {realtimeOk
            ? <span className={dk.subtext}><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>Live · อัปเดตล่าสุด: {lastUpdate || '...'}</span>
            : <span className="text-red-400"><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span>ออฟไลน์ · {lastUpdate}</span>
          }
        </div>
      </div>
    </div>
  )
}
