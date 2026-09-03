// ============================================================================
// Référentiel géographique — helpers de cascade région → district → commune
// Les données brutes (adm2/adm3 PAM 2025) vivent dans geo_data.js.
// ============================================================================
import { REGIONS } from './constants.js'
import { GEO_DISTRICTS, GEO_COMMUNES } from './geo_data.js'

export { GEO_DISTRICTS, GEO_COMMUNES }

// Index par pcode (construits une seule fois)
const DISTRICT_BY = new Map(GEO_DISTRICTS.map((d) => [d.pcode, d]))
const COMMUNE_BY = new Map(GEO_COMMUNES.map((c) => [c.pcode, c]))
const REGION_BY = new Map(REGIONS.map((r) => [r.pcode, r]))

// Regroupements pré-calculés
const DISTRICTS_OF_REGION = new Map()
for (const d of GEO_DISTRICTS) {
  if (!DISTRICTS_OF_REGION.has(d.region)) DISTRICTS_OF_REGION.set(d.region, [])
  DISTRICTS_OF_REGION.get(d.region).push(d)
}
const COMMUNES_OF_DISTRICT = new Map()
for (const c of GEO_COMMUNES) {
  if (!COMMUNES_OF_DISTRICT.has(c.district)) COMMUNES_OF_DISTRICT.set(c.district, [])
  COMMUNES_OF_DISTRICT.get(c.district).push(c)
}

const EMPTY = []

/** Districts d'une région (triés par nom). */
export function districtsOf(regionPcode) {
  return regionPcode ? (DISTRICTS_OF_REGION.get(regionPcode) || EMPTY) : EMPTY
}
/** Communes d'un district (triées par nom). */
export function communesOf(districtPcode) {
  return districtPcode ? (COMMUNES_OF_DISTRICT.get(districtPcode) || EMPTY) : EMPTY
}

export function region(pcode) { return REGION_BY.get(pcode) || null }
export function district(pcode) { return DISTRICT_BY.get(pcode) || null }
export function commune(pcode) { return COMMUNE_BY.get(pcode) || null }

export function regionName(pcode) { return REGION_BY.get(pcode)?.name || pcode || '' }
export function districtName(pcode) { return DISTRICT_BY.get(pcode)?.name || '' }
export function communeName(pcode) { return COMMUNE_BY.get(pcode)?.name || '' }

/** Région parente d'un district. */
export function regionOfDistrict(districtPcode) {
  return DISTRICT_BY.get(districtPcode)?.region || ''
}
/** District parent d'une commune. */
export function districtOfCommune(communePcode) {
  return COMMUNE_BY.get(communePcode)?.district || ''
}

/**
 * Libellé lisible d'un emplacement à partir des codes disponibles.
 * ex. « Amboasary-Atsimo, Anosy » ou « Behara · Amboasary-Atsimo · Anosy ».
 */
export function geoPath({ region: r, district: d, commune: c } = {}, sep = ' · ') {
  return [communeName(c), districtName(d), regionName(r)].filter(Boolean).join(sep)
}

export const GEO_COUNTS = {
  regions: REGIONS.length,
  districts: GEO_DISTRICTS.length,
  communes: GEO_COMMUNES.length,
}
