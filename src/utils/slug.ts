// ============================================================
// Shop Slug Generator
// Converts shop name into a clean, URL-friendly unique slug.
// Example: "Chai Corner" -> "chai-corner-x7k2"
// ============================================================

export function generateShopSlug(name: string): string {
  // 1. Clean the name: lowercase, replace spaces/special chars with hyphens
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // 2. Generate a random 4-character alphanumeric suffix
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // excluding ambiguous chars like 0, o, 1, l
  let randomSuffix = '';
  for (let i = 0; i < 4; i++) {
    randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const cleanBase = base.length > 0 ? base.slice(0, 30) : 'shop';
  return `${cleanBase}-${randomSuffix}`;
}
