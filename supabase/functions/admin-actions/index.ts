// Edge Function: ações administrativas sensíveis (criar conta, resetar senha, excluir conta,
// alterar permissões/admin). Roda com a service role key (nunca exposta ao navegador) e
// confere, usando o JWT de quem chamou, que essa pessoa é admin antes de agir.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const AUTH_EMAIL_DOMAIN = 'nossacasa.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'não autenticado' }, 401)
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser()
    if (!caller) {
      return jsonResponse({ error: 'não autenticado' }, 401)
    }

    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('is_admin')
      .eq('id', caller.id)
      .single()

    if (!callerProfile?.is_admin) {
      return jsonResponse({ error: 'apenas admin pode realizar esta ação' }, 403)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const body = await req.json()
    const { action } = body

    if (action === 'create_user') {
      const { username, password, display_name, is_admin, permissions } = body
      if (!username || !password || !display_name) {
        return jsonResponse({ error: 'username, password e display_name são obrigatórios' }, 400)
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: usernameToEmail(username),
        password,
        email_confirm: true,
      })
      if (createError || !created.user) {
        return jsonResponse({ error: createError?.message ?? 'falha ao criar usuário' }, 400)
      }

      const { error: profileError } = await admin
        .from('profiles')
        .upsert({
          id: created.user.id,
          username: username.trim().toLowerCase(),
          display_name,
          is_admin: !!is_admin,
          permissions: permissions ?? undefined,
          active: true,
        })
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id)
        return jsonResponse({ error: profileError.message }, 400)
      }

      return jsonResponse({ profile_id: created.user.id })
    }

    if (action === 'reset_password') {
      const { profile_id, new_password } = body
      if (!profile_id || !new_password) {
        return jsonResponse({ error: 'profile_id e new_password são obrigatórios' }, 400)
      }
      const { error } = await admin.auth.admin.updateUserById(profile_id, { password: new_password })
      if (error) return jsonResponse({ error: error.message }, 400)
      return jsonResponse({ ok: true })
    }

    if (action === 'update_profile') {
      const { profile_id, display_name, is_admin, permissions, active } = body
      if (!profile_id) return jsonResponse({ error: 'profile_id é obrigatório' }, 400)

      const update: Record<string, unknown> = {}
      if (display_name !== undefined) update.display_name = display_name
      if (is_admin !== undefined) update.is_admin = is_admin
      if (permissions !== undefined) update.permissions = permissions
      if (active !== undefined) update.active = active

      const { error } = await admin.from('profiles').update(update).eq('id', profile_id)
      if (error) return jsonResponse({ error: error.message }, 400)
      return jsonResponse({ ok: true })
    }

    if (action === 'delete_user') {
      const { profile_id } = body
      if (!profile_id) return jsonResponse({ error: 'profile_id é obrigatório' }, 400)
      if (profile_id === caller.id) {
        return jsonResponse({ error: 'não é possível excluir a própria conta' }, 400)
      }
      const { error } = await admin.auth.admin.deleteUser(profile_id)
      if (error) return jsonResponse({ error: error.message }, 400)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: `ação desconhecida: ${action}` }, 400)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'erro inesperado' }, 500)
  }
})
