import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  bigserial,
} from "drizzle-orm/pg-core";

/** Pilot tables — untouched by era 1; kept for archive exports. */
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

/** Era 1 */
export const visits = pgTable("visits", {
  id: text("id").primaryKey(),
  era: integer("era").notNull().default(1),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  vocabVersion: text("vocab_version").notNull(),
  uaRulesVersion: integer("ua_rules_version").notNull(),
  uaClass: text("ua_class").notNull(),
  uaFamily: text("ua_family").notNull(),
  uaSuspect: boolean("ua_suspect").notNull().default(false),
  status: text("status").notNull(),
  swept: boolean("swept").notNull().default(false),
  rateLimited: boolean("rate_limited").notNull().default(false),
  lateFetches: integer("late_fetches").notNull().default(0),
  inheritedFrom: text("inherited_from"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drawings = pgTable("drawings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  visitId: text("visit_id").references(() => visits.id),
  kind: text("kind").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  pattern: text("pattern").notNull(),
  path: text("path").notNull(),
  optionOrder: text("option_order"),
  status: text("status").notNull(),
  excludedReason: text("excluded_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const census = pgTable("census", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  visitId: text("visit_id")
    .notNull()
    .references(() => visits.id),
  field: text("field").notNull(),
  value: text("value").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(),
  path: text("path").notNull(),
  position: integer("position"),
  optionOrder: text("option_order"),
  superseded: boolean("superseded").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const canvasState = pgTable("canvas_state", {
  id: integer("id").primaryKey(),
  frameSize: integer("frame_size").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Visit = typeof visits.$inferSelect;
export type Drawing = typeof drawings.$inferSelect;
export type CensusRow = typeof census.$inferSelect;
export type CanvasState = typeof canvasState.$inferSelect;
export type VisitStatus =
  | "issued"
  | "drawn"
  | "signed"
  | "declined"
  | "branched";
