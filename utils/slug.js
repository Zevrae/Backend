// Turns a display name into a URL-safe slug:
//   "ZEVRAE — Durga Puja Oversized T-Shirt" -> "zevrae-durga-puja-oversized-t-shirt"
// Returns "" if nothing usable is left (e.g. a name made only of symbols or
// non-Latin characters) — callers should fall back to a default.
export const slugify = (str) =>
  String(str ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100)
    .replace(/-$/, "");

// A 24-char hex string is an ObjectId. Checked with a regex rather than
// mongoose.isValidObjectId, which also accepts any 12-character string —
// so a short slug like "black-tshirt" would wrongly be treated as an id.
export const isObjectIdString = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
