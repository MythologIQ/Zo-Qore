export function selectPreferredSkill(grouped, isFavorite = () => false) {
  const relevant = Array.isArray(grouped?.allRelevant) ? grouped.allRelevant : [];
  const recommended = Array.isArray(grouped?.recommended) ? grouped.recommended : [];
  const candidates = relevant.length > 0 ? relevant : recommended;
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const favorite = candidates.find((skill) => isFavorite(String(skill?.key || '')));
  return favorite || candidates[0];
}
