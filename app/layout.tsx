import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A-Math",
  description: "ระบบจัดการแข่งขัน A-Math โรงเรียนพูลเจริญวิทยาคม",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&family=Nunito:wght@700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen" style={{ fontFamily: "'Sarabun', sans-serif", background: "#F0F9FF" }}>
        {children}
      </body>
    </html>
  );
}
