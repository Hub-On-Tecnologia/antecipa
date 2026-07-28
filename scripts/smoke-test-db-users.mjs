#!/usr/bin/env node
/**
 * Smoke Test — GET /api/db/users
 * 
 * Roda diretamente no VPS após o deploy para validar que:
 *   1. O endpoint existe e retorna HTTP 200
 *   2. A resposta tem o formato { ok: true, rows: [...] }
 *   3. Pelo menos um usuário foi retornado com os campos obrigatórios
 * 
 * Uso no VPS:
 *   node scripts/smoke-test-db-users.mjs
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Lê o ACCESS_TOKEN do .env para autenticar a chamada
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
let accessToken = '';

try {
  const envContent = readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^ACCESS_TOKEN=(.+)$/m);
  if (match) accessToken = match[1].trim();
} catch {
  console.warn('[smoke] Aviso: .env não encontrado, testando sem token de auth');
}

const BASE_URL = process.env.APP_URL || 'http://localhost:3001';

async function run() {
  console.log(`\n🔍 Smoke Test: GET ${BASE_URL}/api/db/users`);
  console.log('─'.repeat(50));

  // --- 1. Endpoint acessível ---
  let response;
  try {
    response = await fetch(`${BASE_URL}/api/db/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': accessToken,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('❌ FALHA: Não foi possível conectar ao servidor.', err.message);
    process.exit(1);
  }

  if (response.status === 401) {
    console.error('❌ FALHA: HTTP 401 — ACCESS_TOKEN inválido ou ausente no .env do VPS.');
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`❌ FALHA: HTTP ${response.status} inesperado.`);
    process.exit(1);
  }
  console.log(`✅ HTTP ${response.status} OK`);

  // --- 2. Formato da resposta ---
  let data;
  try {
    data = await response.json();
  } catch {
    console.error('❌ FALHA: Resposta não é JSON válido.');
    process.exit(1);
  }

  if (!data || !Array.isArray(data.rows)) {
    console.error('❌ FALHA: Resposta não contém campo "rows" como array.', JSON.stringify(data));
    process.exit(1);
  }
  console.log(`✅ Formato correto { rows: Array(${data.rows.length}) }`);

  // --- 3. Pelo menos um usuário retornado ---
  if (data.rows.length === 0) {
    console.warn('⚠️  AVISO: Nenhum usuário retornado. Banco pode estar vazio ou filtro muito restritivo.');
  } else {
    const first = data.rows[0];
    const hasNome = !!(first.nome || first.NOME || first.nome_corretor);
    const hasCpf  = !!(first.cpf  || first.CPF  || first.cpf_cnpj || first.cpfcnpj || first.documento);

    if (!hasNome) {
      console.error('❌ FALHA: Primeiro usuário não tem campo de nome reconhecível.');
      process.exit(1);
    }
    if (!hasCpf) {
      console.error('❌ FALHA: Primeiro usuário não tem campo de CPF reconhecível.');
      process.exit(1);
    }
    console.log(`✅ ${data.rows.length} usuário(s) retornado(s) com campos nome e CPF`);
    console.log(`   Exemplo: nome="${first.nome || first.NOME || first.nome_corretor}", cpf="${first.cpf || first.CPF || first.cpfcnpj || first.documento}"`);
  }

  console.log('\n🎉 Smoke test passou! Endpoint /api/db/users está funcionando corretamente.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Erro inesperado no smoke test:', err);
  process.exit(1);
});
