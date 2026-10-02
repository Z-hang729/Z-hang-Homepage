import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull(),
});
export const archiveEntries = sqliteTable('archive_entries', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').notNull(),
  section: text('section').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  objectKey: text('object_key'),
  size: integer('size').notNull().default(0),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('archive_parent_name').on(table.parentId, table.name)]);
