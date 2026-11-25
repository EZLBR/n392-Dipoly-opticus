// ============================================================
//   Leitura de TIMESTAMP (sem fuso) pelo driver pg
//
//   O PostgreSQL grava TIMESTAMP sem fuso, e o banco da stack roda em
//   UTC. O Prisma lê essas colunas como UTC; o driver pg, por padrão,
//   as lê no fuso do processo. Fora do Docker (por exemplo em
//   America/Sao_Paulo), os endpoints ainda em pg mostravam 3 horas a
//   mais que os já migrados para o Prisma (DB-03).
//
//   Este parser faz o pg ler como o Prisma: o texto do banco é UTC.
// ============================================================

import pg from "pg";

/** OID do tipo `timestamp without time zone`. */
export const TIMESTAMP_OID = 1114;

const padrao = pg.types.getTypeParser(TIMESTAMP_OID);

/** "2026-11-24 12:34:56.789" → Date em UTC. Valores especiais ("infinity") seguem o padrão do driver (±Infinity). */
export function lerTimestampComoUtc(texto: string): Date | number | string {
  const data = new Date(`${texto.replace(" ", "T")}Z`);
  return Number.isNaN(data.getTime()) ? padrao(texto) : data;
}

pg.types.setTypeParser(TIMESTAMP_OID, lerTimestampComoUtc);
