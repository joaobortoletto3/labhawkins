// Execute na raiz do projeto: node scripts/criar-professor.cjs
// Requer supabase/schema.sql executado e .env.local configurado.
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const { createInterface } = require('node:readline');
const { Writable } = require('node:stream');
const path = require('node:path');

const email = 'bianca.aguiar305@portalsesisp.org.br';

async function readPassword() {
  if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo para informar a senha.');
  process.stdout.write('Senha para a conta professor (entrada oculta): ');
  const output = new Writable({ write(chunk, encoding, callback) { callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    return await new Promise(resolve => rl.question('', resolve));
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}

async function main() {
  loadEnvConfig(path.resolve(__dirname, '..'), true);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Preencha NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: schemaError } = await sb.from('profiles').select('id').limit(1);
  if (schemaError) throw new Error('Nao foi possivel acessar profiles. Confira a chave administrativa e execute schema.sql.');

  console.log(`Conta: ${email}`);
  console.log(`Projeto: ${new URL(url).hostname}`);
  console.log('Se a conta ja existir, a senha sera atualizada e o perfil sera promovido a professor.');
  const password = await readPassword();
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');

  let user;
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = data.users.find(item => item.email?.toLowerCase() === email);
    if (user || data.users.length < 100) break;
  }
  const attributes = { password, email_confirm: true, user_metadata: { ...(user?.user_metadata || {}), name: 'Bianca Aguiar' } };
  const result = user
    ? await sb.auth.admin.updateUserById(user.id, attributes)
    : await sb.auth.admin.createUser({ email, ...attributes });
  if (result.error) throw result.error;
  if (!result.data.user) throw new Error('O Supabase nao retornou o usuario.');
  const { error } = await sb.from('profiles').upsert({
    id: result.data.user.id, email, name: 'Bianca Aguiar', role: 'professor',
  }, { onConflict: 'id' });
  if (error) throw new Error(`Conta criada/atualizada, mas o perfil professor falhou: ${error.message}. Execute novamente apos corrigir o banco.`);
  console.log(`Professor configurado com sucesso: ${email}`);
  console.log('Reinicie o servidor e acesse http://localhost:3000/login.');
}

main().catch(error => {
  console.error('Falha:', error.message);
  process.exitCode = 1;
});
