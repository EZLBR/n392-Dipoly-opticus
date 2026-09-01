// ============================================================
//   SEED DE PRODUÇÃO (seguro) — OPTICUS
//
//   Roda `npx prisma db seed`.
//
//   O QUE ESTE ARQUIVO FAZ (seguro para produção):
//   - Dados de referência: categorias do catálogo.
//   - Usuário admin/staff INICIAL, apenas se as credenciais
//     forem fornecidas via variáveis de ambiente
//     (SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD_HASH).
//     Se essas variáveis não existirem, o seed PULA a criação
//     do usuário staff. NUNCA há senha ou conta administrativa
//     padrão hardcoded aqui.
//
//   O QUE NÃO FAZ:
//   - Não cria usuários fake nem pedidos de exemplo. Esses
//     dados de desenvolvimento vivem em seed.dev.ts.
//
//   IDEMPOTÊNCIA: todos os registros usam upsert, então rodar
//   o seed múltiplas vezes não duplica dados nem estoura
//   constraint de unicidade.
// ============================================================

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// ── Dados de referência seguros para produção ──────────────
const CATEGORIAS = [
  { nome: "Óculos de Sol", descricao: "Armações com lente solar polarizada" },
  { nome: "Armações", descricao: "Armações para lentes de grau" },
  { nome: "Lentes", descricao: "Lentes avulsas e sob medida" },
  { nome: "Acessórios", descricao: "Cases, cordões e kits de limpeza" },
];

async function seedCategorias() {
  for (const c of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { nome: c.nome },
      update: {},
      create: c,
    });
  }
}

// ── Usuário staff inicial via variáveis de ambiente ─────────
// Só é criado se SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD_HASH
// estiverem definidos. Se não, é pulado. Nunca usa default.
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const senhaHash = process.env.SEED_ADMIN_PASSWORD_HASH?.trim();

  if (!email || !senhaHash) {
    console.log(
      "⏭️  SEED: SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD_HASH ausentes. " +
        "Pulando criação de usuário staff admin."
    );
    return;
  }

  await prisma.usuario.upsert({
    where: { email },
    update: { role: "staff" },
    create: {
      nome: "Administrador",
      email,
      senhaHash,
      role: "staff",
    },
  });
  console.log(`✅ SEED: usuário staff ${email} garantido.`);
}

async function main() {
  await seedCategorias();
  console.log("✅ SEED: categorias de referência garantidas.");
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
