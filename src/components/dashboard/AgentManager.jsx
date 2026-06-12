import { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';

export default function AgentManager({ agents, onAdd, onRemove }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    const ok = onAdd(name);
    if (!ok) {
      setError(`El agente "${name}" ya existe`);
    } else {
      setInput('');
      setError('');
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">Agentes</h2>
      <div className="input-row">
        <input
          className="text-input"
          placeholder="Nombre del agente"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn-primary" onClick={handleAdd}>
          <UserPlus size={16} /> Agregar
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <ul className="agent-list">
        {agents.length === 0 && <li className="empty-msg">Sin agentes registrados</li>}
        {agents.map((a) => (
          <li key={a} className="agent-item">
            <span>{a}</span>
            <button className="btn-danger-sm" onClick={() => onRemove(a)} title="Eliminar agente">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
