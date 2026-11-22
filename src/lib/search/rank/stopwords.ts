// Words too common to mean anything on their own. They still count inside a PHRASE ("what do
// I want today" as a title), but never make a note match by themselves. English plus the
// commonest Czech function words (the owner writes in both). Words of one letter are
// excluded separately (queryPlan), so they are not listed here.
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // English
  "am", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "did", "do",
  "does", "for", "from", "had", "has", "have", "he", "her", "him", "his", "how", "if", "in",
  "into", "is", "it", "its", "me", "my", "no", "not", "of", "on", "or", "our", "she", "so",
  "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to",
  "too", "up", "us", "was", "we", "were", "what", "when", "where", "which", "who", "why",
  "will", "with", "would", "you", "your",
  // Czech
  "ale", "aby", "co", "je", "jak", "jsem", "jsou", "na", "ne", "pro", "se", "si", "tak",
  "to", "ve", "za", "že",
]);
