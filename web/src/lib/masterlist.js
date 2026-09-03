// ============================================================================
// Masterlist d'indicateurs — référentiel standard (inspiré du cadre de
// résultats PAM / CRF). Sert de bibliothèque dans laquelle piocher au moment
// de créer un indicateur : code, libellé, unité, niveau, catégorie, polarité
// et source de vérification sont pré-remplis.
// ============================================================================

// polarity : 'positive' = croissant (↑ mieux) · 'negative' = décroissant (↓ mieux)
export const MASTERLIST = [
  // --- Sécurité alimentaire (effets) ----------------------------------------
  { code: 'FS-OC-01', name: 'Score de consommation alimentaire acceptable (ménages)', unit: '%', level: 'outcome', category: 'Sécurité alimentaire', polarity: 'positive', source: 'Enquête ménage (PDM)' },
  { code: 'FS-OC-02', name: 'Indice réduit des stratégies de survie (rCSI)', unit: 'indice', level: 'outcome', category: 'Sécurité alimentaire', polarity: 'negative', source: 'Enquête ménage (PDM)' },
  { code: 'FS-OC-03', name: 'Indice des stratégies d’adaptation aux moyens d’existence (LCS-FS)', unit: '%', level: 'outcome', category: 'Sécurité alimentaire', polarity: 'negative', source: 'Enquête ménage (PDM)' },
  { code: 'FS-OC-04', name: 'Part des dépenses alimentaires des ménages (FES)', unit: '%', level: 'outcome', category: 'Sécurité alimentaire', polarity: 'negative', source: 'Enquête ménage (PDM)' },
  { code: 'FS-OC-05', name: 'Score de diversité alimentaire des ménages (HDDS)', unit: 'score', level: 'outcome', category: 'Sécurité alimentaire', polarity: 'positive', source: 'Enquête ménage (PDM)' },

  // --- Assistance alimentaire générale (produits) ---------------------------
  { code: 'FS-OUT-01', name: 'Nombre de personnes recevant une assistance alimentaire générale', unit: 'personnes', level: 'output', category: 'Assistance alimentaire', polarity: 'positive', source: 'Rapport de distribution' },
  { code: 'FS-OUT-02', name: 'Quantité de vivres distribuée', unit: 'tonnes', level: 'output', category: 'Assistance alimentaire', polarity: 'positive', source: 'Rapport de distribution' },
  { code: 'FS-OUT-03', name: 'Nombre de ménages ayant reçu une ration complète', unit: 'ménages', level: 'output', category: 'Assistance alimentaire', polarity: 'positive', source: 'Rapport de distribution' },

  // --- Transferts monétaires (CBT) ------------------------------------------
  { code: 'CBT-OUT-01', name: 'Valeur des transferts monétaires distribués', unit: 'USD', level: 'output', category: 'Transferts monétaires', polarity: 'positive', source: 'Plateforme de paiement' },
  { code: 'CBT-OUT-02', name: 'Nombre de personnes recevant des transferts monétaires', unit: 'personnes', level: 'output', category: 'Transferts monétaires', polarity: 'positive', source: 'Plateforme de paiement' },
  { code: 'CBT-OUT-03', name: 'Nombre de commerçants/détaillants engagés dans le programme', unit: 'commerçants', level: 'output', category: 'Transferts monétaires', polarity: 'positive', source: 'Registre des commerçants' },
  { code: 'CBT-PR-01', name: 'Délai moyen entre la validation et le paiement des bénéficiaires', unit: 'jours', level: 'process', category: 'Transferts monétaires', polarity: 'negative', source: 'Plateforme de paiement' },

  // --- Nutrition (effets & produits) ----------------------------------------
  { code: 'NUT-OC-01', name: 'Couverture du programme de supplémentation nutritionnelle', unit: '%', level: 'outcome', category: 'Nutrition', polarity: 'positive', source: 'Enquête SQUEAC' },
  { code: 'NUT-OC-02', name: 'Taux de guérison de la malnutrition aiguë modérée (MAM)', unit: '%', level: 'outcome', category: 'Nutrition', polarity: 'positive', source: 'Base de données PECMA' },
  { code: 'NUT-OC-03', name: 'Taux d’abandon du traitement nutritionnel', unit: '%', level: 'outcome', category: 'Nutrition', polarity: 'negative', source: 'Base de données PECMA' },
  { code: 'NUT-OC-04', name: 'Diversité alimentaire minimale des femmes (MDD-W)', unit: '%', level: 'outcome', category: 'Nutrition', polarity: 'positive', source: 'Enquête ménage' },
  { code: 'NUT-OUT-01', name: 'Nombre d’enfants 6–59 mois admis à la supplémentation (BSFP/TSFP)', unit: 'enfants', level: 'output', category: 'Nutrition', polarity: 'positive', source: 'Rapport de site nutritionnel' },
  { code: 'NUT-OUT-02', name: 'Nombre de femmes enceintes et allaitantes bénéficiaires', unit: 'personnes', level: 'output', category: 'Nutrition', polarity: 'positive', source: 'Rapport de site nutritionnel' },
  { code: 'NUT-PR-01', name: 'Nombre d’enfants dépistés (MUAC) au niveau communautaire', unit: 'enfants', level: 'process', category: 'Nutrition', polarity: 'positive', source: 'Registre de dépistage' },

  // --- Cantines scolaires ----------------------------------------------------
  { code: 'SF-OUT-01', name: 'Nombre d’écoliers recevant un repas scolaire quotidien', unit: 'écoliers', level: 'output', category: 'Cantines scolaires', polarity: 'positive', source: 'Registre scolaire' },
  { code: 'SF-OC-01', name: 'Taux de rétention scolaire dans les écoles assistées', unit: '%', level: 'outcome', category: 'Cantines scolaires', polarity: 'positive', source: 'Statistiques scolaires' },
  { code: 'SF-OC-02', name: 'Taux de fréquentation dans les écoles assistées', unit: '%', level: 'outcome', category: 'Cantines scolaires', polarity: 'positive', source: 'Statistiques scolaires' },

  // --- Résilience & moyens de subsistance -----------------------------------
  { code: 'RES-OUT-01', name: 'Hectares d’actifs créés ou réhabilités (FFA)', unit: 'ha', level: 'output', category: 'Résilience', polarity: 'positive', source: 'Rapport de chantier' },
  { code: 'RES-OUT-02', name: 'Nombre de ménages recevant des kits/intrants agricoles', unit: 'ménages', level: 'output', category: 'Résilience', polarity: 'positive', source: 'Rapport de distribution' },
  { code: 'RES-OC-01', name: 'Ménages déclarant des sources de revenus diversifiées', unit: '%', level: 'outcome', category: 'Résilience', polarity: 'positive', source: 'Enquête résilience' },
  { code: 'RES-OC-02', name: 'Score de capacité d’adaptation des communautés (ABSI)', unit: 'score', level: 'outcome', category: 'Résilience', polarity: 'positive', source: 'Enquête résilience' },

  // --- Réponse aux chocs -----------------------------------------------------
  { code: 'EMR-OUT-01', name: 'Nombre de personnes sinistrées recevant une assistance d’urgence', unit: 'personnes', level: 'output', category: 'Réponse aux chocs', polarity: 'positive', source: 'Rapport de réponse' },
  { code: 'EMR-PR-01', name: 'Délai de réponse après déclenchement de l’alerte', unit: 'jours', level: 'process', category: 'Réponse aux chocs', polarity: 'negative', source: 'Journal de réponse' },

  // --- Redevabilité, protection & genre (transversaux) ----------------------
  { code: 'CC-AAP-01', name: 'Proportion de bénéficiaires informés du programme (qui, quoi, où, combien)', unit: '%', level: 'outcome', category: 'Redevabilité (AAP)', polarity: 'positive', source: 'Enquête de redevabilité' },
  { code: 'CC-AAP-02', name: 'Proportion de plaintes traitées dans les délais (CFM)', unit: '%', level: 'process', category: 'Redevabilité (AAP)', polarity: 'positive', source: 'Registre CFM' },
  { code: 'CC-PRO-01', name: 'Proportion de bénéficiaires ne signalant pas de problème de sécurité/dignité', unit: '%', level: 'outcome', category: 'Protection', polarity: 'positive', source: 'Enquête de protection' },
  { code: 'CC-GEN-01', name: 'Proportion de femmes dans les comités de gestion/ciblage', unit: '%', level: 'outcome', category: 'Genre', polarity: 'positive', source: 'Listes des comités' },
  { code: 'CC-GEN-02', name: 'Proportion de décisions de transfert au nom d’une femme du ménage', unit: '%', level: 'output', category: 'Genre', polarity: 'positive', source: 'Base bénéficiaires' },

  // --- Ciblage & processus ---------------------------------------------------
  { code: 'PR-TAR-01', name: 'Nombre de sites ayant réalisé un ciblage communautaire vérifié', unit: 'sites', level: 'process', category: 'Ciblage', polarity: 'positive', source: 'Rapport de ciblage' },
  { code: 'PR-TAR-02', name: 'Taux d’exactitude du ciblage (vérification post-distribution)', unit: '%', level: 'process', category: 'Ciblage', polarity: 'positive', source: 'Vérification post-distribution' },

  // --- Logistique & chaîne d’approvisionnement ------------------------------
  { code: 'LOG-PR-01', name: 'Taux de livraison à temps et complète (OTIF)', unit: '%', level: 'process', category: 'Logistique', polarity: 'positive', source: 'Système de suivi logistique' },
  { code: 'LOG-PR-02', name: 'Taux de pertes après livraison', unit: '%', level: 'process', category: 'Logistique', polarity: 'negative', source: 'Rapport d’entrepôt' },

  // --- Impact (haut niveau) --------------------------------------------------
  { code: 'IM-01', name: 'Prévalence de l’insécurité alimentaire (CARI)', unit: '%', level: 'impact', category: 'Sécurité alimentaire', polarity: 'negative', source: 'Enquête nationale / IPC' },
  { code: 'IM-02', name: 'Prévalence de la malnutrition aiguë globale (GAM)', unit: '%', level: 'impact', category: 'Nutrition', polarity: 'negative', source: 'Enquête SMART' },
]

// Catégories distinctes (ordre de première apparition)
export const MASTERLIST_CATEGORIES = [...new Set(MASTERLIST.map((m) => m.category))]

export function masterlistByCategory() {
  const map = new Map()
  for (const m of MASTERLIST) {
    if (!map.has(m.category)) map.set(m.category, [])
    map.get(m.category).push(m)
  }
  return map
}
