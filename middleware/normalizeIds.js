// Most read endpoints use Mongoose's .lean() for performance, which returns
// plain objects and skips schema-level toJSON transforms. Rather than hand-roll
// an `id` mapping in every controller, this middleware wraps res.json and walks
// the payload once, adding a string `id` next to every ObjectId `_id` it finds
// (on the root document and any populated/nested sub-documents/arrays).
// `_id` itself is left in place so nothing that already relies on it breaks.

const isPlainObject = (val) =>
  Object.prototype.toString.call(val) === '[object Object]';

const addIds = (value, depth = 0) => {
  if (depth > 6 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    value.forEach((item) => addIds(item, depth + 1));
    return value;
  }

  if (isPlainObject(value)) {
    if (value._id !== undefined && value._id !== null && value.id === undefined) {
      value.id = value._id.toString();
    }
    Object.values(value).forEach((v) => addIds(v, depth + 1));
    return value;
  }

  return value;
};

export const normalizeIds = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(addIds(body));
  next();
};

export default normalizeIds;
