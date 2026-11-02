import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const siteUrl = Deno.env.get('APP_SITE_URL');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: 'Configuração do servidor incompleta.' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);

  const { data: adminProfile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminProfile?.role !== 'admin') return json({ error: 'Apenas o administrador pode gerenciar inquilinos.' }, 403);

  let body: { action?: string; user_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dados inválidos.' }, 400);
  }
  const action = body.action;
  const tenantId = body.user_id;
  if (!tenantId || !['delete', 'reset_password'].includes(action || '')) {
    return json({ error: 'Ação ou inquilino inválido.' }, 400);
  }

  const { data: tenantProfile } = await adminClient
    .from('user_profiles')
    .select('user_id, email, role, unit_id')
    .eq('user_id', tenantId)
    .maybeSingle();
  if (!tenantProfile || tenantProfile.role !== 'tenant' || !tenantProfile.unit_id) {
    return json({ error: 'Inquilino não encontrado.' }, 404);
  }

  const { data: unit } = await adminClient
    .from('units')
    .select('id')
    .eq('id', tenantProfile.unit_id)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!unit) return json({ error: 'Inquilino não encontrado para este administrador.' }, 404);

  if (action === 'delete') {
    const { error } = await adminClient.auth.admin.deleteUser(tenantId);
    if (error) return json({ error: 'Não foi possível remover a conta do inquilino.' }, 400);
    return json({ message: 'Acesso do inquilino removido. A unidade e o histórico financeiro foram mantidos.' });
  }

  const { error } = await userClient.auth.resetPasswordForEmail(tenantProfile.email, {
    redirectTo: siteUrl || undefined,
  });
  if (error) return json({ error: 'Não foi possível enviar o e-mail para redefinir a senha.' }, 400);
  return json({ message: `E-mail para redefinição de senha enviado para ${tenantProfile.email}.` });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
