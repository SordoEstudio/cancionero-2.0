/**
 * Crea un usuario en Supabase Auth (service role) y muestra DEMO_USER_ID para .env.local
 *
 * Uso: pnpm demo:create-user
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) {
    console.error('No se encontró .env.local en la raíz del proyecto.');
    process.exit(1);
  }
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEMO_USER_EMAIL || 'demo@cancionero.local';
const password = process.env.DEMO_USER_PASSWORD || 'DemoCancionero123!';

if (!url || !serviceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name: 'Usuario demo' },
});

if (data?.user) {
  console.log('\nUsuario demo creado. Agregá a .env.local:\n');
  console.log(`DEMO_USER_ID=${data.user.id}`);
  console.log(`\nPodés iniciar sesión en /auth/login con:`);
  console.log(`  ${email}`);
  console.log(`  (contraseña: DEMO_USER_PASSWORD o la default del script)\n`);
  process.exit(0);
}

const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  console.log('\nEse email ya existe. Usá este UUID en .env.local:\n');
  console.log(`DEMO_USER_ID=${existing.id}\n`);
  process.exit(0);
}

console.error('Error creando usuario:', error?.message ?? error);
process.exit(1);
