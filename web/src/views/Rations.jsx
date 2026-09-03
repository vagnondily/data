// ============================================================================
// Catalogue de rations — denrées, compositions et calculateur en kg / kcal / cash
// ============================================================================
import { useMemo, useState } from 'react'
import { Wheat, Plus, Calculator, Download, Trash2, Package, Copy } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { rationTotals, rationPerDay } from '../lib/compute.js'
import { COMMODITY_GROUPS, RATION_MODALITY } from '../lib/constants.js'
import { num, num1, money } from '../lib/format.js'
import { exportRowsXlsx } from '../lib/docs.js'
import {
  PageHeader, Card, SectionTitle, Segmented, Select, Button, Field, Input, Badge, Kpi,
  DataTable, RowActions, StatusBadge, Modal, useConfirm, EmptyState, cx,
} from '../components/ui.jsx'
import { t } from '../lib/i18n.js'

export default function Rations() {
  const store = useStore((s) => s)
  const { commodities, rations, activities } = store
  const { canEdit } = useCan()
  const { confirm, node } = useConfirm()
  const [tab, setTab] = useState('rations')
  const [editRation, setEditRation] = useState(null)
  const [editCom, setEditCom] = useState(null)

  // Calculateur
  const [calcId, setCalcId] = useState(rations[0]?.id || '')
  const [persons, setPersons] = useState(1000)
  const [days, setDays] = useState(30)
  const ration = byId(rations, calcId) || rations[0]
  const totals = useMemo(() => (ration ? rationTotals(ration, commodities, { persons: Number(persons) || 0, days: Number(days) || 0 }) : null), [ration, commodities, persons, days])

  const activityTags = useMemo(() => [...new Set(activities.map((a) => a.name).filter(Boolean))].slice(0, 40), [activities])

  const delRation = async (r) => {
    if (await confirm({ title: 'Supprimer la ration', message: `Supprimer « ${r.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      store.remove('rations', r.id); store.log('supprime', 'ration', `Ration supprimée : ${r.name}`)
    }
  }
  const dupRation = (r) => {
    const { id, ...rest } = r
    const rec = store.add('rations', { ...rest, name: `${r.name} (copie)`, items: (r.items || []).map((i) => ({ ...i })) })
    store.log('cree', 'ration', `Ration dupliquée : ${rec.name}`)
  }
  const delCom = async (c) => {
    const used = rations.some((r) => (r.items || []).some((i) => i.commodityId === c.id))
    if (used) { await confirm({ title: 'Denrée utilisée', message: `« ${c.name} » est utilisée dans une ration. Retirez-la des rations d'abord.`, confirmLabel: 'Compris' }); return }
    if (await confirm({ title: 'Supprimer la denrée', message: `Supprimer « ${c.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      store.remove('commodities', c.id); store.log('supprime', 'denrée', `Denrée supprimée : ${c.name}`)
    }
  }

  const exportCalc = () => {
    if (!totals) return
    const rows = totals.lines.map((l) => ({ denree: l.name, gj: l.grams, kg: Math.round(l.kg), kcal: Math.round(l.kcal) }))
    exportRowsXlsx(`ration-${ration.name}`, rows, [
      { label: 'Denrée', key: 'denree' }, { label: 'g/pers/jour', key: 'gj' },
      { label: `kg (${persons} pers × ${days} j)`, key: 'kg' }, { label: 'kcal/pers/jour', key: 'kcal' },
    ])
  }

  return (
    <div>
      {node}
      <PageHeader icon={Wheat} title="Catalogue de rations" subtitle={`${rations.length} ${t('ration(s)')} · ${commodities.length} ${t('denrée(s)')}`}
        actions={<Segmented value={tab} onChange={setTab} options={[
          { value: 'rations', label: 'Rations', icon: Wheat }, { value: 'denrees', label: 'Denrées', icon: Package },
        ]} />} />

      {tab === 'rations' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Catalogue */}
          <div className="min-w-0">
            <SectionTitle action={canEdit && <Button size="sm" icon={Plus} onClick={() => setEditRation({})}>Nouvelle ration</Button>}>Rations</SectionTitle>
            <DataTable
              empty="Aucune ration"
              rows={rations}
              onRowClick={(r) => setCalcId(r.id)}
              columns={[
                { key: 'name', label: 'Ration', render: (r) => <span className="font-semibold text-ink">{r.name}</span> },
                { key: 'modality', label: 'Modalité', sortValue: (r) => r.modality, render: (r) => <StatusBadge map={RATION_MODALITY} value={r.modality} /> },
                { key: 'tag', label: 'Activité', render: (r) => r.activityTag ? <Badge tone="ink">{r.activityTag}</Badge> : '—' },
                { key: 'items', label: 'Denrées', align: 'right', sortValue: (r) => (r.items || []).length, render: (r) => r.modality === 'vivres' ? (r.items || []).length : '—' },
                { key: 'kcal', label: 'kcal/j', align: 'right', sortValue: (r) => rationPerDay(r, commodities).kcal, render: (r) => r.modality === 'vivres' ? <span className="tabnum">{num(Math.round(rationPerDay(r, commodities).kcal))}</span> : '—' },
                { key: 'val', label: 'Valeur/pers/mois', align: 'right', render: (r) => r.modality === 'vivres'
                  ? <span className="tabnum">{num1(rationTotals(r, commodities, { persons: 1, days: r.daysPerMonth || 30 }).totalKg)} kg</span>
                  : <span className="tabnum">{money((r.cashPerDay || 0) * (r.daysPerMonth || 30))}</span> },
                canEdit && { key: 'act', label: '', width: 190, align: 'right', render: (r) => <RowActions
                  onOpen={() => setCalcId(r.id)} openLabel="Calculer"
                  onDuplicate={() => dupRation(r)} onEdit={() => setEditRation(r)} onDelete={() => delRation(r)} /> },
              ].filter(Boolean)}
            />
          </div>

          {/* Calculateur */}
          <Card className="h-fit">
            <SectionTitle>Calculateur</SectionTitle>
            <Field label="Ration">
              <Select value={calcId} onChange={(e) => setCalcId(e.target.value)}>
                {rations.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Bénéficiaires"><Input type="number" min="0" value={persons} onChange={(e) => setPersons(e.target.value)} /></Field>
              <Field label="Jours"><Input type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
            </div>

            {ration && totals && (ration.modality === 'vivres' ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Kpi label="Tonnage total" value={`${num1(totals.totalKg / 1000)} t`} tone="brand" />
                  <Kpi label="Apport énergétique" value={`${num(Math.round(totals.kcalPerDay))}`} sub="kcal/pers/jour" tone={totals.kcalPerDay >= 2000 ? 'ok' : 'warn'} />
                </div>
                <div className="mt-3 overflow-hidden rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase text-ink-soft">
                      <th className="px-3 py-2 text-left">{t('Denrée')}</th><th className="px-3 py-2 text-right">g/j</th><th className="px-3 py-2 text-right">{t('Tonnage')}</th>
                    </tr></thead>
                    <tbody>
                      {totals.lines.map((l) => (
                        <tr key={l.commodityId} className="border-b border-line-soft last:border-0">
                          <td className="px-3 py-1.5 text-ink-soft">{l.name}</td>
                          <td className="px-3 py-1.5 text-right tabnum">{num(l.grams)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabnum text-ink">{num1(l.kg / 1000)} t</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <Kpi label="Montant total" value={money(totals.cash)} tone="ok" />
                <Kpi label="Par personne" value={money((ration.cashPerDay || 0) * (Number(days) || 0))} sub={`${money(ration.cashPerDay)} / ${t('jour')}`} tone="brand" />
              </div>
            ))}

            {ration?.modality === 'vivres' && <Button className="mt-3 w-full" variant="outline" size="sm" icon={Download} onClick={exportCalc}>Exporter en Excel</Button>}
            {ration?.notes && <p className="mt-3 rounded-lg bg-inset px-3 py-2 text-xs text-ink-mute">{ration.notes}</p>}
          </Card>
        </div>
      ) : (
        <div>
          <SectionTitle action={canEdit && <Button size="sm" icon={Plus} onClick={() => setEditCom({})}>Nouvelle denrée</Button>}>Denrées de référence</SectionTitle>
          <DataTable
            empty="Aucune denrée"
            rows={commodities}
            columns={[
              { key: 'name', label: 'Denrée', render: (c) => <span className="font-semibold text-ink">{c.name}</span> },
              { key: 'group', label: 'Groupe alimentaire', sortValue: (c) => c.group, render: (c) => <StatusBadge map={COMMODITY_GROUPS} value={c.group} dot={false} /> },
              { key: 'kcal', label: 'kcal / 100 g', align: 'right', sortValue: (c) => c.kcalPer100g, render: (c) => <span className="tabnum">{num(c.kcalPer100g)}</span> },
              { key: 'used', label: 'Rations', align: 'right', render: (c) => <span className="tabnum text-ink-mute">{rations.filter((r) => (r.items || []).some((i) => i.commodityId === c.id)).length}</span> },
              canEdit && { key: 'act', label: '', width: 110, align: 'right', render: (c) => <RowActions onEdit={() => setEditCom(c)} onDelete={() => delCom(c)} /> },
            ].filter(Boolean)}
          />
        </div>
      )}

      {editRation && <RationForm ration={editRation} commodities={commodities} activityTags={activityTags}
        onClose={() => setEditRation(null)}
        onSave={(data) => {
          if (editRation.id) { store.update('rations', editRation.id, data); store.log('modifie', 'ration', `Ration modifiée : ${data.name}`) }
          else { const rec = store.add('rations', data); store.log('cree', 'ration', `Nouvelle ration : ${data.name}`); setCalcId(rec.id) }
          setEditRation(null)
        }} />}
      {editCom && <CommodityForm commodity={editCom} onClose={() => setEditCom(null)}
        onSave={(data) => {
          if (editCom.id) { store.update('commodities', editCom.id, data); store.log('modifie', 'denrée', `Denrée modifiée : ${data.name}`) }
          else { store.add('commodities', data); store.log('cree', 'denrée', `Nouvelle denrée : ${data.name}`) }
          setEditCom(null)
        }} />}
    </div>
  )
}

// ---- Formulaire ration -----------------------------------------------------
function RationForm({ ration, commodities, activityTags, onClose, onSave }) {
  const [f, setF] = useState({ name: '', modality: 'vivres', activityTag: '', daysPerMonth: 30, cashPerDay: 0, items: [], notes: '', ...ration })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const setItem = (i, patch) => setF((p) => ({ ...p, items: p.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const addItem = () => setF((p) => ({ ...p, items: [...(p.items || []), { commodityId: commodities[0]?.id || '', grams: 0 }] }))
  const rmItem = (i) => setF((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))
  const isVivres = f.modality === 'vivres'
  const save = () => onSave({
    ...f, daysPerMonth: Number(f.daysPerMonth) || 30, cashPerDay: Number(f.cashPerDay) || 0,
    items: (f.items || []).map((x) => ({ commodityId: x.commodityId, grams: Number(x.grams) || 0 })).filter((x) => x.commodityId),
  })

  return (
    <Modal open onClose={onClose} size="lg" title={ration.id ? 'Modifier la ration' : 'Nouvelle ration'}
      subtitle="Composition par personne et par jour ; le calculateur en déduit le tonnage."
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="form-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nom de la ration" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Ration générale (GFD)" /></Field>
        <Field label="Modalité"><Select value={f.modality} onChange={(e) => set('modality', e.target.value)}>{Object.entries(RATION_MODALITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Activité (tag)"><Input value={f.activityTag} onChange={(e) => set('activityTag', e.target.value)} placeholder="GFD, TSFP, CBT…" list="ration-tags" />
          <datalist id="ration-tags">{activityTags.map((tg) => <option key={tg} value={tg} />)}</datalist></Field>
        <Field label="Jours par mois"><Input type="number" min="1" max="31" value={f.daysPerMonth} onChange={(e) => set('daysPerMonth', e.target.value)} /></Field>
        {!isVivres && <Field label="Montant / personne / jour (USD)"><Input type="number" min="0" step="0.01" value={f.cashPerDay} onChange={(e) => set('cashPerDay', e.target.value)} /></Field>}
      </div>

      {isVivres && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">{t('Composition')} (g/pers/jour)</span>
            <Button size="sm" variant="ghost" icon={Plus} onClick={addItem}>{t('Ajouter une denrée')}</Button>
          </div>
          {(f.items || []).length === 0 ? <p className="rounded-lg bg-inset px-3 py-2 text-xs text-ink-mute">{t('Aucune denrée. Ajoutez-en pour composer la ration.')}</p> : (
            <div className="space-y-2">
              {f.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={it.commodityId} onChange={(e) => setItem(i, { commodityId: e.target.value })} className="flex-1">
                    {commodities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Input type="number" min="0" value={it.grams} onChange={(e) => setItem(i, { grams: e.target.value })} className="w-24 text-right" />
                  <span className="text-xs text-ink-mute">g</span>
                  <button onClick={() => rmItem(i)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute transition hover:bg-bad-tint hover:text-bad"><Trash2 size={14} /></button>
                </div>
              ))}
              <RationSummary items={f.items} commodities={commodities} />
            </div>
          )}
        </div>
      )}
      <Field label="Note (facultatif)" className="mt-4"><Input value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Cible kcal, population, remarques…" /></Field>
    </Modal>
  )
}

function RationSummary({ items, commodities }) {
  const per = rationPerDay({ items }, commodities)
  return (
    <div className="flex items-center justify-end gap-4 rounded-lg bg-inset px-3 py-2 text-xs">
      <span className="text-ink-mute">{t('Total')} : <b className="text-ink tabnum">{num(per.grams)} g/j</b></span>
      <span className="text-ink-mute">{t('Apport')} : <b className={cx('tabnum', per.kcal >= 2000 ? 'text-ok' : 'text-warn')}>{num(Math.round(per.kcal))} kcal/j</b></span>
    </div>
  )
}

// ---- Formulaire denrée -----------------------------------------------------
function CommodityForm({ commodity, onClose, onSave }) {
  const [f, setF] = useState({ name: '', group: 'cereales', kcalPer100g: 0, unit: 'g', ...commodity })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="sm" title={commodity.id ? 'Modifier la denrée' : 'Nouvelle denrée'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ ...f, kcalPer100g: Number(f.kcalPer100g) || 0 })} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="form-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nom" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Riz" /></Field>
        <Field label="Groupe alimentaire"><Select value={f.group} onChange={(e) => set('group', e.target.value)}>{Object.entries(COMMODITY_GROUPS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="kcal pour 100 g"><Input type="number" min="0" value={f.kcalPer100g} onChange={(e) => set('kcalPer100g', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
