// Notifications éphémères (toasts) — feedback des actions utilisateur
import { create } from 'zustand'
import { uid } from './id.js'

const timers = {}

export const useToasts = create((set, get) => ({
  items: [],
  push(t) {
    const id = uid('t')
    const item = { id, kind: 'brand', ttl: 3600, ...t }
    set((s) => ({ items: [...s.items.slice(-3), item] }))
    if (item.ttl) timers[id] = setTimeout(() => get().dismiss(id), item.ttl)
    return id
  },
  dismiss(id) {
    if (timers[id]) { clearTimeout(timers[id]); delete timers[id] }
    set((s) => ({ items: s.items.filter((x) => x.id !== id) }))
  },
}))

// Ton dérivé de l'action journalisée
const TONE = { supprime: 'warn', rejette: 'bad', alerte: 'bad', valide: 'ok', importe: 'ok', cree: 'ok', modifie: 'brand' }

export function notify(message, opts = {}) {
  return useToasts.getState().push({ message, ...opts })
}
export function notifyAction(action, message) {
  return useToasts.getState().push({ message, kind: TONE[action] || 'brand' })
}
// Toast de suppression avec bouton « Annuler » — TTL allongé pour laisser le
// temps de cliquer ; `undo` est la closure de restauration.
export function notifyUndo(message, undo) {
  return useToasts.getState().push({ message, kind: 'warn', ttl: 7000, undo })
}
