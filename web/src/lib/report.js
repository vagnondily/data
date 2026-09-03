// ============================================================================
// Générateur de rapport infographique — document HTML autonome (impression / PDF)
// Graphiques en SVG en ligne (aucune dépendance), palette validée dataviz.
// Aperçu en direct (iframe srcdoc) + impression via fenêtre dédiée.
// ============================================================================
import {
  budgetForProject, projectProgress, beneficiaryRollup, coverageStats, complianceStats,
  indicatorAchievement, indicatorActual, portfolioKpis, budgetByKey,
} from './compute.js'
import { PROJECT_STATUS, INDICATOR_LEVEL, ACTIVITY_STATUS } from './constants.js'
import { money, moneyShort, num, pct, fmtDate } from './format.js'
import { byId } from './store.js'
import { t, useLang } from './i18n.js'

// -- Palette (validée par scripts/validate_palette.js) -----------------------
// Catégoriel 2 séries : bleu #007DBC + vert #5C8A13 → tous les tests PASS.
// Couleurs de statut/atteinte : réservées, toujours accompagnées d'un libellé.
const PAL = {
  ink: '#0F2231', inkSoft: '#43596A', inkMute: '#6F8798',
  line: '#D6E2EC', lineSoft: '#E7EEF4', inset: '#F1F6FA', surface: '#FFFFFF',
  blue: '#007DBC', green: '#5C8A13', amber: '#B07D05', red: '#C5192D', slate: '#64748B',
}
// Bandes d'atteinte / consommation (feu tricolore, avec libellé chiffré)
const bandTone = (v) => (v == null ? PAL.slate : v >= 90 ? PAL.green : v >= 65 ? PAL.amber : PAL.red)
const burnTone = (v) => (v > 95 ? PAL.red : v > 80 ? PAL.amber : PAL.green)
const STATUS_COLOR = { planifie: PAL.slate, en_cours: PAL.blue, bloque: PAL.red, termine: PAL.green,
  a_faire: PAL.slate, todo: PAL.slate, doing: PAL.blue, blocked: PAL.red, done: PAL.green }

// Accents de marque proposés (couleur du bandeau/titres/jauge — chrome uniquement)
export const ACCENTS = [
  { key: 'wfp', label: 'Bleu WFP', color: '#007DBC', deep: '#03293D' },
  { key: 'navy', label: 'Bleu nuit', color: '#085387', deep: '#03293D' },
  { key: 'teal', label: 'Sarcelle', color: '#0F766E', deep: '#0B3B37' },
  { key: 'indigo', label: 'Indigo', color: '#4338CA', deep: '#1E1B4B' },
  { key: 'wine', label: 'Bordeaux', color: '#9F1239', deep: '#4C0519' },
]
export const accentOf = (k) => ACCENTS.find((a) => a.key === k) || ACCENTS[0]

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const clip = (s = '', n = 22) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s }

// -- Primitives SVG ----------------------------------------------------------
const polar = (cx, cy, r, ang) => { const a = (ang - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] }
function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1)
  const large = (a1 - a0) % 360 > 180 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

// Donut à segments (anneaux arrondis, 3° de séparation → anti-confusion)
function svgDonut(segments, { size = 168, thick = 24, centerLabel = '', centerSub = '' } = {}) {
  const total = segments.reduce((n, s) => n + (s.value || 0), 0)
  const cx = size / 2, cy = size / 2, r = (size - thick) / 2
  let ang = 0, arcs = ''
  const drawn = segments.filter((s) => s.value > 0)
  if (drawn.length === 1) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${drawn[0].color}" stroke-width="${thick}"/>`
  } else {
    const gap = 3
    drawn.forEach((s) => {
      const sweep = (s.value / (total || 1)) * 360
      const a0 = ang + gap / 2, a1 = ang + sweep - gap / 2
      if (a1 > a0) arcs += `<path d="${arcPath(cx, cy, r, a0, a1)}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-linecap="round"/>`
      ang += sweep
    })
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PAL.lineSoft}" stroke-width="${thick}"/>
    ${arcs}
    ${centerLabel !== '' ? `<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="${(size * 0.155).toFixed(0)}" font-weight="800" fill="${PAL.ink}">${esc(centerLabel)}</text>` : ''}
    ${centerSub ? `<text x="${cx}" y="${cy + size * 0.135}" text-anchor="middle" font-size="${(size * 0.072).toFixed(0)}" fill="${PAL.inkMute}">${esc(centerSub)}</text>` : ''}
  </svg>`
}

// Barres horizontales : piste = valeur de référence, remplissage = valeur réelle.
function svgBars(items, { width = 480, barH = 20, gap = 14, labelW = 132, valW = 92, fmt = (v) => v } = {}) {
  const max = Math.max(1, ...items.map((i) => i.track ?? i.value))
  const trackX = labelW, trackW = width - labelW - valW
  const h = Math.max(1, items.length) * (barH + gap) - gap
  let rows = ''
  items.forEach((it, i) => {
    const y = i * (barH + gap)
    const tw = Math.max(2, ((it.track ?? it.value) / max) * trackW)
    const fw = Math.max(2, Math.min(tw, ((it.value) / max) * trackW))
    rows += `<text x="0" y="${y + barH / 2}" dominant-baseline="middle" font-size="11.5" fill="${PAL.inkSoft}">${esc(clip(it.label, 20))}</text>
      <rect x="${trackX}" y="${y}" width="${tw.toFixed(1)}" height="${barH}" rx="5" fill="${PAL.inset}"/>
      <rect x="${trackX}" y="${y}" width="${fw.toFixed(1)}" height="${barH}" rx="5" fill="${it.color || PAL.blue}"/>
      <text x="${width}" y="${y + barH / 2}" text-anchor="end" dominant-baseline="middle" font-size="11.5" font-weight="700" fill="${PAL.ink}">${esc(fmt(it.value, it))}</text>`
  })
  return `<svg viewBox="0 0 ${width} ${h}" width="100%" height="${h}" role="img" aria-hidden="true" preserveAspectRatio="xMinYMin meet">${rows}</svg>`
}

// Anneau de progression 0–100 (part du haut, sens horaire) — familier, lisible.
function svgRing(value, { size = 150, thick = 14, tone = PAL.blue, label = '', sub = '' } = {}) {
  const v = Math.max(0, Math.min(100, value || 0))
  const cx = size / 2, cy = size / 2, r = (size - thick) / 2
  const fill = v >= 99.9
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${tone}" stroke-width="${thick}"/>`
    : (v > 0 ? `<path d="${arcPath(cx, cy, r, 0, (v / 100) * 359.9)}" fill="none" stroke="${tone}" stroke-width="${thick}" stroke-linecap="round"/>` : '')
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PAL.lineSoft}" stroke-width="${thick}"/>
    ${fill}
    <text x="${cx}" y="${cy - (sub ? size * 0.02 : -size * 0.06)}" text-anchor="middle" font-size="${(size * 0.2).toFixed(0)}" font-weight="800" fill="${PAL.ink}">${esc(label)}</text>
    ${sub ? `<text x="${cx}" y="${cy + size * 0.14}" text-anchor="middle" font-size="${(size * 0.08).toFixed(0)}" fill="${PAL.inkMute}">${esc(sub)}</text>` : ''}
  </svg>`
}

// -- Blocs HTML --------------------------------------------------------------
const legend = (items) => `<div class="legend">${items.map((s) => `<span class="lg"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}${s.value != null ? ` <b>${esc(s.value)}</b>` : ''}</span>`).join('')}</div>`

function kpiCards(cards) {
  return `<div class="kpis">${cards.map((c) => `<div class="kpi">
    <div class="kv">${esc(c.value)}</div>
    <div class="kl">${esc(c.label)}</div>
    ${c.sub ? `<div class="ks">${esc(c.sub)}</div>` : ''}
  </div>`).join('')}</div>`
}

const card = (title, inner, cls = '') => `<section class="block ${cls}"><h2>${esc(title)}</h2>${inner}</section>`
function table(head, rows) {
  if (!rows.length) return `<p class="muted">${esc(t('Aucune donnée'))}.</p>`
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? '' : c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

// -- Corps du rapport --------------------------------------------------------
function reportBody(store, cfg) {
  const isPortfolio = cfg.scope === 'portfolio'
  const project = isPortfolio ? null : byId(store.projects, cfg.scope)
  const S = cfg.sections
  const F = (arr, key = 'projectId') => (isPortfolio ? arr : arr.filter((x) => x[key] === cfg.scope))
  let html = ''

  // KPIs
  if (S.kpis) {
    let cards = []
    if (isPortfolio) {
      const k = portfolioKpis(store)
      cards = [
        { value: k.projectsActive, label: t('Projets actifs'), sub: `${t('sur')} ${k.projectsTotal} ${t('au total')}` },
        { value: num(k.beneficiariesReached), label: t('Bénéficiaires atteints'), sub: pct(k.beneficiaryRate) },
        { value: moneyShort(k.budgetSpent), label: t('Budget dépensé'), sub: `${pct(k.budgetBurn)} ${t('du prévu')}` },
        { value: pct(k.coverage), label: t('Couverture suivi') },
        { value: k.compliance?.avg ?? '—', label: t('Conformité /100') },
        { value: k.avgAchievement != null ? pct(k.avgAchievement) : '—', label: t('Atteinte indicateurs') },
      ]
    } else {
      const b = budgetForProject(store.budgetLines, cfg.scope)
      const ben = beneficiaryRollup(store.beneficiaries, (x) => x.projectId === cfg.scope)
      const sitesP = store.sites.filter((s) => (s.projectIds || []).includes(cfg.scope))
      const cov = coverageStats(sitesP, F(store.visits))
      const comp = complianceStats(F(store.visits))
      cards = [
        { value: pct(projectProgress(store.activities, cfg.scope)), label: t('Avancement') },
        { value: moneyShort(b.spent), label: t('Budget dépensé'), sub: `${pct(b.burn)} ${t('du prévu')}` },
        { value: num(ben.reached), label: t('Bénéficiaires atteints'), sub: pct(ben.rate) },
        { value: pct(cov.coverage), label: t('Couverture suivi') },
        { value: comp.avg ?? '—', label: t('Conformité /100') },
      ]
    }
    html += `<section class="block avoid"><h2>${esc(t('Indicateurs clés'))}</h2>${kpiCards(cards)}</section>`
  }

  // Budget — donut consommation + barres par catégorie
  if (S.budget) {
    const lines = F(store.budgetLines)
    const planned = lines.reduce((n, b) => n + (b.planned || 0), 0)
    const spent = lines.reduce((n, b) => n + (b.spent || 0), 0)
    const committed = lines.reduce((n, b) => n + (b.committed || 0), 0)
    const remaining = Math.max(0, planned - spent)
    const burn = planned ? (spent / planned) * 100 : 0
    const cats = budgetByKey(lines, 'category').slice(0, 8)
    const bars = svgBars(cats.map((c) => ({ label: c.key, value: c.spent, track: c.planned, color: burnTone(c.planned ? (c.spent / c.planned) * 100 : 0) })),
      { fmt: (v, it) => `${moneyShort(v)} / ${moneyShort(it.track)}` })
    const donut = svgDonut([
      { value: spent, color: PAL.blue, label: t('Dépensé') },
      { value: remaining, color: PAL.lineSoft, label: t('Reste') },
    ], { centerLabel: pct(burn), centerSub: t('consommé') })
    const inner = `<div class="cols">
      <div class="col-a">${donut}${legend([{ color: PAL.blue, label: t('Dépensé'), value: moneyShort(spent) }, { color: PAL.line, label: t('Reste'), value: moneyShort(remaining) }])}
        <div class="mini">${t('Prévu')} <b>${money(planned)}</b> · ${t('Engagé')} <b>${money(committed)}</b></div></div>
      <div class="col-b"><div class="sub">${esc(t('Prévu vs dépensé — par catégorie'))}</div>${cats.length ? bars : `<p class="muted">${t('Aucune donnée')}.</p>`}</div>
    </div>`
    html += card(t('Budget'), inner, 'avoid')
  }

  // Indicateurs — barres d'atteinte colorées par bande (avec % en clair)
  if (S.indicateurs) {
    const inds = F(store.indicators)
    const items = inds.slice(0, 12).map((i) => {
      const a = indicatorAchievement(i)
      const ar = a == null ? null : Math.round(a)
      return { label: i.code, value: ar == null ? 0 : ar, track: 100, color: bandTone(ar),
        _txt: ar == null ? '—' : pct(ar) }
    })
    const bars = svgBars(items, { fmt: (v, it) => it._txt })
    const inner = `${inds.length ? bars : `<p class="muted">${t('Aucune donnée')}.</p>`}
      ${legend([{ color: PAL.green, label: `≥ 90% (${t('Sur la bonne voie')})` }, { color: PAL.amber, label: '65–89%' }, { color: PAL.red, label: `< 65% (${t('En retard')})` }])}`
    html += card(t('Atteinte des indicateurs'), inner, 'avoid')
  }

  // Couverture du suivi — jauge + note conformité
  if (S.couverture) {
    let cov, comp
    if (isPortfolio) { const k = portfolioKpis(store); cov = { coverage: k.coverage }; comp = k.compliance }
    else {
      const sitesP = store.sites.filter((s) => (s.projectIds || []).includes(cfg.scope))
      cov = coverageStats(sitesP, F(store.visits)); comp = complianceStats(F(store.visits))
    }
    const g1 = svgRing(cov.coverage, { tone: bandTone(cov.coverage >= 80 ? 90 : cov.coverage >= 60 ? 70 : 40), label: pct(cov.coverage) })
    const g2 = svgRing(comp.avg || 0, { tone: bandTone((comp.avg || 0) >= 65 ? 90 : (comp.avg || 0) >= 50 ? 70 : 40), label: `${comp.avg ?? '—'}`, sub: '/100' })
    const inner = `<div class="gauges"><div class="gc">${g1}<div class="gl">${esc(t('Couverture suivi'))}</div></div>
      <div class="gc">${g2}<div class="gl">${esc(t('Conformité /100'))}</div></div></div>`
    html += card(t('Suivi & conformité'), inner, 'avoid')
  }

  // Bénéficiaires — donut genre + total
  if (S.beneficiaires) {
    const roll = beneficiaryRollup(F(store.beneficiaries))
    const donut = svgDonut([
      { value: roll.reachedF, color: PAL.blue, label: t('Femmes') },
      { value: roll.reachedM, color: PAL.green, label: t('Hommes') },
    ], { centerLabel: num(roll.reached), centerSub: t('atteints') })
    const inner = `<div class="cols">
      <div class="col-a">${donut}${legend([{ color: PAL.blue, label: t('Femmes'), value: num(roll.reachedF) }, { color: PAL.green, label: t('Hommes'), value: num(roll.reachedM) }])}</div>
      <div class="col-b">${kpiCards([
        { value: num(roll.planned), label: t('Cible totale') },
        { value: num(roll.reached), label: t('Personnes atteintes'), sub: pct(roll.rate) },
        { value: pct(roll.femRate), label: t('Part des femmes') },
      ])}</div></div>`
    html += card(t('Bénéficiaires'), inner, 'avoid')
  }

  // Activités — répartition par statut (barres labellisées)
  if (S.activites) {
    const acts = F(store.activities)
    const groups = Object.entries(ACTIVITY_STATUS).map(([k, v]) => ({
      k, label: t(v.label), value: acts.filter((a) => a.status === k).length, track: acts.length || 1,
      color: STATUS_COLOR[k] || PAL.slate,
    }))
    const bars = svgBars(groups, { labelW: 120, valW: 40, fmt: (v) => v })
    html += card(t('Activités'), acts.length ? bars : `<p class="muted">${t('Aucune donnée')}.</p>`, 'avoid')
  }

  // Tableaux détaillés (facultatif)
  if (S.tables) {
    if (S.indicateurs) {
      const rows = F(store.indicators).map((i) => [esc(i.code), esc(i.name), num(i.target), num(indicatorActual(i)), indicatorAchievement(i) != null ? pct(indicatorAchievement(i)) : '—'])
      html += card(`${t('Indicateurs')} — ${t('Données')}`, table([t('Code'), t('Indicateur'), t('Cible'), t('Réalisé'), t('Atteinte')], rows))
    }
    if (S.visites) {
      const rows = F(store.visits).filter((v) => v.status === 'realise').map((v) => [esc(byId(store.sites, v.siteId)?.name || ''), fmtDate(v.date), esc(v.type), v.score ?? '—', esc(v.findings || '')])
      html += card(`${t('Suivi & visites')}`, table([t('Site'), t('Date'), t('Type'), t('Score'), t('Constats')], rows))
    }
    if (S.beneficiaires) {
      const rows = F(store.beneficiaries).map((b) => [esc(b.category), num(b.plannedTotal), num(b.reachedTotal), num(b.reachedF), num(b.reachedM)])
      html += card(`${t('Bénéficiaires')} — ${t('Données')}`, table([t('Catégorie'), t('Ciblé'), t('Atteint'), t('Femmes'), t('Hommes')], rows))
    }
  }

  // Note narrative
  if (S.narrative && cfg.narrative && cfg.narrative.trim()) {
    html += card(t('Note narrative'), `<p class="narr">${esc(cfg.narrative).replace(/\n/g, '<br>')}</p>`, 'avoid')
  }
  return html
}

// -- Document complet --------------------------------------------------------
export function buildReportDoc(store, cfg) {
  const acc = accentOf(cfg.accent)
  const isPortfolio = cfg.scope === 'portfolio'
  const project = isPortfolio ? null : byId(store.projects, cfg.scope)
  const scopeLabel = isPortfolio ? t('Portefeuille complet') : `${project?.code} — ${project?.name}`
  const title = cfg.title?.trim() || (isPortfolio ? store.organization.name : `${project?.code} — ${project?.name}`)
  const subtitle = cfg.subtitle?.trim() || `${t('Rapport de suivi-évaluation')} · ${scopeLabel}`
  const org = cfg.org?.trim() || store.organization?.name || ''
  const landscape = cfg.orientation === 'landscape'
  const genLabel = `${t('Généré par')} MEMS — ${new Date().toLocaleString()}`

  const cover = cfg.sections.cover ? `<header class="cover">
      <div class="cover-top">
        <div class="brandmark">M<span>S</span></div>
        <div class="org">${esc(org)}</div>
      </div>
      <div class="cover-mid">
        <div class="tag">${esc(t('Rapport infographique'))}</div>
        <h1>${esc(title)}</h1>
        <p class="sub">${esc(subtitle)}</p>
        ${cfg.period?.trim() ? `<p class="period">${esc(t('Période'))} : <b>${esc(cfg.period)}</b></p>` : ''}
      </div>
      <div class="cover-foot">${esc(genLabel)}</div>
    </header>` : `<header class="head"><div class="brandmark sm">M<span>S</span></div><div><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p></div></header>`

  const body = reportBody(store, cfg)

  return `<!doctype html><html lang="${useLang.getState().lang === 'en' ? 'en' : 'fr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{ --acc:${acc.color}; --deep:${acc.deep}; --ink:${PAL.ink}; --soft:${PAL.inkSoft}; --mute:${PAL.inkMute}; --line:${PAL.line}; --lineSoft:${PAL.lineSoft}; --inset:${PAL.inset}; }
  *{box-sizing:border-box} html,body{margin:0}
  body{font-family:"Open Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#eef2f6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:${landscape ? '1040px' : '820px'};margin:18px auto;background:#fff;box-shadow:0 6px 28px -14px rgba(3,41,61,.4);border-radius:10px;overflow:hidden}
  .pad{padding:26px 30px}
  h1{font-size:26px;line-height:1.15;margin:0;color:var(--deep)}
  h2{font-size:14px;letter-spacing:.02em;text-transform:uppercase;color:var(--acc);margin:0 0 12px;padding-bottom:7px;border-bottom:2px solid var(--acc)}
  .sub{color:var(--mute);font-size:13px;margin:6px 0 0}
  .muted{color:var(--mute);font-size:12px}
  /* Cover */
  .cover{background:radial-gradient(120% 130% at 88% -10%, ${acc.color}55, transparent 55%), linear-gradient(160deg,var(--deep),${acc.color} 190%);color:#fff;padding:34px 30px;min-height:${landscape ? '210px' : '300px'};display:flex;flex-direction:column;justify-content:space-between}
  .cover-top{display:flex;align-items:center;justify-content:space-between}
  .cover h1{color:#fff;font-size:34px;max-width:16em}
  .cover .sub{color:#dbeafe;font-size:15px}
  .cover .tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#bfe0f4;border:1px solid #ffffff40;border-radius:999px;padding:4px 12px;margin-bottom:14px}
  .cover .period{color:#eaf6ff;font-size:13px;margin-top:14px}
  .cover .org{font-size:13px;color:#cfe8f7}
  .cover-foot{font-size:11px;color:#a9d3ec}
  .brandmark{width:44px;height:44px;border-radius:12px;background:#ffffff1a;border:1px solid #ffffff35;display:grid;place-items:center;font-weight:800;font-size:20px;color:#fff}
  .brandmark span{color:#7cc6ec} .brandmark.sm{width:38px;height:38px;font-size:17px;background:var(--acc);border:none}
  .head{display:flex;align-items:center;gap:14px;padding:22px 30px;border-bottom:3px solid var(--acc)}
  .head h1{font-size:22px}
  /* Blocks */
  .block{margin-top:22px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .kpi{border:1px solid var(--line);border-radius:11px;padding:12px 14px;background:linear-gradient(180deg,#fff,var(--inset))}
  .kpi .kv{font-size:23px;font-weight:800;color:var(--deep);line-height:1;white-space:nowrap}
  .kpi .kl{font-size:11.5px;color:var(--soft);margin-top:5px;font-weight:600}
  .kpi .ks{font-size:11px;color:var(--mute);margin-top:2px}
  .cols{display:grid;grid-template-columns:210px 1fr;gap:22px;align-items:start}
  .col-a{text-align:center} .col-b .sub{font-size:12px;color:var(--soft);font-weight:600;margin-bottom:10px}
  .mini{font-size:11.5px;color:var(--mute);margin-top:8px}
  .legend{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:8px}
  .legend .lg{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--soft)}
  .legend .dot{width:10px;height:10px;border-radius:3px;display:inline-block}
  .legend b{color:var(--ink)}
  .gauges{display:flex;gap:30px;justify-content:center;flex-wrap:wrap}
  .gc{text-align:center} .gl{font-size:12px;color:var(--soft);font-weight:600;margin-top:2px}
  table{border-collapse:collapse;width:100%;font-size:11.5px;margin-top:4px}
  th,td{border:1px solid var(--lineSoft);padding:6px 9px;text-align:left;vertical-align:top}
  th{background:var(--inset);font-weight:700;color:var(--soft)}
  .narr{font-size:13px;line-height:1.6;color:var(--soft);white-space:pre-line}
  .foot{padding:14px 30px 26px;color:var(--mute);font-size:11px;border-top:1px solid var(--lineSoft);margin-top:8px}
  @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}
  @media print{
    body{background:#fff} .page{box-shadow:none;margin:0;max-width:100%;border-radius:0}
    .block,.kpi,.gc,table{page-break-inside:avoid} .avoid{page-break-inside:avoid}
    h2{page-break-after:avoid}
  }
</style></head>
<body>
  <div class="page">
    ${cover}
    <div class="pad">${body}</div>
    <div class="foot">${esc(genLabel)}</div>
  </div>
</body></html>`
}

// Ouvre le document dans une fenêtre et lance l'impression.
export function printReportDoc(html) {
  const w = window.open('', '_blank', 'width=980,height=1200')
  if (!w) { alert(t('Veuillez autoriser les fenêtres pop-up pour l’impression.')); return }
  w.document.open(); w.document.write(html); w.document.close()
  w.onload = () => setTimeout(() => w.print(), 350)
}
