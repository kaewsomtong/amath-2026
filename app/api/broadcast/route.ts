import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// POST /api/broadcast  → ส่งสัญญาณ realtime (เช่น reset, current_game)
//   { type, level?, payload? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, level, payload } = body
  if (!type) return NextResponse.json({ error: 'ต้องระบุ type' }, { status: 400 })
  const { error } = await supabase.from('am_broadcast').insert({ type, level: level || null, payload: payload || {} })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
