import { createAdminClient } from '@/lib/supabase/admin'
import { Metadata } from 'next'

interface Props {
  children: React.ReactNode
  params: Promise<{ tenantSlug: string }>
}

async function getTenantMeta(tenantSlug: string) {
  const supabase = createAdminClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug, settings')
    .eq('slug', tenantSlug)
    .single()

  return tenant
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params
  const tenant = await getTenantMeta(tenantSlug)

  if (!tenant) {
    return { title: 'PlusHub 商城' }
  }

  const shopSettings = (tenant.settings as Record<string, unknown>)?.shop as Record<string, unknown> | undefined
  // 優先用 og_image_url（專門設定的分享縮圖），fallback 到 banner_url
  const ogImageUrl = (shopSettings?.og_image_url as string | undefined) || (shopSettings?.banner_url as string | undefined)
  const shopName = tenant.name
  const title = `${shopName} — PlusHub 商城`
  const description = `歡迎來到 ${shopName} 線上商城`

  return {
    title,
    description,
    openGraph: {
      title: shopName,
      description,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 800, height: 400 }] } : {}),
      siteName: 'PlusHub',
      type: 'website',
    },
    twitter: {
      card: ogImageUrl ? 'summary_large_image' : 'summary',
      title: shopName,
      description,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  }
}

export default function ShopTenantLayout({ children }: Props) {
  return children
}
