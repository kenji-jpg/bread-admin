import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ tenantSlug: string }>
}

// 舊 LIFF 路由 → 重定向到新的純網頁商城
export default async function LegacyShopRedirect({ params }: Props) {
  const { tenantSlug } = await params
  redirect(`/shop/${tenantSlug}`)
}
