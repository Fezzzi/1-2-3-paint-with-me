CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_kind_check" CHECK ("files"."kind" in ('source_photo', 'paint_reference', 'analysis', 'thumbnail'))
);
--> statement-breakpoint
CREATE TABLE "paints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"manufacturer" text,
	"product_line" text,
	"manufacturer_code" text,
	"label" text,
	"hex" text,
	"quantity_on_hand" numeric,
	"unit" text,
	"notes" text,
	"reference_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paints_quantity_nonnegative" CHECK ("paints"."quantity_on_hand" is null or "paints"."quantity_on_hand" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"hex" text NOT NULL,
	"paint_id" uuid,
	"area_cm2" numeric NOT NULL,
	"estimated_quantity" numeric NOT NULL,
	"shortfall" boolean DEFAULT false NOT NULL,
	CONSTRAINT "project_colors_number_check" CHECK ("project_colors"."number" >= 1),
	CONSTRAINT "project_colors_area_check" CHECK ("project_colors"."area_cm2" >= 0),
	CONSTRAINT "project_colors_quantity_check" CHECK ("project_colors"."estimated_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_file_id" uuid,
	"analysis_file_id" uuid,
	"analysis_key" text,
	"thumbnail_file_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"detail" text DEFAULT 'balanced' NOT NULL,
	"color_count" integer DEFAULT 24 NOT NULL,
	"paper_preset" text,
	"paper_width_mm" numeric,
	"paper_height_mm" numeric,
	"orientation" text NOT NULL,
	"margin_mm" numeric DEFAULT '10' NOT NULL,
	"coverage_rate" numeric DEFAULT '0.02' NOT NULL,
	"crop_x" numeric,
	"crop_y" numeric,
	"crop_width" numeric,
	"crop_height" numeric,
	"constrain_to_owned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_orientation_check" CHECK ("projects"."orientation" in ('portrait', 'landscape')),
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('draft', 'ready')),
	CONSTRAINT "projects_detail_check" CHECK ("projects"."detail" in ('simple', 'balanced', 'detailed'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
-- Postgres runs ON DELETE actions in foreign-key creation order. Deleting a user
-- must remove projects, then paints, then files. The reverse updates
-- projects.source_file_id or paints.reference_file_id on rows the same command
-- is about to delete, and Postgres rejects that. Keep this order.
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paints" ADD CONSTRAINT "paints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paints" ADD CONSTRAINT "paints_reference_file_id_files_id_fk" FOREIGN KEY ("reference_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_colors" ADD CONSTRAINT "project_colors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_colors" ADD CONSTRAINT "project_colors_paint_id_paints_id_fk" FOREIGN KEY ("paint_id") REFERENCES "public"."paints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_file_id_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_analysis_file_id_files_id_fk" FOREIGN KEY ("analysis_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_thumbnail_file_id_files_id_fk" FOREIGN KEY ("thumbnail_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_user_id_idx" ON "files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paints_user_id_idx" ON "paints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paints_reference_file_id_idx" ON "paints" USING btree ("reference_file_id");--> statement-breakpoint
CREATE INDEX "project_colors_project_id_idx" ON "project_colors" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_colors_project_number_unique" ON "project_colors" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "projects_analysis_file_id_idx" ON "projects" USING btree ("analysis_file_id");--> statement-breakpoint
CREATE INDEX "projects_thumbnail_file_id_idx" ON "projects" USING btree ("thumbnail_file_id");--> statement-breakpoint
CREATE INDEX "projects_user_updated_idx" ON "projects" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");