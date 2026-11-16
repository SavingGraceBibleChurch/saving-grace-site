// Bible book groups for the card colour bands (classes hue--{group} in core.css).
const groups: Record<string, string[]> = {
  law: ["genesis", "exodus", "leviticus", "numbers", "deuteronomy"],
  history: ["joshua", "judges", "ruth", "1-samuel", "2-samuel", "1-kings", "2-kings", "1-chronicles", "2-chronicles", "ezra", "nehemiah", "esther"],
  wisdom: ["job", "psalms", "psalm", "proverbs", "ecclesiastes", "song-of-solomon", "song-of-songs"],
  "major-prophets": ["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel"],
  "minor-prophets": ["hosea", "joel", "amos", "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi"],
  "gospels-acts": ["matthew", "mark", "luke", "john", "acts"],
  pauline: ["romans", "1-corinthians", "2-corinthians", "galatians", "ephesians", "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy", "2-timothy", "titus", "philemon"],
  general: ["hebrews", "james", "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude"],
  revelation: ["revelation"],
};

const labels: Record<string, string> = {
  law: "The Law", history: "History", wisdom: "Wisdom & Poetry", "major-prophets": "Major Prophets",
  "minor-prophets": "Minor Prophets", "gospels-acts": "Gospels & Acts", pauline: "Pauline Letters",
  general: "General Letters", revelation: "Prophecy", topical: "Topical",
};

const bySlug = new Map(Object.entries(groups).flatMap(([group, slugs]) => slugs.map((slug) => [slug, group] as const)));

/** The colour group for a book slug; "topical" for sermons without a single book. */
export function bookGroup(slug?: string | null): string {
  return (slug && bySlug.get(slug)) || "topical";
}

export const groupLabel = (group: string) => labels[group] ?? "Topical";
