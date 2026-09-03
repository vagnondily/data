// ============================================================================
// Store applicatif (Zustand) — persistance navigateur (localStorage)
// Une seule source de vérité pour toutes les entités métier.
// ============================================================================
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { buildSeed } from './seed.js'
import { uid } from './id.js'
import { notifyAction, notifyUndo } from './toast.js'

const DATA_KEYS = [
  'organization', 'users', 'offices', 'partners', 'programmes', 'projects',
  'objectives', 'results', 'indicators', 'activities', 'sites',
  'budgetLines', 'beneficiaries', 'visits',
  'tpmContracts', 'tpmMissions', 'tpmExpenses', 'imports', 'audit',
  'mreActivities', 'planDocs', 'commodities', 'rations',
  'currentUserId', 'seededAt',
]

export const useStore = create(
  persist(
    (set, get) => ({
      ...buildSeed(),

      // -------- Annulation (undo) ------------------------------------------
      // Tampon en mémoire (non persisté) : les closures de restauration créées
      // par les suppressions depuis le dernier journal. log('supprime', …) les
      // regroupe et les attache au toast « Annuler ».
      _undo: [],
      _pushUndo(fn) { set((s) => ({ _undo: [...s._undo, fn] })) },
      takeUndo() {
        const fns = get()._undo
        if (!fns.length) { return null }
        set({ _undo: [] })
        return () => fns.slice().reverse().forEach((fn) => fn())
      },
      // Réinsère un enregistrement supprimé à sa position d'origine (sûr vis-à-vis
      // des modifications concurrentes des autres lignes).
      _capRemove(coll, id) {
        const list = get()[coll] || []
        const idx = list.findIndex((x) => x.id === id)
        if (idx < 0) return () => {}
        const item = list[idx]
        return () => set((s) => {
          if ((s[coll] || []).some((x) => x.id === id)) return {}
          const arr = [...(s[coll] || [])]
          arr.splice(Math.min(idx, arr.length), 0, item)
          return { [coll]: arr }
        })
      },

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
        get()._pushUndo(get()._capRemove(coll, id))
        set((s) => ({ [coll]: s[coll].filter((x) => x.id !== id) }))
      },

      // Suppression d'un projet + cascade sur les entités rattachées
      deleteProject(id) {
        const s0 = get()
        // Capture des entités supprimées et des sites impactés pour l'annulation.
        const CHILD = ['objectives', 'results', 'indicators', 'activities', 'budgetLines', 'beneficiaries', 'visits']
        const removed = { projects: s0.projects.filter((p) => p.id === id) }
        CHILD.forEach((k) => { removed[k] = s0[k].filter((x) => x.projectId === id) })
        const siteIds = s0.sites.filter((st) => (st.projectIds || []).includes(id)).map((st) => st.id)
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
        get()._pushUndo(() => set((cur) => {
          if (cur.projects.some((p) => p.id === id)) return {}
          const out = {}
          out.projects = [...removed.projects, ...cur.projects]
          CHILD.forEach((k) => { out[k] = [...removed[k], ...cur[k]] })
          out.sites = cur.sites.map((st) => (siteIds.includes(st.id) && !(st.projectIds || []).includes(id)
            ? { ...st, projectIds: [...(st.projectIds || []), id] } : st))
          return out
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
        const undo = get().takeUndo()
        try {
          if (action === 'supprime' && undo) notifyUndo(summary, undo)
          else notifyAction(action, summary)
        } catch { /* toaster indispo */ }
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
