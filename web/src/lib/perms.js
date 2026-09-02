// Droits dérivés du rôle de l'utilisateur courant (arbitrage simplifié côté client)
import { useStore } from './store.js'
import { ROLES } from './constants.js'

export function useMe() {
  return useStore((s) => s.users.find((u) => u.id === s.currentUserId) || s.users[0])
}

export function useCan() {
  const me = useMe()
  const can = ROLES[me?.role]?.can || []
  return {
    me,
    role: me?.role,
    roleLabel: ROLES[me?.role]?.label,
    canView: can.includes('view'),
    canEdit: can.includes('edit'),
    canValidate: can.includes('validate'),
    canAdmin: can.includes('admin'),
    canSuper: can.includes('super'),
  }
}
