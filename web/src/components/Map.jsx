// ============================================================================
// Carte des sites — Leaflet direct (marqueurs vectoriels, aucun asset d'icône)
// Les contours/fonds de tuile sont optionnels : la carte reste lisible hors-ligne.
// ============================================================================
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { COUNTRY_CENTER, REGIONS } from '../lib/constants.js'

const TONE = { ok: '#689E18', warn: '#F7B825', bad: '#C5192D', brand: '#007DBC', ink: '#6F8798' }

export default function SiteMap({ sites = [], onSelect, showRegions = true, height = 460, tiles = true }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    // Animations désactivées : évite qu'une image d'animation en vol accède à
    // un conteneur déjà retiré lors d'une navigation rapide (_leaflet_pos).
    const map = L.map(elRef.current, {
      zoomControl: true, attributionControl: false, scrollWheelZoom: false,
      fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false,
    }).setView([COUNTRY_CENTER.lat, COUNTRY_CENTER.lng], COUNTRY_CENTER.zoom)
    if (tiles) {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12, minZoom: 4, opacity: 0.9,
      }).addTo(map)
    }
    if (showRegions) {
      REGIONS.forEach((r) => {
        L.circleMarker([r.lat, r.lng], { radius: 2.5, color: '#8FB2C8', weight: 1, fillOpacity: 0.5 })
          .bindTooltip(r.name, { direction: 'top', className: 'text-xs' }).addTo(map)
      })
    }
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const tid = setTimeout(() => { if (mapRef.current === map) { try { map.invalidateSize() } catch { /* démonté */ } } }, 120)
    return () => { clearTimeout(tid); mapRef.current = null; try { map.remove() } catch { /* déjà retiré */ } }
  }, [tiles, showRegions])

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const pts = []
    sites.forEach((s) => {
      if (s.lat == null || s.lng == null) return
      const color = TONE[s.tone] || TONE.brand
      const m = L.circleMarker([s.lat, s.lng], {
        radius: s.size || 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9,
      })
      m.bindPopup(
        `<div style="font-family:'Open Sans',sans-serif;min-width:150px">
           <b style="color:#0F2231">${escapeHtml(s.name)}</b>
           ${s.meta ? `<div style="color:#43596A;font-size:12px;margin-top:2px">${escapeHtml(s.meta)}</div>` : ''}
           ${s.badge ? `<div style="margin-top:6px"><span style="background:${color};color:#fff;font-size:11px;padding:2px 8px;border-radius:999px">${escapeHtml(s.badge)}</span></div>` : ''}
         </div>`,
      )
      if (onSelect) m.on('click', () => onSelect(s))
      m.addTo(layer)
      pts.push([s.lat, s.lng])
    })
    if (pts.length) {
      try { map.fitBounds(pts, { padding: [40, 40], maxZoom: 8, animate: false }) } catch { /* single point */ }
    }
    const tid = setTimeout(() => { if (mapRef.current === map) { try { map.invalidateSize() } catch { /* démonté */ } } }, 60)
    return () => clearTimeout(tid)
  }, [sites, onSelect])

  return <div ref={elRef} style={{ height }} className="rounded-xl2 border border-line shadow-card" />
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
