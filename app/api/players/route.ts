import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/players?level=มต้น  → รายชื่อผู้เข้าแข่งขันของระดับนั้น
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')
  let q = supabase.from('am_players').select('*').order('code')
  if (level) q = q.eq('level', level)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/players  → เพิ่ม/แก้ไขผู้เข้าแข่งขัน 1 รายการ
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { code, name, level, school, member2 } = body
  if (!code || !name || !level) {
    return NextResponse.json({ error: 'กรุณากรอกรหัส ชื่อ และระดับ' }, { status: 400 })
  }
  const { data, error } = await supabase.from('am_players')
    .upsert(
      { code: String(code).trim(), name: String(name).trim(), level, school: school || '', member2: member2 || '' },
      { onConflict: 'code,level' }
    )
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/players  → แก้ไขผู้เข้าแข่งขัน (รับ id ใน body)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, code, name, school, member2 } = body
  if (!id) return NextResponse.json({ error: 'ต้องระบุ id' }, { status: 400 })
  const { error } = await supabase.from('am_players')
    .update({ code: String(code).trim(), name: String(name).trim(), school: school || '', member2: member2 || '' })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/players  → ลบผู้เข้าแข่งขัน (รับ id ใน body)
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = body.id ?? req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ต้องระบุ id' }, { status: 400 })
  const { error } = await supabase.from('am_players').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
