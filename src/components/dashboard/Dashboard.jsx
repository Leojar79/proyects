import { useState } from 'react';
import { BarChart2, TrendingUp, PieChart, Table } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import AgentManager from './AgentManager';
import RecordForm from './RecordForm';
import KpiCards from './KpiCards';
import { CreditsPerMonthChart, TrendLineChart, AgentSharePieChart } from './Charts';
import DataTable from './DataTable';

const TABS = [
  { id: 'bar', label: 'Por mes', Icon: BarChart2 },
  { id: 'line', label: 'Tendencia', Icon: TrendingUp },
  { id: 'pie', label: 'Distribución', Icon: PieChart },
  { id: 'table', label: 'Tabla', Icon: Table },
];

export default function Dashboard() {
  const { data, addAgent, removeAgent, addRecord, deleteRecord } = useStorage();
  const [tab, setTab] = useState('bar');

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">Copilot Credits Dashboard</h1>
          <p className="dash-subtitle">Control de créditos por agente — seguimiento mensual</p>
        </div>
      </header>

      <KpiCards records={data.records} agents={data.agents} />

      <div className="two-col">
        <AgentManager agents={data.agents} onAdd={addAgent} onRemove={removeAgent} />
        <RecordForm agents={data.agents} onAdd={addRecord} />
      </div>

      <div className="card chart-card">
        <div className="tab-bar">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === 'bar' && (
          <>
            <h2 className="section-title">Créditos por agente y mes</h2>
            <CreditsPerMonthChart records={data.records} agents={data.agents} />
          </>
        )}
        {tab === 'line' && (
          <>
            <h2 className="section-title">Tendencia mensual de créditos</h2>
            <TrendLineChart records={data.records} agents={data.agents} />
          </>
        )}
        {tab === 'pie' && (
          <>
            <h2 className="section-title">Distribución total de créditos por agente</h2>
            <AgentSharePieChart records={data.records} agents={data.agents} />
          </>
        )}
        {tab === 'table' && (
          <DataTable records={data.records} onDelete={deleteRecord} />
        )}
      </div>
    </div>
  );
}
