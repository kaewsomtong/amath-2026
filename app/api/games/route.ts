import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/games?level=มต้น&game=1  → ผลของเกมนั้น (พร้อมข้อมูลผู้เล่น)
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')
  const game = req.nextUrl.searchParams.get('game')
  if (!level) return NextResponse.json({ error: 'ต้องระบุระดับ (level)' }, { status: 400 })
  let q = supabase.from('am_games')
    .select('*, player_a:player_a_id(*), player_b:player_b_id(*)')
    .eq('level', level)
  if (game) q = q.eq('game', game)
  const { data, error } = await q.order('pair_num')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/games  → บันทึกผลคู่หนึ่ง (กันชนด้วย unique key + 409)
//   { game, level, pair_num, player_a_id, score_a, player_b_id, score_b, force? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { game, level, pair_num, player_a_id, score_a, player_b_id, score_b, force } = body

  if (player_b_id == null) {
    return NextResponse.json({ error: 'คู่นี้เป็น BYE — ระบบบันทึกชนะให้อัตโนมัติแล้ว ไม่ต้องกรอก' }, { status: 400 })
  }

  // ตรวจสอบ score ต้องเป็น integer (ติดลบได้ กรณีผู้เล่นมีตัวเลขค้างมาก)
  if (!Number.isInteger(score_a) || !Number.isInteger(score_b)) {
    return NextResponse.json({ error: 'คะแนนต้องเป็นจำนวนเต็ม' }, { status: 400 })
  }

  // กันชน: ถ้าไม่ force และมีผลอยู่แล้ว → 409 ให้ฝั่งหน้าเว็บถามยืนยันทับ
  if (!force) {
    const { data: existing } = await supabase.from('am_games')
      .select('id, score_a').eq('game', game).eq('level', level).eq('pair_num', pair_num).single()
    if (existing && existing.score_a !== null) {
      return NextResponse.json({ conflict: true }, { status: 409 })
    }
  }

  const { data, error } = await supabase.from('am_games')
    .upsert(
      { game, level, pair_num, player_a_id, score_a, player_b_id, score_b, is_bye: false, updated_at: new Date().toISOString() },
      { onConflict: 'game,level,pair_num' }
    )
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // แจ้ง realtime ว่ามีผลใหม่
  await supabase.from('am_broadcast').insert({ type: 'result_saved', level, payload: { game, pair_num } })

  return NextResponse.json(data)
}
