import { pgTable, serial, text, timestamp, numeric, jsonb, varchar, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const productsRaw = pgTable('products_raw', {
  rawId: serial('raw_id').primaryKey(),
  sourceUrl: text('source_url').notNull(),
  rawTitle: text('raw_title'),
  rawDescription: text('raw_description'),
  rawBreadcrumbs: text('raw_breadcrumbs').array(),
  rawPrice: text('raw_price'),
  rawBrand: text('raw_brand'),
  rawSku: text('raw_sku'),
  rawSpecs: text('raw_specs'),
  rawTags: text('raw_tags'),
  rawImages: text('raw_images').array(),
  rawJsonLd: jsonb('raw_json_ld'),
  scrapedAt: timestamp('scraped_at').defaultNow()
});

export const products = pgTable('products', {
  productId: serial('product_id').primaryKey(),
  rawId: integer('raw_id').references(() => productsRaw.rawId, { onDelete: 'cascade' }),
  title: text('title'),
  brand: text('brand'),
  sku: text('sku'),
  price: numeric('price', { precision: 12, scale: 2 }),
  category: text('category'),
  gender: text('gender'),
  tags: text('tags').array(),
  specs: jsonb('specs'),
  imageUrls: text('image_urls').array(),
  confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const productsEnriched = pgTable('products_enriched', {
  enrichId: serial('enrich_id').primaryKey(),
  rawId: integer('raw_id').references(() => productsRaw.rawId, { onDelete: 'cascade' }),
  normalizedCategory: text('normalized_category'),
  extraTags: text('extra_tags').array(),
  structuredSpecs: jsonb('structured_specs'),
  llmModelUsed: text('llm_model_used'),
  enrichedAt: timestamp('enriched_at').defaultNow()
});

export const categories = pgTable('categories', {
  categoryId: serial('category_id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  parentId: integer('parent_id'),
  level: integer('level').default(0),
  createdAt: timestamp('created_at').defaultNow()
});

export const tags = pgTable('tags', {
  tagId: serial('tag_id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  tagType: text('tag_type'),
  createdAt: timestamp('created_at').defaultNow()
});

export const productTags = pgTable('product_tags', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.productId, { onDelete: 'cascade' }),
  tagId: integer('tag_id').references(() => tags.tagId, { onDelete: 'cascade' })
});

export const productCategories = pgTable('product_categories', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.productId, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => categories.categoryId, { onDelete: 'cascade' })
});
