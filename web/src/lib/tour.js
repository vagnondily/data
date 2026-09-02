// Visite guidée — état transitoire (non persisté). Le drapeau « déjà vue »
// est géré séparément dans localStorage (clé mems-tour-seen).
import { create } from 'zustand'

export const useTour = create((set) => ({
  open: false,
  start: () => set({ open: true }),
  stop: () => set({ open: false }),
}))

export const TOUR_SEEN_KEY = 'mems-tour-seen'
