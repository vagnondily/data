// ============================================================================
// Données de démonstration — portefeuille humanitaire (Madagascar / PAM)
// Générées au premier lancement, puis persistées dans le navigateur.
// ============================================================================
import { ORG_DEFAULT, REGIONS, PERIODS } from './constants.js'

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
const jitter = (v, amt = 0.6) => v + (Math.random() - 0.5) * amt

export function buildSeed() {
  // ---- Utilisateurs -------------------------------------------------------
  const users = [
    { id: 'u_armi', name: 'Armi Monja', email: 'armi.monja@gmail.com', role: 'super', officeId: 'of_pays', title: "Administrateur d'instance", active: true },
    { id: 'u_hery', name: 'Hery Rakotoarisoa', email: 'hery.se@mems.mg', role: 'admin', officeId: 'of_pays', title: 'Responsable Suivi & Évaluation', active: true },
    { id: 'u_tiana', name: 'Tiana Razafindrakoto', email: 'tiana.prog@mems.mg', role: 'editor', officeId: 'of_pays', title: 'Gestionnaire de programme', active: true },
    { id: 'u_naina', name: 'Naina Andrianina', email: 'naina.field@mems.mg', role: 'editor', officeId: 'of_sud', title: 'Chargé de suivi de terrain', active: true },
    { id: 'u_fara', name: 'Fara Raharimalala', email: 'fara.field@mems.mg', role: 'editor', officeId: 'of_grandsud', title: 'Chargée de suivi de terrain', active: true },
    { id: 'u_miora', name: 'Miora Rasoanaivo', email: 'miora.val@mems.mg', role: 'validator', officeId: 'of_est', title: 'Validatrice bureau', active: true },
    { id: 'u_lova', name: 'Lova Rakotomalala', email: 'lova.view@mems.mg', role: 'viewer', officeId: 'of_pays', title: 'Analyste', active: true },
  ]

  const offices = [
    { id: 'of_pays', name: 'Bureau Pays — Antananarivo', type: 'pays', parentId: null, region: 'MG11', scopeMode: 'national' },
    { id: 'of_sud', name: 'Bureau de terrain Sud — Toliara', type: 'terrain', parentId: 'of_pays', region: 'MG32', scopeMode: 'office' },
    { id: 'of_grandsud', name: 'Antenne Grand Sud — Ambovombe', type: 'antenne', parentId: 'of_sud', region: 'MG33', scopeMode: 'office' },
    { id: 'of_est', name: 'Bureau de terrain Est — Toamasina', type: 'terrain', parentId: 'of_pays', region: 'MG53', scopeMode: 'office' },
  ]

  const partners = [
    { id: 'p_usaid', name: 'USAID / BHA', acronym: 'USAID', type: 'bailleur' },
    { id: 'p_ue', name: 'Union Européenne', acronym: 'UE', type: 'bailleur' },
    { id: 'p_wfp', name: 'Fonds propres PAM', acronym: 'PAM', type: 'bailleur' },
    { id: 'p_ocha', name: 'Fonds humanitaire (OCHA)', acronym: 'CERF', type: 'bailleur' },
    { id: 'p_gret', name: 'ONG GRET', acronym: 'GRET', type: 'partenaire' },
    { id: 'p_asos', name: 'ASOS Madagascar', acronym: 'ASOS', type: 'partenaire' },
    { id: 'p_ravaka', name: 'Cabinet Ravaka Consulting', acronym: 'Ravaka', type: 'prestataire' },
    { id: 'p_mahefa', name: 'Bureau Mahefa Études', acronym: 'Mahefa', type: 'prestataire' },
  ]

  // ---- Programmes ---------------------------------------------------------
  const programmes = [
    {
      id: 'prog_csa', code: 'PRG-CSA', name: 'Résilience & Sécurité Alimentaire — Grand Sud',
      donorId: 'p_usaid', managerId: 'u_tiana', status: 'actif',
      startDate: iso(2024, 1, 1), endDate: iso(2026, 12, 31),
      budget: 18500000, currency: 'USD', sectors: ['Sécurité alimentaire', 'Résilience & moyens de subsistance', 'Transferts monétaires'],
      description: "Programme intégré d'assistance alimentaire, de relèvement et de résilience dans le Grand Sud face à la sécheresse (kere).",
    },
    {
      id: 'prog_nut', code: 'PRG-NUT', name: 'Nutrition & Cantines Scolaires',
      donorId: 'p_ue', managerId: 'u_tiana', status: 'actif',
      startDate: iso(2024, 6, 1), endDate: iso(2027, 5, 31),
      budget: 9200000, currency: 'USD', sectors: ['Nutrition', 'Cantines scolaires'],
      description: 'Prévention de la malnutrition aiguë et alimentation scolaire dans le Sud et le Sud-Est.',
    },
  ]

  // ---- Projets ------------------------------------------------------------
  const projects = [
    {
      id: 'pr_gs1', code: 'MG-GS-01', name: "Assistance alimentaire d'urgence — Androy",
      programmeId: 'prog_csa', donorId: 'p_usaid', managerId: 'u_tiana', status: 'en_cours', phase: 'Mise en œuvre',
      startDate: iso(2024, 1, 15), endDate: iso(2025, 12, 31), budget: 7200000, currency: 'USD',
      sector: 'Sécurité alimentaire', priority: 'haute', regions: ['MG33', 'MG34'],
      objectiveGlobal: "Réduire l'insécurité alimentaire aiguë des ménages vulnérables du Grand Sud.",
      description: "Distributions alimentaires générales et transferts monétaires ciblés dans l'Androy et l'Anosy.",
    },
    {
      id: 'pr_gs2', code: 'MG-GS-02', name: 'Relèvement & moyens de subsistance — Anosy',
      programmeId: 'prog_csa', donorId: 'p_usaid', managerId: 'u_naina', status: 'en_cours', phase: 'Mise en œuvre',
      startDate: iso(2024, 4, 1), endDate: iso(2026, 3, 31), budget: 4300000, currency: 'USD',
      sector: 'Résilience & moyens de subsistance', priority: 'moyenne', regions: ['MG34', 'MG26'],
      objectiveGlobal: 'Restaurer les moyens de subsistance et renforcer la résilience communautaire.',
      description: 'Activités de création d’actifs (FFA), appui agricole et relèvement précoce.',
    },
    {
      id: 'pr_nut1', code: 'MG-NU-01', name: 'Prévention de la malnutrition — Atsimo-Andrefana',
      programmeId: 'prog_nut', donorId: 'p_ue', managerId: 'u_tiana', status: 'en_cours', phase: 'Mise en œuvre',
      startDate: iso(2024, 7, 1), endDate: iso(2026, 6, 30), budget: 3100000, currency: 'USD',
      sector: 'Nutrition', priority: 'haute', regions: ['MG32'],
      objectiveGlobal: 'Prévenir la malnutrition aiguë chez les enfants de 6-59 mois et les FEFA.',
      description: 'Supplémentation nutritionnelle (BSFP), dépistage et sensibilisation ANJE.',
    },
    {
      id: 'pr_can1', code: 'MG-NU-02', name: 'Cantines scolaires — Sud-Est',
      programmeId: 'prog_nut', donorId: 'p_ue', managerId: 'u_miora', status: 'planification', phase: 'Planification',
      startDate: iso(2025, 9, 1), endDate: iso(2027, 5, 31), budget: 2600000, currency: 'USD',
      sector: 'Cantines scolaires', priority: 'moyenne', regions: ['MG24', 'MG25'],
      objectiveGlobal: 'Améliorer la fréquentation scolaire et la sécurité alimentaire des écoliers.',
      description: 'Repas scolaires quotidiens et appui aux cantines communautaires.',
    },
    {
      id: 'pr_shock', code: 'MG-RE-01', name: 'Réponse cyclone — Côte Est',
      programmeId: 'prog_csa', donorId: 'p_ocha', managerId: 'u_miora', status: 'en_cours', phase: 'Réponse',
      startDate: iso(2025, 2, 1), endDate: iso(2025, 10, 31), budget: 1800000, currency: 'USD',
      sector: 'Réponse aux chocs', priority: 'haute', regions: ['MG53', 'MG52'],
      objectiveGlobal: 'Couvrir les besoins alimentaires immédiats des populations sinistrées.',
      description: "Réponse d'urgence post-cyclone : rations sèches et transferts d'urgence.",
    },
  ]

  // ---- Cadre logique : objectifs & résultats ------------------------------
  const objectives = []
  const results = []
  const oid = (p, n) => `ob_${p}_${n}`
  const rid = (p, n) => `re_${p}_${n}`
  function addLog(p, specs) {
    specs.forEach((o, i) => {
      objectives.push({ id: oid(p, i + 1), projectId: p, code: `OS${i + 1}`, label: o.label, type: i === 0 ? 'specifique' : 'specifique' })
      o.results.forEach((r, j) => {
        results.push({ id: rid(p, `${i + 1}${j + 1}`), projectId: p, objectiveId: oid(p, i + 1), code: `R${i + 1}.${j + 1}`, label: r })
      })
    })
  }
  addLog('pr_gs1', [
    { label: 'Couvrir les besoins alimentaires immédiats des ménages ciblés', results: ['Les ménages vulnérables reçoivent une assistance alimentaire mensuelle', 'Les transferts monétaires sont distribués sans rupture'] },
    { label: "Assurer un ciblage et un suivi de qualité", results: ['Le ciblage communautaire est réalisé et vérifié', 'Les plaintes et retours sont traités'] },
  ])
  addLog('pr_gs2', [
    { label: 'Restaurer les actifs productifs communautaires', results: ['Des actifs (bassins, reboisement) sont créés via FFA', 'Les ménages reçoivent des intrants agricoles'] },
    { label: 'Renforcer les capacités locales', results: ['Les comités villageois sont formés à la gestion des actifs'] },
  ])
  addLog('pr_nut1', [
    { label: 'Réduire la prévalence de la malnutrition aiguë', results: ['Les enfants 6-59 mois bénéficient de la BSFP', 'Le dépistage actif est assuré au niveau communautaire'] },
    { label: 'Améliorer les pratiques ANJE', results: ['Les mères/gardiennes sont sensibilisées aux bonnes pratiques'] },
  ])
  addLog('pr_can1', [
    { label: 'Fournir des repas scolaires quotidiens', results: ['Les écoles ciblées servent un repas chaud par jour de classe'] },
    { label: 'Renforcer la gouvernance des cantines', results: ['Les comités de gestion des cantines sont opérationnels'] },
  ])
  addLog('pr_shock', [
    { label: "Répondre aux besoins d'urgence post-cyclone", results: ['Les sinistrés reçoivent des rations sèches', 'Des transferts d’urgence sont distribués'] },
  ])

  // ---- Indicateurs (avec valeurs prévu/réalisé par période) ---------------
  const indicators = []
  function mkInd(spec) {
    const values = PERIODS.map((period, idx) => {
      const share = (idx + 1) / PERIODS.length
      const planned = Math.round(spec.target * share)
      const done = period <= '2025-T3'
      const actual = done ? Math.round(spec.target * share * spec.perf) : null
      return { period, planned, actual }
    })
    indicators.push({
      id: spec.id, projectId: spec.projectId, resultId: spec.resultId, code: spec.code, name: spec.name,
      unit: spec.unit, level: spec.level, polarity: spec.polarity || 'positive',
      baseline: spec.baseline ?? 0, baselineYear: 2023, target: spec.target, category: spec.category,
      source: spec.source || 'Rapport de distribution', frequency: 'Trimestrielle', values,
    })
  }
  mkInd({ id: 'in_gs1_1', projectId: 'pr_gs1', resultId: 're_pr_gs1_11', code: 'OUT-01', name: 'Personnes recevant une assistance alimentaire générale', unit: 'personnes', level: 'output', target: 120000, perf: 0.92, category: 'Sécurité alimentaire' })
  mkInd({ id: 'in_gs1_2', projectId: 'pr_gs1', resultId: 're_pr_gs1_12', code: 'OUT-02', name: 'Valeur des transferts monétaires distribués', unit: 'USD', level: 'output', target: 2400000, perf: 0.86, category: 'Transferts monétaires', source: 'Plateforme de paiement' })
  mkInd({ id: 'in_gs1_3', projectId: 'pr_gs1', resultId: 're_pr_gs1_11', code: 'OC-01', name: 'Score de consommation alimentaire acceptable (ménages)', unit: '%', level: 'outcome', baseline: 42, target: 70, perf: 0.83, category: 'Sécurité alimentaire', source: 'Enquête ménage (PDM)' })
  mkInd({ id: 'in_gs1_4', projectId: 'pr_gs1', resultId: 're_pr_gs1_21', code: 'PR-01', name: 'Sites ayant réalisé un ciblage communautaire vérifié', unit: 'sites', level: 'process', target: 48, perf: 0.79, category: 'Ciblage' })

  mkInd({ id: 'in_gs2_1', projectId: 'pr_gs2', resultId: 're_pr_gs2_11', code: 'OUT-10', name: "Hectares d'actifs créés/réhabilités (FFA)", unit: 'ha', level: 'output', target: 850, perf: 0.74, category: 'Résilience' })
  mkInd({ id: 'in_gs2_2', projectId: 'pr_gs2', resultId: 're_pr_gs2_12', code: 'OUT-11', name: 'Ménages recevant des kits agricoles', unit: 'ménages', level: 'output', target: 6500, perf: 0.9, category: 'Moyens de subsistance' })
  mkInd({ id: 'in_gs2_3', projectId: 'pr_gs2', resultId: 're_pr_gs2_21', code: 'OC-10', name: 'Ménages déclarant des sources de revenus diversifiées', unit: '%', level: 'outcome', baseline: 18, target: 45, perf: 0.7, category: 'Résilience', source: 'Enquête résilience' })

  mkInd({ id: 'in_nut_1', projectId: 'pr_nut1', resultId: 're_pr_nut1_11', code: 'OUT-20', name: 'Enfants 6-59 mois admis à la BSFP', unit: 'enfants', level: 'output', target: 32000, perf: 0.88, category: 'Nutrition' })
  mkInd({ id: 'in_nut_2', projectId: 'pr_nut1', resultId: 're_pr_nut1_12', code: 'PR-20', name: 'Enfants dépistés (MUAC) au niveau communautaire', unit: 'enfants', level: 'process', target: 58000, perf: 0.94, category: 'Nutrition' })
  mkInd({ id: 'in_nut_3', projectId: 'pr_nut1', resultId: 're_pr_nut1_21', code: 'OC-20', name: 'Couverture du programme de supplémentation', unit: '%', level: 'outcome', baseline: 55, target: 90, perf: 0.86, category: 'Nutrition', source: 'Enquête SQUEAC' })

  mkInd({ id: 'in_shock_1', projectId: 'pr_shock', resultId: 're_pr_shock_11', code: 'OUT-30', name: 'Personnes sinistrées recevant des rations sèches', unit: 'personnes', level: 'output', target: 45000, perf: 0.96, category: 'Réponse aux chocs' })
  mkInd({ id: 'in_shock_2', projectId: 'pr_shock', resultId: 're_pr_shock_12', code: 'OUT-31', name: "Ménages recevant un transfert d'urgence", unit: 'ménages', level: 'output', target: 9000, perf: 0.82, category: 'Transferts monétaires' })

  mkInd({ id: 'in_can_1', projectId: 'pr_can1', resultId: 're_pr_can1_11', code: 'OUT-40', name: 'Écoliers recevant un repas scolaire quotidien', unit: 'écoliers', level: 'output', target: 28000, perf: 0, category: 'Cantines scolaires' })

  // ---- Sites --------------------------------------------------------------
  const sites = []
  const siteDefs = [
    { id: 'st_amb', name: 'Ambovombe Centre', region: 'MG33', projectIds: ['pr_gs1'], officeId: 'of_grandsud', security: 'orange', status: 'actif', population: 24500 },
    { id: 'st_bel', name: 'Beloha', region: 'MG33', projectIds: ['pr_gs1'], officeId: 'of_grandsud', security: 'rouge', status: 'actif', population: 12800 },
    { id: 'st_tsi', name: 'Tsihombe', region: 'MG33', projectIds: ['pr_gs1', 'pr_gs2'], officeId: 'of_grandsud', security: 'orange', status: 'actif', population: 15200 },
    { id: 'st_amboa', name: 'Amboasary Atsimo', region: 'MG34', projectIds: ['pr_gs1', 'pr_gs2'], officeId: 'of_sud', security: 'vert', status: 'actif', population: 31000 },
    { id: 'st_taol', name: 'Taolagnaro', region: 'MG34', projectIds: ['pr_gs2'], officeId: 'of_sud', security: 'vert', status: 'actif', population: 46000 },
    { id: 'st_beto', name: 'Betioky Atsimo', region: 'MG32', projectIds: ['pr_nut1'], officeId: 'of_sud', security: 'vert', status: 'actif', population: 19800 },
    { id: 'st_ampa', name: 'Ampanihy', region: 'MG32', projectIds: ['pr_nut1'], officeId: 'of_sud', security: 'orange', status: 'actif', population: 22300 },
    { id: 'st_toli', name: 'Toliara II', region: 'MG32', projectIds: ['pr_nut1'], officeId: 'of_sud', security: 'vert', status: 'actif', population: 38500 },
    { id: 'st_maro', name: 'Maroantsetra', region: 'MG52', projectIds: ['pr_shock'], officeId: 'of_est', security: 'orange', status: 'actif', population: 27600 },
    { id: 'st_toam', name: 'Toamasina II', region: 'MG53', projectIds: ['pr_shock'], officeId: 'of_est', security: 'vert', status: 'actif', population: 52000 },
    { id: 'st_mana', name: 'Manakara', region: 'MG24', projectIds: ['pr_can1'], officeId: 'of_est', security: 'vert', status: 'clos', population: 41200 },
  ]
  siteDefs.forEach((s) => {
    const reg = REGIONS.find((r) => r.pcode === s.region)
    sites.push({
      ...s, pcode: s.region, district: reg?.name, commune: s.name,
      lat: jitter(reg?.lat || -20, 1.1), lng: jitter(reg?.lng || 46, 1.1),
      coverageStatus: s.status === 'clos' ? 'clos' : 'couvert',
    })
  })

  // ---- Activités (Kanban) -------------------------------------------------
  const statuses = ['done', 'doing', 'doing', 'todo', 'blocked', 'done', 'todo', 'doing']
  const activities = []
  function mkAct(a) { activities.push({ progress: 0, spent: 0, siteIds: [], priority: 'moyenne', ...a }) }
  mkAct({ id: 'ac_1', projectId: 'pr_gs1', resultId: 're_pr_gs1_11', code: 'A1.1', name: 'Distribution alimentaire générale — cycle T3', responsibleId: 'u_naina', startDate: iso(2025, 7, 1), endDate: iso(2025, 8, 15), status: 'done', priority: 'haute', progress: 100, budget: 480000, spent: 465000, siteIds: ['st_amb', 'st_bel', 'st_tsi'] })
  mkAct({ id: 'ac_2', projectId: 'pr_gs1', resultId: 're_pr_gs1_12', code: 'A1.2', name: 'Transferts monétaires — vague septembre', responsibleId: 'u_fara', startDate: iso(2025, 9, 1), endDate: iso(2025, 9, 30), status: 'doing', priority: 'haute', progress: 55, budget: 620000, spent: 340000, siteIds: ['st_amboa', 'st_amb'] })
  mkAct({ id: 'ac_3', projectId: 'pr_gs1', resultId: 're_pr_gs1_21', code: 'A2.1', name: 'Ciblage communautaire — nouvelles communes', responsibleId: 'u_fara', startDate: iso(2025, 8, 10), endDate: iso(2025, 9, 20), status: 'doing', priority: 'moyenne', progress: 40, budget: 55000, spent: 22000, siteIds: ['st_bel'] })
  mkAct({ id: 'ac_4', projectId: 'pr_gs1', resultId: 're_pr_gs1_22', code: 'A2.2', name: 'Mise en place du mécanisme de plaintes (CFM)', responsibleId: 'u_hery', startDate: iso(2025, 10, 1), endDate: iso(2025, 11, 15), status: 'todo', priority: 'basse', budget: 18000 })
  mkAct({ id: 'ac_5', projectId: 'pr_gs2', resultId: 're_pr_gs2_11', code: 'A1.1', name: 'Chantiers FFA — réhabilitation de bassins', responsibleId: 'u_naina', startDate: iso(2025, 6, 1), endDate: iso(2025, 10, 30), status: 'doing', priority: 'haute', progress: 62, budget: 240000, spent: 150000, siteIds: ['st_taol', 'st_amboa'] })
  mkAct({ id: 'ac_6', projectId: 'pr_gs2', resultId: 're_pr_gs2_12', code: 'A1.2', name: 'Distribution de kits maraîchers', responsibleId: 'u_naina', startDate: iso(2025, 9, 5), endDate: iso(2025, 9, 25), status: 'blocked', priority: 'haute', progress: 20, budget: 95000, spent: 12000, siteIds: ['st_taol'] })
  mkAct({ id: 'ac_7', projectId: 'pr_gs2', resultId: 're_pr_gs2_21', code: 'A2.1', name: 'Formation des comités villageois', responsibleId: 'u_hery', startDate: iso(2025, 7, 15), endDate: iso(2025, 8, 30), status: 'done', priority: 'moyenne', progress: 100, budget: 30000, spent: 28500 })
  mkAct({ id: 'ac_8', projectId: 'pr_nut1', resultId: 're_pr_nut1_11', code: 'A1.1', name: 'Campagne BSFP — round 3', responsibleId: 'u_tiana', startDate: iso(2025, 8, 1), endDate: iso(2025, 9, 30), status: 'doing', priority: 'haute', progress: 70, budget: 210000, spent: 150000, siteIds: ['st_beto', 'st_ampa', 'st_toli'] })
  mkAct({ id: 'ac_9', projectId: 'pr_nut1', resultId: 're_pr_nut1_12', code: 'A1.2', name: 'Dépistage MUAC communautaire', responsibleId: 'u_fara', startDate: iso(2025, 7, 1), endDate: iso(2025, 12, 15), status: 'doing', priority: 'moyenne', progress: 58, budget: 46000, spent: 26000, siteIds: ['st_beto'] })
  mkAct({ id: 'ac_10', projectId: 'pr_nut1', resultId: 're_pr_nut1_21', code: 'A2.1', name: 'Sessions de sensibilisation ANJE', responsibleId: 'u_tiana', startDate: iso(2025, 10, 1), endDate: iso(2025, 11, 30), status: 'todo', priority: 'basse', budget: 22000 })
  mkAct({ id: 'ac_11', projectId: 'pr_shock', resultId: 're_pr_shock_11', code: 'A1.1', name: "Distribution de rations sèches d'urgence", responsibleId: 'u_miora', startDate: iso(2025, 3, 1), endDate: iso(2025, 4, 30), status: 'done', priority: 'haute', progress: 100, budget: 320000, spent: 318000, siteIds: ['st_maro', 'st_toam'] })
  mkAct({ id: 'ac_12', projectId: 'pr_shock', resultId: 're_pr_shock_12', code: 'A1.2', name: "Transferts d'urgence — ménages sinistrés", responsibleId: 'u_miora', startDate: iso(2025, 4, 15), endDate: iso(2025, 6, 15), status: 'done', priority: 'haute', progress: 100, budget: 260000, spent: 240000, siteIds: ['st_maro'] })
  mkAct({ id: 'ac_13', projectId: 'pr_can1', resultId: 're_pr_can1_11', code: 'A1.1', name: 'Pré-positionnement des vivres — rentrée', responsibleId: 'u_miora', startDate: iso(2025, 8, 15), endDate: iso(2025, 9, 10), status: 'todo', priority: 'moyenne', budget: 140000 })

  // ---- Budget (lignes prévu / engagé / dépensé) ---------------------------
  const budgetLines = []
  function mkBud(l) { budgetLines.push(l) }
  mkBud({ id: 'bl_1', projectId: 'pr_gs1', category: 'Vivres & transport', donorId: 'p_usaid', planned: 3800000, committed: 3200000, spent: 2650000 })
  mkBud({ id: 'bl_2', projectId: 'pr_gs1', category: 'Transferts monétaires', donorId: 'p_usaid', planned: 2400000, committed: 2100000, spent: 1980000 })
  mkBud({ id: 'bl_3', projectId: 'pr_gs1', category: 'Suivi & évaluation', donorId: 'p_usaid', planned: 350000, committed: 300000, spent: 210000 })
  mkBud({ id: 'bl_4', projectId: 'pr_gs1', category: 'Fonctionnement', donorId: 'p_usaid', planned: 650000, committed: 500000, spent: 430000 })
  mkBud({ id: 'bl_5', projectId: 'pr_gs2', category: 'Actifs FFA', donorId: 'p_usaid', planned: 1600000, committed: 1200000, spent: 880000 })
  mkBud({ id: 'bl_6', projectId: 'pr_gs2', category: 'Intrants agricoles', donorId: 'p_usaid', planned: 1400000, committed: 1100000, spent: 920000 })
  mkBud({ id: 'bl_7', projectId: 'pr_gs2', category: 'Renforcement de capacités', donorId: 'p_usaid', planned: 500000, committed: 380000, spent: 300000 })
  mkBud({ id: 'bl_8', projectId: 'pr_gs2', category: 'Fonctionnement', donorId: 'p_usaid', planned: 800000, committed: 600000, spent: 470000 })
  mkBud({ id: 'bl_9', projectId: 'pr_nut1', category: 'Produits nutritionnels', donorId: 'p_ue', planned: 1500000, committed: 1300000, spent: 1120000 })
  mkBud({ id: 'bl_10', projectId: 'pr_nut1', category: 'Dépistage & mobilisation', donorId: 'p_ue', planned: 600000, committed: 500000, spent: 410000 })
  mkBud({ id: 'bl_11', projectId: 'pr_nut1', category: 'Suivi & évaluation', donorId: 'p_ue', planned: 300000, committed: 220000, spent: 160000 })
  mkBud({ id: 'bl_12', projectId: 'pr_nut1', category: 'Fonctionnement', donorId: 'p_ue', planned: 700000, committed: 520000, spent: 440000 })
  mkBud({ id: 'bl_13', projectId: 'pr_shock', category: 'Vivres & transport', donorId: 'p_ocha', planned: 900000, committed: 900000, spent: 880000 })
  mkBud({ id: 'bl_14', projectId: 'pr_shock', category: 'Transferts monétaires', donorId: 'p_ocha', planned: 600000, committed: 560000, spent: 540000 })
  mkBud({ id: 'bl_15', projectId: 'pr_shock', category: 'Logistique', donorId: 'p_ocha', planned: 300000, committed: 250000, spent: 230000 })
  mkBud({ id: 'bl_16', projectId: 'pr_can1', category: 'Vivres scolaires', donorId: 'p_ue', planned: 1700000, committed: 400000, spent: 0 })
  mkBud({ id: 'bl_17', projectId: 'pr_can1', category: 'Appui aux cantines', donorId: 'p_ue', planned: 500000, committed: 120000, spent: 0 })

  // ---- Bénéficiaires (ciblage vs atteint) ---------------------------------
  const beneficiaries = []
  function mkBen(b) {
    const { plannedM, plannedF, reachedM, reachedF } = b
    beneficiaries.push({
      ...b, plannedTotal: plannedM + plannedF, reachedTotal: reachedM + reachedF,
    })
  }
  mkBen({ id: 'be_1', projectId: 'pr_gs1', siteId: 'st_amb', category: 'Ménages vulnérables', plannedM: 11200, plannedF: 13300, reachedM: 10400, reachedF: 12600 })
  mkBen({ id: 'be_2', projectId: 'pr_gs1', siteId: 'st_bel', category: 'Ménages vulnérables', plannedM: 5900, plannedF: 6900, reachedM: 5100, reachedF: 6000 })
  mkBen({ id: 'be_3', projectId: 'pr_gs1', siteId: 'st_amboa', category: 'Ménages vulnérables', plannedM: 14200, plannedF: 16800, reachedM: 13600, reachedF: 16200 })
  mkBen({ id: 'be_4', projectId: 'pr_gs2', siteId: 'st_taol', category: 'Participants FFA', plannedM: 8200, plannedF: 7800, reachedM: 6900, reachedF: 6600 })
  mkBen({ id: 'be_5', projectId: 'pr_nut1', siteId: 'st_beto', category: 'Enfants 6-59 mois', plannedM: 4800, plannedF: 4600, reachedM: 4300, reachedF: 4200 })
  mkBen({ id: 'be_6', projectId: 'pr_nut1', siteId: 'st_ampa', category: 'Enfants 6-59 mois', plannedM: 5200, plannedF: 5000, reachedM: 4500, reachedF: 4400 })
  mkBen({ id: 'be_7', projectId: 'pr_nut1', siteId: 'st_toli', category: 'FEFA', plannedM: 0, plannedF: 6200, reachedM: 0, reachedF: 5400 })
  mkBen({ id: 'be_8', projectId: 'pr_shock', siteId: 'st_maro', category: 'Sinistrés cyclone', plannedM: 10800, plannedF: 12200, reachedM: 10600, reachedF: 12000 })
  mkBen({ id: 'be_9', projectId: 'pr_shock', siteId: 'st_toam', category: 'Sinistrés cyclone', plannedM: 9200, plannedF: 10600, reachedM: 8900, reachedF: 10300 })

  // ---- Visites de suivi ---------------------------------------------------
  const visits = []
  function mkVis(v) { visits.push(v) }
  mkVis({ id: 'vi_1', siteId: 'st_amb', projectId: 'pr_gs1', date: iso(2025, 8, 12), monitorId: 'u_fara', type: 'routine', status: 'realise', score: 82, findings: 'Distribution conforme, files d’attente longues en matinée.', recommendations: 'Renforcer le personnel de gestion de foule.', mmr: true })
  mkVis({ id: 'vi_2', siteId: 'st_bel', projectId: 'pr_gs1', date: iso(2025, 8, 20), monitorId: 'u_fara', type: 'tpm', status: 'realise', score: 61, findings: 'Retards de livraison, listes de bénéficiaires incomplètes.', recommendations: 'Mettre à jour le ciblage, sécuriser le transport.', mmr: true })
  mkVis({ id: 'vi_3', siteId: 'st_tsi', projectId: 'pr_gs1', date: iso(2025, 9, 5), monitorId: 'u_naina', type: 'routine', status: 'realise', score: 74, findings: 'Bonne organisation, mécanisme de plaintes à installer.', recommendations: 'Installer les boîtes à plaintes.', mmr: true })
  mkVis({ id: 'vi_4', siteId: 'st_amboa', projectId: 'pr_gs2', date: iso(2025, 8, 28), monitorId: 'u_naina', type: 'routine', status: 'realise', score: 88, findings: 'Chantiers FFA bien avancés, forte participation.', recommendations: 'Documenter les actifs créés.', mmr: true })
  mkVis({ id: 'vi_5', siteId: 'st_taol', projectId: 'pr_gs2', date: iso(2025, 9, 10), monitorId: 'u_naina', type: 'conjointe', status: 'realise', score: 79, findings: 'Kits maraîchers en attente (blocage logistique).', recommendations: 'Débloquer la chaîne d’approvisionnement.', mmr: false })
  mkVis({ id: 'vi_6', siteId: 'st_beto', projectId: 'pr_nut1', date: iso(2025, 8, 18), monitorId: 'u_fara', type: 'routine', status: 'realise', score: 85, findings: 'BSFP conforme, stocks suffisants.', recommendations: 'RAS.', mmr: true })
  mkVis({ id: 'vi_7', siteId: 'st_ampa', projectId: 'pr_nut1', date: iso(2025, 9, 2), monitorId: 'u_fara', type: 'tpm', status: 'realise', score: 68, findings: 'Ruptures ponctuelles de produits, dépistage irrégulier.', recommendations: 'Revoir le calendrier d’approvisionnement.', mmr: true })
  mkVis({ id: 'vi_8', siteId: 'st_maro', projectId: 'pr_shock', date: iso(2025, 4, 22), monitorId: 'u_miora', type: 'ponctuelle', status: 'realise', score: 90, findings: 'Réponse rapide, bonne couverture des sinistrés.', recommendations: 'RAS.', mmr: true })
  mkVis({ id: 'vi_9', siteId: 'st_amb', projectId: 'pr_gs1', date: iso(2025, 10, 10), monitorId: 'u_fara', type: 'routine', status: 'planifie', score: null, findings: '', recommendations: '', mmr: true })
  mkVis({ id: 'vi_10', siteId: 'st_toli', projectId: 'pr_nut1', date: iso(2025, 10, 5), monitorId: 'u_fara', type: 'routine', status: 'planifie', score: null, findings: '', recommendations: '', mmr: true })
  mkVis({ id: 'vi_11', siteId: 'st_toam', projectId: 'pr_shock', date: iso(2025, 5, 14), monitorId: 'u_miora', type: 'routine', status: 'realise', score: 47, findings: 'Ciblage contesté, plusieurs plaintes non traitées.', recommendations: 'Action urgente : audit du ciblage.', mmr: true })

  // ---- TPM : contrats, missions, dépenses ---------------------------------
  const tpmContracts = [
    { id: 'tc_1', providerId: 'p_ravaka', code: 'TPM-2025-01', title: 'Suivi tiers — Grand Sud (Androy/Anosy)', ceiling: 240000, currency: 'USD', startDate: iso(2025, 1, 1), endDate: iso(2025, 12, 31), status: 'valide_pays', ratePerSite: 850, zones: ['MG33', 'MG34'] },
    { id: 'tc_2', providerId: 'p_mahefa', code: 'TPM-2025-02', title: 'Suivi tiers — Nutrition Atsimo-Andrefana', ceiling: 120000, currency: 'USD', startDate: iso(2025, 4, 1), endDate: iso(2026, 3, 31), status: 'valide_bureau', ratePerSite: 720, zones: ['MG32'] },
  ]
  const tpmMissions = [
    { id: 'tm_1', contractId: 'tc_1', period: '2025-T2', sitesCount: 18, agents: 6, budget: 15300, status: 'valide_pays', mode: 'par_commune' },
    { id: 'tm_2', contractId: 'tc_1', period: '2025-T3', sitesCount: 22, agents: 6, budget: 18700, status: 'valide_bureau', mode: 'par_commune' },
    { id: 'tm_3', contractId: 'tc_2', period: '2025-T3', sitesCount: 12, agents: 4, budget: 8640, status: 'soumis', mode: 'equipe_unique' },
  ]
  const tpmExpenses = [
    { id: 'te_1', contractId: 'tc_1', missionId: 'tm_1', date: iso(2025, 6, 30), label: 'Honoraires agents T2', amount: 9200, status: 'valide' },
    { id: 'te_2', contractId: 'tc_1', missionId: 'tm_1', date: iso(2025, 6, 30), label: 'Frais de déplacement T2', amount: 4100, status: 'valide' },
    { id: 'te_3', contractId: 'tc_1', missionId: 'tm_2', date: iso(2025, 9, 30), label: 'Honoraires agents T3', amount: 11200, status: 'soumis' },
  ]

  // ---- Imports (barrière de validation) -----------------------------------
  const imports = [
    { id: 'im_1', filename: 'PDM_Androy_T3_2025.xlsx', source: 'Extraction fichier', projectId: 'pr_gs1', status: 'valide', rowsNew: 412, rowsUpdated: 38, rowsUnchanged: 120, date: iso(2025, 9, 12), uploaderId: 'u_hery', mappingOk: true },
    { id: 'im_2', filename: 'Depistage_MUAC_Betioky.csv', source: 'ODK Central', projectId: 'pr_nut1', status: 'en_attente', rowsNew: 1240, rowsUpdated: 12, rowsUnchanged: 5, date: iso(2025, 9, 28), uploaderId: 'u_fara', mappingOk: true },
    { id: 'im_3', filename: 'FFA_participants_Anosy.xlsx', source: 'Extraction fichier', projectId: 'pr_gs2', status: 'apercu', rowsNew: 88, rowsUpdated: 0, rowsUnchanged: 0, date: iso(2025, 9, 30), uploaderId: 'u_naina', mappingOk: false },
  ]

  // ---- Journal d'activité -------------------------------------------------
  const now = Date.now()
  const audit = [
    { id: 'au_1', date: new Date(now - 3600e3 * 2).toISOString(), userId: 'u_fara', action: 'valide', entity: 'visite', summary: 'Visite validée à Ambovombe Centre (score 82)' },
    { id: 'au_2', date: new Date(now - 3600e3 * 5).toISOString(), userId: 'u_naina', action: 'cree', entity: 'activité', summary: 'Nouvelle activité : Chantiers FFA — bassins' },
    { id: 'au_3', date: new Date(now - 3600e3 * 26).toISOString(), userId: 'u_hery', action: 'importe', entity: 'données', summary: 'Import validé : PDM_Androy_T3_2025 (450 lignes)' },
    { id: 'au_4', date: new Date(now - 3600e3 * 30).toISOString(), userId: 'u_tiana', action: 'modifie', entity: 'indicateur', summary: 'Mise à jour du réalisé T3 — BSFP' },
    { id: 'au_5', date: new Date(now - 3600e3 * 52).toISOString(), userId: 'u_miora', action: 'alerte', entity: 'visite', summary: 'Action urgente signalée à Toamasina II (score 47)' },
  ]

  // ---- Plan MRE (activités de suivi-évaluation & budget) ------------------
  const mreActivities = [
    { id: 'mre_1', projectId: 'pr_gs1', name: 'Enquête post-distribution (PDM) — T3', type: 'enquete', period: '2025-T3', responsibleId: 'u_hery', costPlanned: 18000, costActual: 16500, status: 'realise' },
    { id: 'mre_2', projectId: 'pr_gs1', name: 'Suivi de routine mensuel des sites', type: 'suivi', period: '2025', responsibleId: 'u_fara', costPlanned: 24000, costActual: 15000, status: 'en_cours' },
    { id: 'mre_3', projectId: 'pr_gs2', name: 'Évaluation à mi-parcours', type: 'evaluation', period: '2025-T4', responsibleId: 'u_hery', costPlanned: 35000, costActual: 0, status: 'planifie' },
    { id: 'mre_4', projectId: 'pr_nut1', name: 'Enquête SQUEAC (couverture)', type: 'enquete', period: '2025-T3', responsibleId: 'u_hery', costPlanned: 22000, costActual: 20000, status: 'realise' },
    { id: 'mre_5', projectId: 'pr_nut1', name: 'TPM nutrition — vérification tierce', type: 'tpm', period: '2025-T3', responsibleId: 'u_miora', costPlanned: 12000, costActual: 8600, status: 'en_cours' },
    { id: 'mre_6', projectId: 'pr_shock', name: 'Mécanisme de plaintes & redevabilité (CFM)', type: 'redevabilite', period: '2025', responsibleId: 'u_hery', costPlanned: 9000, costActual: 5000, status: 'en_cours' },
    { id: 'mre_7', projectId: 'pr_gs1', name: 'Atelier de capitalisation annuel', type: 'capitalisation', period: '2025-T4', responsibleId: 'u_tiana', costPlanned: 14000, costActual: 0, status: 'planifie' },
  ]

  return {
    organization: { ...ORG_DEFAULT },
    users, offices, partners, programmes, projects,
    objectives, results, indicators, activities, sites,
    budgetLines, beneficiaries, visits,
    tpmContracts, tpmMissions, tpmExpenses, imports, audit,
    mreActivities,
    currentUserId: 'u_armi',
    seededAt: new Date().toISOString(),
  }
}
