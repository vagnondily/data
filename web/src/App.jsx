import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './views/Dashboard.jsx'
import Programmes from './views/Programmes.jsx'
import ProgrammeDetail from './views/ProgrammeDetail.jsx'
import Projets from './views/Projets.jsx'
import ProjetDetail from './views/ProjetDetail.jsx'
import Activites from './views/Activites.jsx'
import Planning from './views/Planning.jsx'
import Indicateurs from './views/Indicateurs.jsx'
import Budget from './views/Budget.jsx'
import Sites from './views/Sites.jsx'
import Suivi from './views/Suivi.jsx'
import Mre from './views/Mre.jsx'
import DocRegistry from './views/docs/DocRegistry.jsx'
import DocDetail from './views/docs/DocDetail.jsx'
import Beneficiaires from './views/Beneficiaires.jsx'
import Tpm from './views/Tpm.jsx'
import Rapports from './views/Rapports.jsx'
import Import from './views/Import.jsx'
import Parametres from './views/Parametres.jsx'
import Utilisateurs from './views/Utilisateurs.jsx'
import { EmptyState } from './components/ui.jsx'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/programmes" element={<Programmes />} />
          <Route path="/programmes/:id" element={<ProgrammeDetail />} />
          <Route path="/projets" element={<Projets />} />
          <Route path="/projets/:id" element={<ProjetDetail />} />
          <Route path="/activites" element={<Activites />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/indicateurs" element={<Indicateurs />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/plan-suivi" element={<DocRegistry kind="suivi" />} />
          <Route path="/plan-suivi/:id" element={<DocDetail kind="suivi" />} />
          <Route path="/pdd" element={<DocRegistry kind="pdd" />} />
          <Route path="/pdd/:id" element={<DocDetail kind="pdd" />} />
          <Route path="/suivi" element={<Suivi />} />
          <Route path="/mre" element={<Mre />} />
          <Route path="/beneficiaires" element={<Beneficiaires />} />
          <Route path="/tpm" element={<Tpm />} />
          <Route path="/import" element={<Import />} />
          <Route path="/rapports" element={<Rapports />} />
          <Route path="/utilisateurs" element={<Utilisateurs />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="*" element={<div className="py-16"><EmptyState title="Page introuvable" hint="La page demandée n'existe pas." /></div>} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
