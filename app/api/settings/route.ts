import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { AM_DEFAULT_GAMES } from '@/lib/am-logic'

// อ่านจำนวนเกมทั้งหมดจากตาราง am_settings
async function readTotalGames(): Promise<number> {
  const { data } = await supabase.from('am_settings').select('value').eq('key', 'totalGames').single()
  return data ? Number(data.value) || AM_DEFAULT_GAMES : AM_DEFAULT_GAMES
}

// GET /api/settings  → { totalGames }
export async function GET() {
  const totalGames = await readTotalGames()
  return NextResponse.json({ totalGames })
}

// POST /api/settings
//   { action: 'addGame' }           → เพิ่มเกม +1
//   { action: 'setTotal', total: n } → ตั้งจำนวนเกม
export async function POST(req: NextRequest) {
  const body = await req.json()
  let total: number

  if (body.action === 'addGame') {
    total = (await readTotalGames()) + 1
  } else if (body.action === 'setTotal') {
    total = Math.max(1, Number(body.total) || AM_DEFAULT_GAMES)
  } else {
    return NextResponse.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 })
  }

  const { error } = await supabase.from('am_settings')
    .upsert({ key: 'totalGames', value: String(total) }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ totalGames: total })
}
