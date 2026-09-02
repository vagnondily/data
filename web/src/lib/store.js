// ============================================================================
// Store applicatif (Zustand) — persistance navigateur (localStorage)
// Une seule source de vérité pour toutes les entités métier.
// ============================================================================
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { buildSeed } from './seed.js'
import { uid } from './id.js'

const DATA_KEYS = [
  'organization', 'users', 'offices', 'partners', 'programmes', 'projects',
  'objectives', 'results', 'indicators', 'activities', 'sites',
  'budgetLines', 'beneficiaries', 'visits',
  'tpmContracts', 'tpmMissions', 'tpmExpenses', 'imports', 'audit',
  'mreActivities',
  'currentUserId', 'seededAt',
]

export const useStore = create(
  persist(
    (set, get) => ({
      ...buildSeed(),

      // -------- CRUD générique sur une collection --------------------------
      add(coll, item) {
        const rec = { ...item, id: item.id || uid(coll.slice(0, 2)) }
        set((s) => ({ [coll]: [rec, ...s[coll]] }))
        return rec
      },
      update(coll, id, patch) {
        set((s) => ({ [coll]: s[coll].map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
      },
      remove(coll, id) {
        set((s) => ({ [coll]: s[coll].filter((x) => x.id !== id) }))
      },

      // Suppression d'un projet + cascade sur les entités rattachées
      deleteProject(id) {
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          objectives: s.objectives.filter((o) => o.projectId !== id),
          results: s.results.filter((r) => r.projectId !== id),
          indicators: s.indicators.filter((i) => i.projectId !== id),
          activities: s.activities.filter((a) => a.projectId !== id),
          budgetLines: s.budgetLines.filter((b) => b.projectId !== id),
          beneficiaries: s.beneficiaries.filter((b) => b.projectId !== id),
          visits: s.visits.filter((v) => v.projectId !== id),
          sites: s.sites.map((st) => ({ ...st, projectIds: (st.projectIds || []).filter((pid) => pid !== id) })),
        }))
      },

      // -------- Journal d'audit --------------------------------------------
      log(action, entity, summary) {
        set((s) => ({
          audit: [
            { id: uid('au'), date: new Date().toISOString(), userId: s.currentUserId, action, entity, summary },
            ...s.audit,
          ].slice(0, 250),
        }))
      },

      // -------- Valeurs d'indicateur (upsert par période) ------------------
      setIndicatorValue(indId, period, patch) {
        set((s) => ({
          indicators: s.indicators.map((ind) => {
            if (ind.id !== indId) return ind
            const values = [...(ind.values || [])]
            const i = values.findIndex((v) => v.period === period)
            if (i >= 0) values[i] = { ...values[i], ...patch }
            else values.push({ period, planned: 0, actual: null, ...patch })
            return { ...ind, values }
          }),
        }))
      },

      // -------- Réglages ----------------------------------------------------
      setOrg(patch) { set((s) => ({ organization: { ...s.organization, ...patch } })) },
      setCurrentUser(id) { set({ currentUserId: id }) },

      // -------- Sauvegarde / restauration / démo ---------------------------
      exportState() {
        const s = get()
        return JSON.stringify(Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])), null, 2)
      },
      importState(json) {
        try {
          const data = typeof json === 'string' ? JSON.parse(json) : json
          const patch = {}
          DATA_KEYS.forEach((k) => { if (k in data) patch[k] = data[k] })
          set(patch)
          return { ok: true }
        } catch (e) {
          return { ok: false, error: String(e) }
        }
      },
      resetDemo() { set(buildSeed()) },
      wipe() {
        const empty = {}
        DATA_KEYS.forEach((k) => {
          if (k === 'organization') empty[k] = get().organization
          else if (k === 'currentUserId') empty[k] = get().currentUserId
          else if (k === 'seededAt') empty[k] = new Date().toISOString()
          else empty[k] = []
        })
        set(empty)
      },
    }),
    {
      name: 'mems-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])),
    },
  ),
)

// -------- Sélecteurs / lookups (non réactifs, pour usage ponctuel) ---------
export const byId = (list, id) => list.find((x) => x.id === id)
export const nameOf = (list, id, field = 'name') => byId(list, id)?.[field] || '—'
