import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// POST /api/players/import
// body: { level, rows: [{ code, name, school?, member2? }, ...] }
// หรือ { level, text: "วางหลายบรรทัด" } โดยแต่ละบรรทัดคั่นด้วย Tab หรือ comma:
//   รหัส [tab] ชื่อ [tab] โรงเรียน [tab] สมาชิกคนที่2
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { level } = body
  if (!level) return NextResponse.json({ error: 'ต้องระบุระดับ (level)' }, { status: 400 })

  let rows: { code: string; name: string; school: string; member2: string }[] = []

  if (Array.isArray(body.rows)) {
    rows = body.rows.map((r: { code: string; name: string; school?: string; member2?: string }) => ({
      code: String(r.code || '').trim(),
      name: String(r.name || '').trim(),
      school: String(r.school || '').trim(),
      member2: String(r.member2 || '').trim(),
    }))
  } else if (typeof body.text === 'string') {
    rows = body.text
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        const cols = line.split(/\t|,/).map((c) => c.trim())
        return { code: cols[0] || '', name: cols[1] || '', school: cols[2] || '', member2: cols[3] || '' }
      })
  }

  rows = rows.filter((r) => r.code && r.name)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'ไม่พบข้อมูลที่นำเข้าได้ (ต้องมีรหัสและชื่ออย่างน้อย)' }, { status: 400 })
  }

  const payload = rows.map((r) => ({ ...r, level }))
  const { data, error } = await supabase.from('am_players')
    .upsert(payload, { onConflict: 'code,level' })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: data?.length || 0 })
}
