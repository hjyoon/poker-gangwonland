import "./globals.css";

export const metadata = {
  title: "강원랜드 텍사스 홀덤",
  description: "강원랜드 기준 베팅 규칙을 반영한 1인 대 1~7 컴퓨터 홀덤 시뮬레이터",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
