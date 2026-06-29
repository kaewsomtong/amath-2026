import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { loadStandings } from '@/app/api/standings/route'

// GET /api/playoffs?level=มต้น
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')
  if (!level) return NextResponse.json({ error: 'ต้องระบุ level' }, { status: 400 })
  const { data } = await supabase.from('am_playoffs')
    .select('*, player_a:player_a_id(*), player_b:player_b_id(*)')
    .eq('level', level).order('round').order('pair_num')
  return NextResponse.json(data || [])
}

// POST /api/playoffs
//   { action: 'generate', level }      → ดึง top 4 สร้างคู่ชิง (1v2 และ 3v4)
//   { action: 'save', level, round, pair_num, score_a, score_b }  → บันทึกผล
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, level } = body as { action: string; level: string }

  if (action === 'generate') {
    // ตรวจว่าจัดคู่ครบ totalGames แล้ว
    const { data: settings } = await supabase.from('am_settings').select('value').eq('key', 'totalGames').single()
    const totalGames = parseInt(settings?.value || '3')
    const { data: pairings } = await supabase.from('am_pairings').select('game').eq('level', level)
    const gamesWithPairings = new Set((pairings || []).map((p: { game: number }) => p.game))
    if (gamesWithPairings.size < totalGames) {
      return NextResponse.json({ error: `ยังจัดคู่ไม่ครบ — ต้องจัดครบ ${totalGames} เกมก่อน (จัดแล้ว ${gamesWithPairings.size} เกม)` }, { status: 400 })
    }
    // ตรวจว่ากรอกผลครบทุกเกมแล้ว
    const { data: games } = await supabase.from('am_games').select('game, pair_num, score_a').eq('level', level)
    for (let g = 1; g <= totalGames; g++) {
      const { data: fullPairings } = await supabase.from('am_pairings')
        .select('pair_num, is_bye').eq('level', level).eq('game', g)
      const nonBye = (fullPairings || []).filter((p: { is_bye: boolean }) => !p.is_bye)
      const scored = (games || []).filter((gm: { game: number; score_a: number | null }) =>
        gm.game === g && gm.score_a !== null)
      if (scored.length < nonBye.length) {
        return NextResponse.json({ error: `กรอกผลเกม ${g} ยังไม่ครบ — กรอกแล้ว ${scored.length}/${nonBye.length} คู่` }, { status: 400 })
      }
    }
    const { standings } = await loadStandings(level)
    if (standings.length < 4) {
      return NextResponse.json({ error: 'ต้องมีผู้เข้าแข่งขันอย่างน้อย 4 อันดับ' }, { status: 400 })
    }
    const top4 = standings.slice(0, 4)
    await supabase.from('am_playoffs').delete().eq('level', level)
    const rows = [
      { level, round: 'ชิงชนะเลิศ', pair_num: 1, player_a_id: top4[0].player.id, player_b_id: top4[1].player.id },
      { level, round: 'ชิงที่3',     pair_num: 1, player_a_id: top4[2].player.id, player_b_id: top4[3].player.id },
    ]
    const { error } = await supabase.from('am_playoffs').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('am_broadcast').insert({ type: 'playoff_generated', level, payload: {} })
    return NextResponse.json({ ok: true })
  }

  if (action === 'save') {
    const { round, pair_num, score_a, score_b } = body as { round: string; pair_num: number; score_a: number; score_b: number }
    if (!Number.isInteger(score_a) || !Number.isInteger(score_b)) {
      return NextResponse.json({ error: 'คะแนนต้องเป็นจำนวนเต็ม' }, { status: 400 })
    }
    const { error } = await supabase.from('am_playoffs')
      .update({ score_a, score_b })
      .eq('level', level).eq('round', round).eq('pair_num', pair_num)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('am_broadcast').insert({ type: 'playoff_result', level, payload: { round } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 })
}
