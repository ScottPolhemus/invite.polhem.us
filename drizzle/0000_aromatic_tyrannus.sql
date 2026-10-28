CREATE TABLE "ingest_cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_session" (
	"sub" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record" (
	"uri" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"collection" text NOT NULL,
	"rkey" text NOT NULL,
	"cid" text NOT NULL,
	"value" jsonb NOT NULL,
	"seq" bigint,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "record_collection_did_idx" ON "record" USING btree ("collection","did");--> statement-breakpoint
CREATE INDEX "record_recipient_idx" ON "record" USING btree (("value"->>'recipient'));