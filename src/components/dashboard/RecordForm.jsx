import { useState } from 'react';
import { PlusCircle } from 'lucide-react';

const currentYearMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function RecordForm({ agents, onAdd }) {
  const [form, setForm] = useState({
    agent: '',
    month: currentYearMonth(),
    credits: '',
    interactions: '',
  });
  const [msg, setMsg] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.agent || !form.month || form.credits === '') {
      setMsg('Completa agente, mes y créditos.');
      return;
    }
    onAdd({
      agent: form.agent,
      month: form.month,
      credits: Number(form.credits),
      interactions: form.interactions !== '' ? Number(form.interactions) : null,
    });
    setMsg(`Registro guardado para ${form.agent} — ${form.month}`);
    setForm((f) => ({ ...f, credits: '', interactions: '' }));
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="card">
      <h2 className="section-title">Agregar / Actualizar Registro</h2>
      <div className="form-grid">
        <div className="field">
          <label>Agente</label>
          <select className="text-input" value={form.agent} onChange={(e) => set('agent', e.target.value)}>
            <option value="">-- Seleccionar --</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Mes</label>
          <input type="month" className="text-input" value={form.month} onChange={(e) => set('month', e.target.value)} />
        </div>
        <div className="field">
          <label>Créditos consumidos</label>
          <input type="number" min="0" className="text-input" value={form.credits} onChange={(e) => set('credits', e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>Interacciones (opcional)</label>
          <input type="number" min="0" className="text-input" value={form.interactions} onChange={(e) => set('interactions', e.target.value)} placeholder="0" />
        </div>
      </div>
      <button className="btn-primary mt" onClick={handleSubmit}>
        <PlusCircle size={16} /> Guardar Registro
      </button>
      {msg && <p className="success-text">{msg}</p>}
    </div>
  );
}
