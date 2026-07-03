export type TabId = 'summary' | 'staff' | 'losses' | 'clients';

export function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  const tabs: [TabId, string][] = [
    ['summary', 'Сводка'],
    ['staff', 'Мастера'],
    ['losses', 'Потери'],
    ['clients', 'Клиенты'],
  ];
  return (
    <nav className="tab-bar">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          className={`tab-bar__item${active === id ? ' active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
