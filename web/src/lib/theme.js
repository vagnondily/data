// Thème clair / sombre — magasin persistant ; l'attribut data-theme est posé
// sur <html> (par le script anti-flash de index.html et un effet dans Layout).
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const useTheme = create(persist((set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
}), { name: 'mems-theme', storage: createJSONStorage(() => localStorage) }))
