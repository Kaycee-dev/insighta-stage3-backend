function ageGroup(age) {
  if (age <= 12) return 'child';
  if (age <= 19) return 'teenager';
  if (age <= 59) return 'adult';
  return 'senior';
}

function pickTopCountry(countries) {
  if (!Array.isArray(countries) || countries.length === 0) return null;
  return countries.reduce((best, c) =>
    (best === null || Number(c.probability) > Number(best.probability)) ? c : best,
  null);
}

module.exports = { ageGroup, pickTopCountry };
