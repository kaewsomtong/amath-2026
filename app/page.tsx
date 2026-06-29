import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#F0F9FF' }}>
      <div className="text-center mb-10">
        <div className="text-6xl mb-3">🔢</div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text"
          style={{ backgroundImage: 'linear-gradient(135deg,#0284C7,#38BDF8)', fontFamily: "'Nunito',sans-serif" }}>
          A-Math
        </h1>
        <p className="text-sky-500 font-semibold text-sm mt-1">โรงเรียนพูลเจริญวิทยาคม</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <Link href="/display"
          className="flex items-center gap-4 p-5 bg-white rounded-3xl border-2 border-sky-100 shadow-lg hover:shadow-xl hover:border-sky-300 active:scale-95 transition-all group">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'linear-gradient(135deg,#38BDF8,#7DD3FC)' }}>📺</div>
          <div className="flex-1">
            <p className="font-black text-sky-700 text-lg leading-tight">กระดานคะแนน</p>
            <p className="text-sky-300 text-xs font-semibold mt-0.5">แสดงผลสดแบบ real-time</p>
          </div>
          <span className="text-sky-200 group-hover:text-sky-400 font-black text-xl transition">›</span>
        </Link>

        <Link href="/scoring"
          className="flex items-center gap-4 p-5 bg-white rounded-3xl border-2 border-sky-100 shadow-lg hover:shadow-xl hover:border-amber-300 active:scale-95 transition-all group">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#FBBF24)' }}>✍️</div>
          <div className="flex-1">
            <p className="font-black text-amber-700 text-lg leading-tight">กรอกคะแนน</p>
            <p className="text-amber-400 text-xs font-semibold mt-0.5">สำหรับกรรมการประจำโต๊ะ</p>
          </div>
          <span className="text-amber-200 group-hover:text-amber-400 font-black text-xl transition">›</span>
        </Link>

        <Link href="/admin"
          className="flex items-center gap-4 p-5 bg-white rounded-3xl border-2 border-sky-100 shadow-lg hover:shadow-xl hover:border-sky-300 active:scale-95 transition-all group">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'linear-gradient(135deg,#38BDF8,#7DD3FC)' }}>🛡️</div>
          <div className="flex-1">
            <p className="font-black text-sky-700 text-lg leading-tight">แผงแอดมิน</p>
            <p className="text-sky-300 text-xs font-semibold mt-0.5">จัดการผู้เล่น · จัดคู่ · รอบชิง</p>
          </div>
          <span className="text-sky-200 group-hover:text-sky-400 font-black text-xl transition">›</span>
        </Link>
      </div>

      <div className="mt-10 text-center space-y-1">
        <p className="text-xs text-sky-300 font-semibold">🔢 A-Math Scoring System</p>
        <p className="text-xs text-sky-200 font-medium">พัฒนาโดย นางสาวชัญญ์คนันท์ รชตะฤทธิ์เสือ</p>
      </div>
    </div>
  )
}
