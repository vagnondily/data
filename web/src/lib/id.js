// Génération d'identifiants courts et stables
let counter = 0
export function uid(prefix = 'id') {
  counter += 1
  const rnd = Math.random().toString(36).slice(2, 7)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`
}
