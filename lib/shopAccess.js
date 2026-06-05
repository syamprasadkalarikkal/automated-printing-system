import { supabase, supabaseConfigError } from '@/lib/supabase'

export const getShopAccessForSession = async (session) => {
  if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not configured.')

  const email = session?.user?.email?.trim().toLowerCase()
  if (!email) throw new Error('This admin account does not have an email address.')

  const { data, error } = await supabase
    .from('shop_users')
    .select('email, shop_id')
    .ilike('email', email)
    .maybeSingle()

  if (error) throw error
  if (!data?.shop_id) {
    throw new Error(`No shop_id is assigned to ${email}. Add this admin to shop_users and set shop_id.`)
  }

  return {
    email: data.email || email,
    shopId: data.shop_id,
  }
}
