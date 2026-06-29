import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { computeStandings, AM_DEFAULT_GAMES, Player, GameRow } from '@/lib/am-logic'

// ดึงผู้เล่น + ผลทุกเกม + totalGames แล้วคำนวณอันดับ
export async function loadStandings(level: string) {
  const [{ data: playersData }, { data: gamesData }, { data: setting }] = await Promise.all([
    supabase.from('am_players').select('*').eq('level', level).order('code'),
    supabase.from('am_games').select('*').eq('level', level),
    supabase.from('am_settings').select('value').eq('key', 'totalGames').single(),
  ])
  const totalGames = setting ? Number(setting.value) || AM_DEFAULT_GAMES : AM_DEFAULT_GAMES
  const players = (playersData || []) as Player[]
  const games = (gamesData || []) as GameRow[]
  return { standings: computeStandings(players, games, totalGames), totalGames, players }
}

// GET /api/standings?level=มต้น
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')
  if (!level) return NextResponse.json({ error: 'ต้องระบุระดับ (level)' }, { status: 400 })
  const { standings, totalGames } = await loadStandings(level)
  return NextResponse.json({ standings, totalGames })
}
