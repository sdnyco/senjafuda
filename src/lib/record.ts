import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { answers, tokens } from "@/db/schema";
import { activeFields, loadVocab } from "./vocab";

export async function loadRecordData() {
  const db = getDb();
  const vocab = loadVocab();

  const statusRows = await db
    .select({
      status: tokens.status,
      count: sql<number>`count(*)::int`,
    })
    .from(tokens)
    .groupBy(tokens.status);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  const issued = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const lookedDidNothing = byStatus["issued"] ?? 0;

  const rateLimitedCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tokens)
    .where(eq(tokens.rateLimited, true));

  const uaRows = await db
    .select({
      uaClass: tokens.uaClass,
      status: tokens.status,
      count: sql<number>`count(*)::int`,
    })
    .from(tokens)
    .groupBy(tokens.uaClass, tokens.status);

  const fields = activeFields(vocab);
  const distributions: {
    field: string;
    allTime: { value: string; count: number }[];
    byMonth: { month: string; value: string; count: number }[];
  }[] = [];

  for (const field of fields) {
    const allTime = await db
      .select({
        value: answers.value,
        count: sql<number>`count(*)::int`,
      })
      .from(answers)
      .innerJoin(tokens, eq(answers.tokenId, tokens.id))
      .where(and(eq(answers.field, field.id), ne(tokens.status, "branched")))
      .groupBy(answers.value)
      .orderBy(sql`count(*) desc`);

    const byMonth = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${answers.answeredAt}), 'YYYY-MM')`,
        value: answers.value,
        count: sql<number>`count(*)::int`,
      })
      .from(answers)
      .innerJoin(tokens, eq(answers.tokenId, tokens.id))
      .where(and(eq(answers.field, field.id), ne(tokens.status, "branched")))
      .groupBy(sql`date_trunc('month', ${answers.answeredAt})`, answers.value)
      .orderBy(sql`date_trunc('month', ${answers.answeredAt})`);

    distributions.push({ field: field.id, allTime, byMonth });
  }

  const mosaic = await db
    .select({
      tokenId: answers.tokenId,
      value: answers.value,
      answeredAt: answers.answeredAt,
    })
    .from(answers)
    .innerJoin(tokens, eq(answers.tokenId, tokens.id))
    .where(
      and(
        eq(answers.field, "mark"),
        eq(tokens.status, "signed"),
        ne(answers.value, vocab.skip_value),
      ),
    )
    .orderBy(asc(answers.answeredAt), asc(answers.tokenId));

  return {
    issued,
    byStatus,
    lookedDidNothing,
    rateLimitedCount: rateLimitedCount[0]?.count ?? 0,
    uaRows,
    distributions,
    mosaic,
    updatedAt: new Date(),
  };
}
