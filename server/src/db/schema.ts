import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

function createdAtColumn() {
  return timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}

function updatedAtColumn() {
  return timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: createdAtColumn(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('files_user_id_idx').on(table.userId),
    check(
      'files_kind_check',
      sql`${table.kind} in ('source_photo', 'paint_reference', 'analysis', 'thumbnail')`,
    ),
  ],
)

export const paints = pgTable(
  'paints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    manufacturer: text('manufacturer'),
    productLine: text('product_line'),
    manufacturerCode: text('manufacturer_code'),
    label: text('label'),
    hex: text('hex'),
    quantityOnHand: numeric('quantity_on_hand'),
    unit: text('unit'),
    notes: text('notes'),
    referenceFileId: uuid('reference_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index('paints_user_id_idx').on(table.userId),
    index('paints_reference_file_id_idx').on(table.referenceFileId),
    check(
      'paints_quantity_nonnegative',
      sql`${table.quantityOnHand} is null or ${table.quantityOnHand} >= 0`,
    ),
  ],
)

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceFileId: uuid('source_file_id').references(() => files.id, { onDelete: 'set null' }),
    analysisFileId: uuid('analysis_file_id').references(() => files.id, { onDelete: 'set null' }),
    analysisKey: text('analysis_key'),
    thumbnailFileId: uuid('thumbnail_file_id').references(() => files.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('draft'),
    detail: text('detail').notNull().default('balanced'),
    colorCount: integer('color_count').notNull().default(24),
    paperPreset: text('paper_preset'),
    paperWidthMm: numeric('paper_width_mm'),
    paperHeightMm: numeric('paper_height_mm'),
    orientation: text('orientation').notNull(),
    marginMm: numeric('margin_mm').notNull().default('10'),
    coverageRate: numeric('coverage_rate').notNull().default('0.02'),
    cropX: numeric('crop_x'),
    cropY: numeric('crop_y'),
    cropWidth: numeric('crop_width'),
    cropHeight: numeric('crop_height'),
    constrainToOwned: boolean('constrain_to_owned').notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index('projects_analysis_file_id_idx').on(table.analysisFileId),
    index('projects_thumbnail_file_id_idx').on(table.thumbnailFileId),
    index('projects_user_updated_idx').on(table.userId, table.updatedAt.desc()),
    check(
      'projects_orientation_check',
      sql`${table.orientation} in ('portrait', 'landscape')`,
    ),
    check('projects_status_check', sql`${table.status} in ('draft', 'ready')`),
    check('projects_detail_check', sql`${table.detail} in ('simple', 'balanced', 'detailed')`),
  ],
)

export const projectColors = pgTable(
  'project_colors',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  hex: text('hex').notNull(),
  paintId: uuid('paint_id').references(() => paints.id, { onDelete: 'set null' }),
  areaCm2: numeric('area_cm2').notNull(),
  estimatedQuantity: numeric('estimated_quantity').notNull(),
  shortfall: boolean('shortfall').notNull().default(false),
  },
  (table) => [
    index('project_colors_project_id_idx').on(table.projectId),
    uniqueIndex('project_colors_project_number_unique').on(table.projectId, table.number),
    check('project_colors_number_check', sql`${table.number} >= 1`),
    check('project_colors_area_check', sql`${table.areaCm2} >= 0`),
    check('project_colors_quantity_check', sql`${table.estimatedQuantity} >= 0`),
  ],
)

export type Session = typeof sessions.$inferSelect
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type StoredFile = typeof files.$inferSelect
export type NewStoredFile = typeof files.$inferInsert
export type Paint = typeof paints.$inferSelect
export type NewPaint = typeof paints.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ProjectColor = typeof projectColors.$inferSelect
export type NewProjectColor = typeof projectColors.$inferInsert
