import { useState } from 'react';

const STORAGE_KEY = 'copilot_credits_data';

const defaultData = {
  agents: [],
  records: [],
};

export function useStorage() {
  const [data, setData] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultData;
    } catch {
      return defaultData;
    }
  });

  const save = (newData) => {
    setData(newData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  };

  const addAgent = (name) => {
    if (data.agents.includes(name)) return false;
    save({ ...data, agents: [...data.agents, name] });
    return true;
  };

  const removeAgent = (name) => {
    save({
      agents: data.agents.filter((a) => a !== name),
      records: data.records.filter((r) => r.agent !== name),
    });
  };

  const addRecord = (record) => {
    const exists = data.records.find(
      (r) => r.agent === record.agent && r.month === record.month
    );
    if (exists) {
      save({
        ...data,
        records: data.records.map((r) =>
          r.agent === record.agent && r.month === record.month ? record : r
        ),
      });
    } else {
      save({ ...data, records: [...data.records, record] });
    }
  };

  const deleteRecord = (agent, month) => {
    save({
      ...data,
      records: data.records.filter(
        (r) => !(r.agent === agent && r.month === month)
      ),
    });
  };

  return { data, addAgent, removeAgent, addRecord, deleteRecord };
}
