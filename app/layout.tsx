import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenRT",
  description: "Return Curve Advise for Individual Investors. 公募基金 RT-α 滚动持有收益分析与每日定投模拟，理解不同入场日期下的历史收益与风险。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
