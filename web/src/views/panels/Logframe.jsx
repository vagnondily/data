// ============================================================================
// Panneau Cadre logique — Objectif global → objectifs spécifiques → résultats
// avec indicateurs et activités rattachés.
// ============================================================================
import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Target, ListChecks, ChevronRight, Goal } from 'lucide-react'
import { useStore, byId } from '../../lib/store.js'
import { useCan } from '../../lib/perms.js'
import { indicatorAchievement, achievementTone } from '../../lib/compute.js'
import { pct } from '../../lib/format.js'
import { Card, Badge, Button, Modal, Field, Input, Textarea, Select, IconButton, useConfirm } from '../../components/ui.jsx'

export function LogframePanel({ projectId }) {
  const { projects, objectives, results, indicators, activities, add, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [objModal, setObjModal] = useState(null)
  const [resModal, setResModal] = useState(null)
  const { confirm, node } = useConfirm()

  const project = byId(projects, projectId)
  const objs = useMemo(() => objectives.filter((o) => o.projectId === projectId), [objectives, projectId])
  const projResults = results.filter((r) => r.projectId === projectId)

  const delObj = async (o) => {
    const rc = projResults.filter((r) => r.objectiveId === o.id).length
    if (await confirm({ title: 'Supprimer l’objectif', message: rc ? `Cet objectif porte ${rc} résultat(s), également supprimés. Continuer ?` : 'Confirmer ?', danger: true, confirmLabel: 'Supprimer' })) {
      projResults.filter((r) => r.objectiveId === o.id).forEach((r) => remove('results', r.id))
      remove('objectives', o.id); log('supprime', 'objectif', `Objectif supprimé : ${o.code}`)
    }
  }
  const delRes = async (r) => {
    if (await confirm({ title: 'Supprimer le résultat', message: 'Les indicateurs/activités rattachés seront détachés. Continuer ?', danger: true, confirmLabel: 'Supprimer' })) {
      remove('results', r.id); log('supprime', 'résultat', `Résultat supprimé : ${r.code}`)
    }
  }

  return (
    <div>
      {node}
      {/* Objectif global */}
      <Card className="mb-4 border-l-4 border-l-brand bg-brand-tint/30">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-d"><Goal size={15} /> Objectif global</div>
        <p className="mt-1.5 text-sm font-semibold text-ink">{project?.objectiveGlobal || 'Non défini — renseignez-le dans les paramètres du projet.'}</p>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">Objectifs spécifiques & résultats</span>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setObjModal({ projectId })}>Objectif</Button>}
      </div>

      {objs.length === 0 && <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-ink-mute">Aucun objectif spécifique. Ajoutez-en un pour structurer le cadre logique.</p>}

      <div className="space-y-4">
        {objs.map((o) => {
          const rs = projResults.filter((r) => r.objectiveId === o.id)
          return (
            <Card key={o.id}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-brand text-xs font-bold text-white">{o.code}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{o.label}</p>
                    {canEdit && (
                      <div className="flex flex-none gap-0.5">
                        <IconButton icon={Pencil} size={15} onClick={() => setObjModal(o)} className="h-7 w-7" />
                        <IconButton icon={Trash2} size={15} onClick={() => delObj(o)} className="h-7 w-7 hover:text-bad" />
                        <Button size="sm" variant="soft" icon={Plus} onClick={() => setResModal({ projectId, objectiveId: o.id })}>Résultat</Button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {rs.map((r) => {
                      const inds = indicators.filter((i) => i.resultId === r.id)
                      const acts = activities.filter((a) => a.resultId === r.id)
                      return (
                        <div key={r.id} className="rounded-xl border border-line-soft bg-surface-2/40 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <ChevronRight size={16} className="mt-0.5 flex-none text-ink-mute" />
                              <div>
                                <span className="font-mono text-xs font-bold text-brand-d">{r.code}</span>
                                <span className="ml-2 text-sm font-semibold text-ink">{r.label}</span>
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex flex-none gap-0.5">
                                <IconButton icon={Pencil} size={14} onClick={() => setResModal(r)} className="h-6 w-6" />
                                <IconButton icon={Trash2} size={14} onClick={() => delRes(r)} className="h-6 w-6 hover:text-bad" />
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                            {inds.map((i) => {
                              const a = indicatorAchievement(i)
                              return <Badge key={i.id} tone={a == null ? 'ink' : achievementTone(a)} dot title={i.name}>{i.code}{a != null ? ` · ${pct(a)}` : ''}</Badge>
                            })}
                            <span className="inline-flex items-center gap-1 rounded-full bg-inset px-2 py-0.5 text-[11px] text-ink-mute"><ListChecks size={12} />{acts.length} activité(s)</span>
                            {inds.length === 0 && acts.length === 0 && <span className="text-[11px] text-ink-mute">Aucun indicateur/activité rattaché</span>}
                          </div>
                        </div>
                      )
                    })}
                    {rs.length === 0 && <p className="pl-6 text-xs text-ink-mute">Aucun résultat attendu.</p>}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {objModal && <ObjectiveModal obj={objModal} nextCode={`OS${objs.length + 1}`} onClose={() => setObjModal(null)}
        onSave={(data) => {
          if (objModal.id) { update('objectives', objModal.id, data); log('modifie', 'objectif', `Objectif modifié : ${data.code}`) }
          else { add('objectives', { type: 'specifique', ...data }); log('cree', 'objectif', `Nouvel objectif : ${data.code}`) }
          setObjModal(null)
        }} />}
      {resModal && <ResultModal res={resModal} objectives={objs} onClose={() => setResModal(null)}
        onSave={(data) => {
          if (resModal.id) { update('results', resModal.id, data); log('modifie', 'résultat', `Résultat modifié : ${data.code}`) }
          else { add('results', data); log('cree', 'résultat', `Nouveau résultat : ${data.code}`) }
          setResModal(null)
        }} />}
    </div>
  )
}

function ObjectiveModal({ obj, nextCode, onClose, onSave }) {
  const [f, setF] = useState({ code: nextCode, label: '', ...obj })
  return (
    <Modal open onClose={onClose} size="md" title={obj.id ? 'Modifier l’objectif' : 'Nouvel objectif spécifique'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.label}>Enregistrer</Button></>}>
      <div className="form-grid-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Code"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Objectif spécifique" required className="col-span-3"><Textarea value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

function ResultModal({ res, objectives, onClose, onSave }) {
  const [f, setF] = useState({ code: '', label: '', objectiveId: res.objectiveId || objectives[0]?.id || '', projectId: res.projectId, ...res })
  return (
    <Modal open onClose={onClose} size="md" title={res.id ? 'Modifier le résultat' : 'Nouveau résultat attendu'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.label}>Enregistrer</Button></>}>
      <div className="form-grid-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Code"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="R1.1" /></Field>
        <Field label="Objectif" className="col-span-3"><Select value={f.objectiveId} onChange={(e) => setF({ ...f, objectiveId: e.target.value })}>{objectives.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.label}</option>)}</Select></Field>
        <Field label="Résultat attendu" required className="col-span-4"><Textarea value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
