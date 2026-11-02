# Morada — Gestão de kitnets

Aplicação web responsiva em português para gestão de unidades de locação. A persistência compartilhada entre celular e computador usa Supabase (Postgres + Auth + Row Level Security).

## Funcionalidades do MVP

- Cadastro de unidades, inquilinos, telefone, moradores, aluguel e vencimento.
- Campos para número e vigência do contrato e um link opcional para o documento.
- Rateio mensal de água e luz por morador; a cota da unidade é proporcional ao número de moradores ativos.
- Simulação do aluguel em atraso: multa única de 10% após o vencimento e juros simples de 1% ao mês, calculados como `1% ÷ 30 × dias em atraso`.
- Registro de recebimento mensal e painel de acompanhamento.
- Login por e-mail e senha; políticas RLS isolam os registros por conta.

## Executar localmente

1. Instale Node.js 20 ou superior.
2. Crie um projeto Supabase e execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor.
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores de **Project Settings → API** do seu projeto.
4. No painel do Supabase, configure a confirmação de e-mail em Authentication conforme sua preferência e cadastre uma URL de redirecionamento para o endereço local/publicado.
5. Rode `npm install` e `npm run dev`.

A chave `anon`/publishable pode ser usada no navegador porque todas as tabelas têm RLS habilitado. **Nunca** coloque a chave `service_role` no frontend.

## Publicação

Publique o projeto Vite em um serviço de hospedagem estática (por exemplo, Vercel, Netlify ou Cloudflare Pages), definindo as mesmas variáveis de ambiente no painel do serviço. Adicione a URL publicada às URLs permitidas no Supabase Auth. O repositório não contém credenciais nem projeto Supabase provisionado.

## Observações importantes

- O formulário guarda os metadados do contrato e aceita um link para o documento. O upload do arquivo para armazenamento privado ainda não está implementado; evite links públicos com dados pessoais.
- O vencimento é limitado aos dias 1 a 28 para evitar ambiguidades em meses curtos.
- O cálculo dos juros usa mês comercial de 30 dias e juros simples. O pagamento estimado na tela é uma simulação; não substitui a conferência do contrato e das regras aplicáveis.
- Ao registrar o pagamento, esta versão salva como recebido o total mostrado na tela (aluguel corrigido + rateio) e a data selecionada na simulação. Confira o valor antes de confirmar.
- O rateio de meses passados é recalculado com o cadastro atual de moradores. Antes do uso contábil, é recomendável armazenar uma fotografia mensal de cada cota para que alterações futuras não mudem o histórico.
