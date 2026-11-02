# Morada — Gestão de kitnets

Aplicação web responsiva para gestão de unidades. O administrador cadastra unidades e convida inquilinos. Cada inquilino entra por convite e consulta apenas sua unidade e um demonstrativo imprimível (não é boleto bancário).

## Acesso e segurança

- O primeiro usuário administrador deve existir no Supabase Auth e ser promovido pelo script [`supabase/roles-and-tenant-access.sql`](supabase/roles-and-tenant-access.sql).
- Depois da configuração inicial, o cadastro público no Supabase Auth deve ser desativado. Novas contas de inquilino são criadas somente pela Edge Function de convite.
- As políticas RLS separam o administrador dos inquilinos. O inquilino tem leitura da própria unidade, dos rateios do imóvel e dos próprios pagamentos; não pode editar dados.
- A criação de contas de inquilinos usa a chave `service_role` apenas na Edge Function Supabase, nunca no navegador.

## Configuração inicial do Supabase

1. Execute [`supabase/schema.sql`](supabase/schema.sql), se ainda não executou.
2. Confirme que o usuário administrador já existe em **Authentication → Users**. Se ainda não existir, crie/con­vide o usuário pelo painel antes de desligar o cadastro público.
3. Abra `supabase/roles-and-tenant-access.sql`, substitua `SEU_EMAIL_DE_ADMIN` pelo e-mail exato da conta e execute o script no SQL Editor. Isso cria os perfis, políticas e associa o usuário existente como administrador.
4. No Auth, permita o endereço publicado do app nas URLs de redirecionamento para que os convites de e-mail retornem ao site.
5. Depois que o administrador estiver configurado, desative o cadastro público em **Authentication → Settings / Sign-in**. O nome exato da seção pode variar no painel.

## Convites de inquilinos

A função [`supabase/functions/create-tenant-user/index.ts`](supabase/functions/create-tenant-user/index.ts) verifica o perfil de administrador, envia o convite por e-mail e vincula a conta a uma única unidade. Para publicá-la:

```sh
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set APP_SITE_URL=https://SEU-SITE-PUBLICADO
supabase functions deploy create-tenant-user
supabase functions deploy manage-tenant-user
```

A URL e as chaves de sistema do Supabase são disponibilizadas à Edge Function pelo ambiente Supabase. **Não** configure a chave `service_role` como variável `VITE_*`, no Cloudflare ou no código do navegador.

## Executar localmente

1. Instale Node.js 20 ou superior e a CLI do Supabase.
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a Project URL e uma chave pública `anon`/publishable.
3. Rode `npm install` e `npm run dev`.
4. Para testar convites localmente, publique a Edge Function no Supabase apontando `APP_SITE_URL` para a URL que será usada no fluxo de confirmação.

## Publicação no Cloudflare

O app é compilado com `npm run build`, saída `dist`. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` como variáveis de **build** do projeto Cloudflare; são incorporadas ao bundle público do navegador. Uma chave pública anon/publishable pode ser usada no frontend porque as tabelas aplicam RLS. **Nunca** use `service_role` no frontend.

## Cálculos e limites atuais

- A cota de água e luz é proporcional aos moradores ativos cadastrados no mês corrente. Rateios passados ainda são recalculados se a quantidade de moradores mudar.
- O histórico financeiro mostra os meses desde o início do contrato (ou cadastro da unidade) até o mês atual para o administrador e o inquilino. Pagamentos confirmados ficam registrados; cobranças em aberto são recalculadas com os valores atuais da unidade, pois ainda não há snapshots imutáveis de cada mês.
- Multa única de 10% após o vencimento; juros simples de 1% ao mês proporcionais a 30 dias, apenas sobre o aluguel.
- O demonstrativo do inquilino pode ser impresso pelo navegador. Ele não é um boleto registrado, não recebe pagamento e não confirma baixa.
- A integração de boleto real, upload privado de contratos, armazenamento imutável de cada rateio mensal e validação contábil ainda não estão implementados.
