// One-time data repair for products whose stored `inventory_mode` doesn't
// match their actual `sizes`/`size_stock` data — almost always products
// created before the inventory_mode field existed, which defaulted to
// 'nosize' while still holding real per-size stock. That mismatch is what
// was blocking image upload/delete for those products (see productController.js
// — .save() re-validates the whole document, including this consistency
// check, even for an unrelated field change).
//
// Usage:
//   node scripts/fix-inventory-mode.js            (dry run — reports only)
//   node scripts/fix-inventory-mode.js --apply     (actually writes fixes)
//
// Safe to run multiple times — products that are already consistent are
// left untouched and don't show up in the report.

import "dotenv/config";
import mongoose from "mongoose";
import Product from "../models/Product.js";

const APPLY = process.argv.includes("--apply");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? "APPLYING FIXES" : "DRY RUN (pass --apply to write changes)"}\n`);

  // Read raw so we see exactly what's stored, without any schema defaults
  // or validators kicking in — we want the true current state.
  const products = await Product.find({ is_deleted: { $ne: true } }).lean();

  let mismatched = 0;
  let fixed = 0;

  for (const p of products) {
    const sizes = p.sizes || [];
    const sizeStock = p.size_stock instanceof Map ? Object.fromEntries(p.size_stock) : p.size_stock || {};
    const hasStockEntries = Object.keys(sizeStock).length > 0;

    let correctMode = p.inventory_mode;
    if (sizes.length > 0) {
      correctMode = "size";
    } else if (hasStockEntries) {
      correctMode = "nosize";
    }
    // If neither sizes nor size_stock has anything, leave inventory_mode
    // as-is — there's no data to infer a correction from.

    if (correctMode !== p.inventory_mode) {
      mismatched++;
      console.log(
        `${APPLY ? "FIXING" : "WOULD FIX"}: "${p.name}" (${p._id}) — inventory_mode "${p.inventory_mode}" -> "${correctMode}" ` +
        `(sizes: [${sizes.join(", ")}], size_stock keys: [${Object.keys(sizeStock).join(", ")}])`
      );

      if (APPLY) {
        // Direct collection update, bypassing Mongoose validation entirely —
        // appropriate here since we're fixing exactly the field the
        // validator checks, using the same logic it uses, so there's
        // nothing left to validate against.
        await Product.collection.updateOne({ _id: p._id }, { $set: { inventory_mode: correctMode } });
        fixed++;
      }
    }
  }

  console.log(`\n${products.length} product(s) checked, ${mismatched} mismatched${APPLY ? `, ${fixed} fixed` : ""}.`);
  if (!APPLY && mismatched > 0) {
    console.log(`Run again with --apply to write these fixes.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
