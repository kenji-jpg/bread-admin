import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import ShopProviders from './shop-providers'

interface Props {
  params: Promise<{ tenantSlug: string }>
  children: React.ReactNode
}

async function getTenantData(slug: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select('name, slug, settings')
    .eq('slug', slug)
    .single()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ tenantSlug: string }> }): Promise<Metadata> {
  const { tenantSlug } = await params
  const tenant = await getTenantData(tenantSlug)

  if (!tenant) {
    return { title: 'PlusHub 商城' }
  }

  const settings = tenant.settings as { shop?: { banner_url?: string; announcement?: string } } | null
  const bannerUrl = settings?.shop?.banner_url
  const announcement = settings?.shop?.announcement
  const title = `${tenant.name} — PlusHub 商城`
  const description = announcement || `歡迎來到 ${tenant.name} 的線上商城`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(bannerUrl ? { images: [{ url: bannerUrl, width: 1200, height: 630 }] } : {}),
      siteName: 'PlusHub',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(bannerUrl ? { images: [bannerUrl] } : {}),
    },
  }
}

export default function ShopLayout({ children }: Props) {
  return <ShopProviders>{children}</ShopProviders>
}
