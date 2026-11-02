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
  if (adminProfile?.role !== 'admin') return json({ error: 'Apenas o administrador pode cadastrar inquilinos.' }, 403);

  let body: { email?: string; unit_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dados inválidos.' }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  const unitId = body.unit_id;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !unitId) {
    return json({ error: 'Informe um e-mail válido e selecione uma unidade.' }, 400);
  }

  const { data: unit, error: unitError } = await adminClient
    .from('units')
    .select('id, owner_id, tenant_name')
    .eq('id', unitId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (unitError || !unit) return json({ error: 'Unidade não encontrada para este administrador.' }, 404);

  const { data: existingTenant } = await adminClient
    .from('user_profiles')
    .select('user_id')
    .eq('unit_id', unit.id)
    .maybeSingle();
  if (existingTenant) return json({ error: 'Esta unidade já está vinculada a uma conta de inquilino.' }, 409);

  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl || undefined,
  });
  if (inviteError || !invitation.user) {
    return json({ error: inviteError?.message || 'Não foi possível enviar o convite.' }, 400);
  }

  const { error: profileError } = await adminClient.from('user_profiles').insert({
    user_id: invitation.user.id,
    email,
    role: 'tenant',
    unit_id: unit.id,
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    return json({ error: profileError.message }, 400);
  }

  return json({ message: `Convite enviado para ${email}.`, tenant: { email, unit_id: unit.id } }, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
