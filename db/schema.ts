import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull(),
});
