import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateGame1, generateKingOfHill, pairInOrder, AM_BYE_DIFF, Player } from '@/lib/am-logic'
import { loadStandings } from '@/app/api/standings/route'

// GET /api/pairings?level=มต้น&game=1
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')
  const game = req.nextUrl.searchParams.get('game')
  if (!level || !game) return NextResponse.json({ error: 'ต้องระบุ level และ game' }, { status: 400 })
  const { data, error } = await supabase.from('am_pairings')
    .select('*, player_a:player_a_id(*), player_b:player_b_id(*)')
    .eq('level', level).eq('game', game).order('pair_num')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/pairings  { level, game, gibsonCodes?: string[] }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { level, game, gibsonCodes = [] } = body as { level: string; game: number; gibsonCodes?: string[] }
  if (!level || !game) return NextResponse.json({ error: 'ต้องระบุ level และ game' }, { status: 400 })

  const { data: playersData } = await supabase.from('am_players').select('*').eq('level', level).order('code')
  const players = (playersData || []) as Player[]
  if (players.length < 2) {
    return NextResponse.json({ error: 'ผู้เข้าแข่งขันไม่เพียงพอ (ต้องการอย่างน้อย 2 ทีม/คน)' }, { status: 400 })
  }

  // ดึง totalGames เพื่อตรวจว่าเป็นเกมสุดท้ายหรือไม่
  const { data: settingData } = await supabase.from('am_settings').select('value').eq('key', 'totalGames').single()
  const totalGames = Number(settingData?.value) || 3
  const isLastGame = Number(game) === totalGames

  let pairs: { pair_num: number; idA: number; idB: number | null }[]
  if (Number(game) === 1) {
    pairs = generateGame1(players)
  } else {
    const { standings } = await loadStandings(level)
    if (standings.filter((s) => s.gamesPlayed > 0).length < 2) {
      return NextResponse.json({ error: 'ยังไม่มีผลการแข่งขันก่อนหน้า — กรอกผลเกมก่อนหน้าก่อนจัดคู่' }, { status: 400 })
    }

    // Gibsonize: เกมสุดท้าย + มีรหัสที่ระบุ → แยกออก ให้ bye อัตโนมัติ
    if (isLastGame && gibsonCodes.length > 0) {
      const gibsonPlayers = players.filter((p) => gibsonCodes.includes(p.code))
      const activeStandings = standings.filter((s) => !gibsonCodes.includes(s.player.code))
      const activePairs = pairInOrder(activeStandings.map((s) => s.player))
      let pairNum = activePairs.length + 1
      const byePairs = gibsonPlayers.map((p) => ({
        pair_num: pairNum++,
        idA: p.id,
        idB: null as number | null,
      }))
      pairs = [...activePairs, ...byePairs]
    } else {
      pairs = generateKingOfHill(standings)
    }
  }

  await supabase.from('am_pairings').delete().eq('level', level).eq('game', game)
  await supabase.from('am_games').delete().eq('level', level).eq('game', game)

  const pairingRows = pairs.map((p) => ({
    game, level, pair_num: p.pair_num,
    player_a_id: p.idA, player_b_id: p.idB, is_bye: p.idB === null,
  }))
  const byeGameRows = pairs
    .filter((p) => p.idB === null)
    .map((p) => ({
      game, level, pair_num: p.pair_num,
      player_a_id: p.idA, score_a: AM_BYE_DIFF, player_b_id: null, score_b: null, is_bye: true,
    }))

  const { error: insErr } = await supabase.from('am_pairings').insert(pairingRows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  if (byeGameRows.length > 0) {
    await supabase.from('am_games').upsert(byeGameRows, { onConflict: 'game,level,pair_num' })
  }

  await supabase.from('am_broadcast').insert({ type: 'current_game', level, payload: { game } })
  return NextResponse.json({ ok: true, count: pairs.length })
}
