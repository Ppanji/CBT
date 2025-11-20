import { pgTable, serial, text, timestamp, varchar, integer, json } from "drizzle-orm/pg-core";

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  created_at: timestamp("created_at").defaultNow().notNull()
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  exam_id: integer("exam_id").references(() => exams.id).notNull(),
  text: text("text").notNull(),
  type: varchar("type", { length: 50 }).default("single-choice").notNull(),
  extra: json("extra")
});

export const options = pgTable("options", {
  id: serial("id").primaryKey(),
  question_id: integer("question_id").references(() => questions.id).notNull(),
  text: text("text").notNull(),
  is_correct: integer("is_correct").default(0)
});

export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  exam_id: integer("exam_id").references(() => exams.id).notNull(),
  student_name: varchar("student_name", { length: 255 }),
  started_at: timestamp("started_at").defaultNow().notNull(),
  finished_at: timestamp("finished_at")
});

export const answers = pgTable("answers", {
  id: serial("id").primaryKey(),
  attempt_id: integer("attempt_id").references(() => attempts.id).notNull(),
  question_id: integer("question_id").references(() => questions.id).notNull(),
  answer: json("answer")
});
