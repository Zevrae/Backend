// One-off backfill: gives every existing product (including soft-deleted
// ones) a slug generated from its name.
//
//   node scripts/backfillProductSlugs.js           -> dry run, writes nothing
//   node scripts/backfillProductSlugs.js --apply   -> actually updates the DB
//
// Safe to re-run: products that already have a slug are never touched.
// Uses the raw collection so the soft-delete query hooks don't hide deleted
// products and `updated_at` isn't bumped.

import "dotenv/config";
import mongoose from "mongoose";
import { slugify } from "../utils/slug.js";

const APPLY = process.argv.includes("--apply");

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  console.log(
    `Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no writes)"}\n`,
  );

  const coll = mongoose.connection.db.collection("products");

  // Slugs already in use, so new ones never clash with them (or with each
  // other, since each one we assign is added to this set as we go).
  const used = new Set(
    (
      await coll
        .find(
          { slug: { $exists: true, $ne: null } },
          { projection: { slug: 1 } },
        )
        .toArray()
    ).map((d) => d.slug),
  );

  const missing = await coll
    .find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] })
    .project({ name: 1 })
    .toArray();

  const ops = [];
  for (const doc of missing) {
    const base = slugify(doc.name) || "product";
    // Same rule as the model hook: on a clash, append the tail of the _id.
    const slug = used.has(base)
      ? `${base}-${doc._id.toString().slice(-6)}`
      : base;
    used.add(slug);
    ops.push({
      updateOne: { filter: { _id: doc._id }, update: { $set: { slug } } },
    });
    console.log(`  ${doc._id}  "${doc.name}"  ->  ${slug}`);
  }

  console.log(`\n${missing.length} product(s) without a slug.`);
  if (APPLY && ops.length > 0) {
    const result = await coll.bulkWrite(ops);
    console.log(`Updated ${result.modifiedCount} product(s).`);
  } else if (!APPLY && ops.length > 0) {
    console.log("Dry run — re-run with --apply to write these.");
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
