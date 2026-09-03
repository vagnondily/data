// ============================================================================
// GeoCascade — sélecteurs dépendants Région → District → Commune
// Données réelles Madagascar (adm1/adm2/adm3, PAM 2025) via lib/geo.js.
// Deux variantes : 'form' (champs libellés) et 'filter' (selects « tous »).
// ============================================================================
import { REGIONS } from '../lib/constants.js'
import { districtsOf, communesOf } from '../lib/geo.js'
import { Field, Select } from './ui.jsx'
import { t } from '../lib/i18n.js'

export default function GeoCascade({
  region = '', district = '', commune = '',
  onChange,
  withCommune = true,
  variant = 'form',
  regions = REGIONS,
  required = false,
  className = '',
}) {
  const emit = (patch) => onChange?.({ region, district, commune, ...patch })
  const dists = districtsOf(region)
  const comms = communesOf(district)

  // Changer un niveau ré-initialise les niveaux enfants.
  const onRegion = (v) => emit({ region: v, district: '', commune: '' })
  const onDistrict = (v) => emit({ district: v, commune: '' })
  const onCommune = (v) => emit({ commune: v })

  if (variant === 'filter') {
    return (
      <>
        <Select value={region} onChange={(e) => onRegion(e.target.value)} className="w-auto">
          <option value="">Toutes les régions</option>
          {regions.map((r) => <option key={r.pcode} value={r.pcode}>{r.name}</option>)}
        </Select>
        <Select value={district} onChange={(e) => onDistrict(e.target.value)} className="w-auto" disabled={!region}>
          <option value="">Tous les districts</option>
          {dists.map((d) => <option key={d.pcode} value={d.pcode}>{d.name}</option>)}
        </Select>
        {withCommune && (
          <Select value={commune} onChange={(e) => onCommune(e.target.value)} className="w-auto" disabled={!district}>
            <option value="">Toutes les communes</option>
            {comms.map((c) => <option key={c.pcode} value={c.pcode}>{c.name}</option>)}
          </Select>
        )}
      </>
    )
  }

  // variant 'form'
  return (
    <>
      <Field label="Région" required={required} className={className}>
        <Select value={region} onChange={(e) => onRegion(e.target.value)}>
          <option value="">— Choisir —</option>
          {regions.map((r) => <option key={r.pcode} value={r.pcode}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="District" className={className}
        hint={!region ? t('Choisir une région d’abord') : undefined}>
        <Select value={district} onChange={(e) => onDistrict(e.target.value)} disabled={!region}>
          <option value="">— Choisir —</option>
          {dists.map((d) => <option key={d.pcode} value={d.pcode}>{d.name}</option>)}
        </Select>
      </Field>
      {withCommune && (
        <Field label="Commune" className={className}
          hint={!district ? t('Choisir un district d’abord') : undefined}>
          <Select value={commune} onChange={(e) => onCommune(e.target.value)} disabled={!district}>
            <option value="">— Choisir —</option>
            {comms.map((c) => <option key={c.pcode} value={c.pcode}>{c.name}</option>)}
          </Select>
        </Field>
      )}
    </>
  )
}
