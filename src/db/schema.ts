import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const tokens = pgTable("tokens", {
  id: text("id").primaryKey(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  vocabVersion: integer("vocab_version").notNull(),
  uaRulesVersion: integer("ua_rules_version").notNull(),
  uaClass: text("ua_class").notNull(),
  uaFamily: text("ua_family").notNull(),
  status: text("status").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  rateLimited: boolean("rate_limited").notNull().default(false),
  /** Fast-sweep after a signed/declined commit. Status is left as stored. */
  swept: boolean("swept").notNull().default(false),
});

export const answers = pgTable(
  "answers",
  {
    tokenId: text("token_id")
      .notNull()
      .references(() => tokens.id),
    field: text("field").notNull(),
    value: text("value").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(),
    path: text("path").notNull(),
    position: integer("position"),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.field, t.value] })],
);

export type Token = typeof tokens.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type TokenStatus =
  | "issued"
  | "partial"
  | "signed"
  | "declined"
  | "branched"
  | "expired";
