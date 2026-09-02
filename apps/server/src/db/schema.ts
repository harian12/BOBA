import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  createdAt: text('created_at').notNull(),
});

export const vaultBlobs = sqliteTable('vault_blobs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  encryptedData: text('encrypted_data').notNull(),
  checksum: text('checksum').notNull(),
  updatedAt: text('updated_at').notNull(),
});
