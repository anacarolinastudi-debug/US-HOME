import { supabase } from '@/lib/supabase'
import type { TabPermissions } from '@/lib/database.types'

async function callAdminAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-actions', { body })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

export function createUser(input: {
  username: string
  password: string
  display_name: string
  is_admin: boolean
  permissions: TabPermissions
}) {
  return callAdminAction({ action: 'create_user', ...input })
}

export function resetPassword(profile_id: string, new_password: string) {
  return callAdminAction({ action: 'reset_password', profile_id, new_password })
}

export function updateProfile(input: {
  profile_id: string
  display_name?: string
  is_admin?: boolean
  permissions?: TabPermissions
  active?: boolean
}) {
  return callAdminAction({ action: 'update_profile', ...input })
}

export function deleteUser(profile_id: string) {
  return callAdminAction({ action: 'delete_user', profile_id })
}
