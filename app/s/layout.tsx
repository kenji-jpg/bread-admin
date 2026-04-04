/**
 * 舊 LIFF 路由 layout — 僅作為 redirect 容器
 * /s/shop/* 已在 middleware 301 到 /shop/*
 * 此 layout 保留作為 /s 頁面（LIFF callback relay）的 fallback
 */
export default function LegacyShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-background">{children}</div>
}
