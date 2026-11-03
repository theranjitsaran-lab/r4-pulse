// What kind of organisation an account is, read from its name: the database holds no industry. Used for the tag on
// Cross-sell and to find comparable accounts, and said on screen to be a reading of the name. No DOM.
const RULES = [
  ['Law firm', /\b(llp|attorneys?|law|legal|counsel|p\.?c\.?)\b|\b(gates|cutler|shelist|houpt|watkins|malloy|townsend|stockton|mcdermott|winston|sidley|kirkland|jenner|mayer brown|schiff|baker|katten|seyfarth|neal|drinker)\b/i],
  ['Public body', /\b(city of|county|state of|village of|town of|attorney general|department of|dept\.? of|public schools?|housing authority|park district|metra|transit|cta|government|municipal|court|illinois|board of)\b/i],
  ['Healthcare', /\b(hospital|medical|medicine|health|healthcare|clinic|dental|smiles|surgical|gynecology|pediatric|physicians?|pharma|cardio|oncology|ortho\w*|children's)\b/i],
  ['Finance', /\b(bank|trust|securities|exchange|capital|financial|insurance|credit union|investments?|mortgage|cboe|futures|title)\b/i],
  ['Education', /\b(university|college|school|institute|iit|academy)\b/i],
];
export function accountKind(name) {
  const n = String(name || '');
  for (const [k, re] of RULES) if (re.test(n)) return k;
  return 'Business';
}
const PLURAL = { 'Law firm': 'law firms', 'Public body': 'public bodies', Healthcare: 'healthcare accounts', Finance: 'finance accounts', Education: 'education accounts', Business: 'businesses' };
export const kindPlural = k => PLURAL[k] || 'accounts';
