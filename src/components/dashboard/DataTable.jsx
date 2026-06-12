import { Trash2 } from 'lucide-react';

const monthLabel = (m) => {
  const [y, mo] = m.split('-');
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${names[Number(mo) - 1]} ${y}`;
};

export default function DataTable({ records, onDelete }) {
  const sorted = [...records].sort((a, b) => b.month.localeCompare(a.month) || a.agent.localeCompare(b.agent));

  return (
    <div className="card">
      <h2 className="section-title">Registros</h2>
      {sorted.length === 0
        ? <p className="empty-msg">Sin registros. Agrega un agente y carga datos.</p>
        : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Agente</th>
                  <th>Créditos</th>
                  <th>Interacciones</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={`${r.agent}-${r.month}`}>
                    <td>{monthLabel(r.month)}</td>
                    <td>{r.agent}</td>
                    <td className="num">{r.credits.toLocaleString()}</td>
                    <td className="num">{r.interactions != null ? r.interactions.toLocaleString() : '—'}</td>
                    <td>
                      <button className="btn-danger-sm" onClick={() => onDelete(r.agent, r.month)} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
