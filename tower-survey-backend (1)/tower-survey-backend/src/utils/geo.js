/**
 * Distance grand-cercle (Haversine) entre deux points lat/lon, en mètres.
 * Utilisée pour vérifier qu'un check-in GPS est suffisamment proche
 * des coordonnées connues du site.
 *
 * Robuste aux antipodes et aux pôles, précision ~0.5% — bien assez
 * pour notre seuil de 500 m.
 */
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== "number" || typeof lon1 !== "number" ||
    typeof lat2 !== "number" || typeof lon2 !== "number" ||
    Number.isNaN(lat1) || Number.isNaN(lon1) ||
    Number.isNaN(lat2) || Number.isNaN(lon2)
  ) {
    return null;
  }
  const R = 6_371_000; // rayon terrestre moyen en mètres
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { haversineDistance };
