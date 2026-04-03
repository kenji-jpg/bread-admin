import { createClient } from '@/lib/supabase/server'
import { Metadata } from 'next'
import ShareRedirect from './redirect'

interface Props {
  params: Promise<{ tenantSlug: string; productId: string }>
}

async function getProductData(tenantSlug: string, productId: string) {
  const supabase = await createClient()

  // 查租戶
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug, liff_id')
    .eq('slug', tenantSlug)
    .single()

  if (!tenant) return null

  // 查商品
  const { data: product } = await supabase
    .from('products')
    .select('id, name, price, image_url, description')
    .eq('id', productId)
    .eq('tenant_id', tenant.id)
    .single()

  if (!product) return null

  return { tenant, product }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug, productId } = await params
  const data = await getProductData(tenantSlug, productId)

  if (!data) {
    return { title: 'PlusHub 商城' }
  }

  const { tenant, product } = data
  const title = `${product.name} $${product.price.toLocaleString()} — ${tenant.name}`
  const description = product.description || `在 ${tenant.name} 商城選購 ${product.name}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(product.image_url ? { images: [{ url: product.image_url, width: 400, height: 400 }] } : {}),
      siteName: 'PlusHub',
      type: 'website',
    },
    // LINE 也會讀 twitter card meta
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(product.image_url ? { images: [product.image_url] } : {}),
    },
  }
}

// 不用 redirect()，渲染 HTML 讓爬蟲讀到 OG meta
// 真人用戶透過 client component 跳轉
export default async function ShareProductPage({ params }: Props) {
  const { tenantSlug, productId } = await params
  const shopUrl = `/s/shop/${tenantSlug}?p=${productId}`

  return <ShareRedirect url={shopUrl} />
}
