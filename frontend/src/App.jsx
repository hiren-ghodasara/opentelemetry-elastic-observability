import React, { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const styles = {
  app: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', padding: '20px' },
  header: { textAlign: 'center', padding: '30px 0 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '30px' },
  title: { fontSize: '2.5rem', fontWeight: '700', background: 'linear-gradient(90deg, #c8960c, #f0c040)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' },
  subtitle: { color: '#888', fontSize: '0.95rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', maxWidth: '1400px', margin: '0 auto' },
  card: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px', backdropFilter: 'blur(10px)' },
  cardTitle: { fontSize: '1.1rem', fontWeight: '600', color: '#f0c040', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' },
  btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem', transition: 'all 0.2s', margin: '4px' },
  btnPrimary: { background: '#c8960c', color: '#000' },
  btnDanger: { background: '#e74c3c', color: '#fff' },
  btnWarning: { background: '#f39c12', color: '#000' },
  btnInfo: { background: '#3498db', color: '#fff' },
  btnGray: { background: '#2d2d2d', color: '#fff', border: '1px solid #555' },
  result: { marginTop: '15px', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto' },
  status: { padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600' },
  statusOk: { background: 'rgba(46, 213, 115, 0.2)', color: '#2ed573' },
  statusError: { background: 'rgba(231, 76, 60, 0.2)', color: '#e74c3c' },
  statusLoading: { background: 'rgba(52, 152, 219, 0.2)', color: '#3498db' },
  menuItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  menuName: { color: '#ddd', fontSize: '0.9rem' },
  menuPrice: { color: '#f0c040', fontWeight: '600' },
  tag: { display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', margin: '2px', background: 'rgba(255,255,255,0.1)' },
  log: { padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.78rem', color: '#aaa' },
  tip: { padding: '8px 12px', background: 'rgba(200, 150, 12, 0.1)', border: '1px solid rgba(200,150,12,0.3)', borderRadius: '6px', margin: '6px 0', fontSize: '0.8rem', color: '#d4ac2a' },
  kibanaLink: { display: 'inline-block', padding: '8px 14px', background: 'rgba(0,168,255,0.15)', border: '1px solid #00a8ff', borderRadius: '6px', color: '#00a8ff', textDecoration: 'none', fontSize: '0.85rem', margin: '4px' },
  activityLog: { maxHeight: '250px', overflowY: 'auto' },
};

function useApi() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const call = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    const start = Date.now();
    try {
      const res = await fetch(`${API}${url}`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-user-1', ...options.headers },
        ...options,
      });
      const data = await res.json();
      const duration = Date.now() - start;
      setResult({ data, status: res.status, ok: res.ok, duration });
      return { data, status: res.status, ok: res.ok };
    } catch (err) {
      setError(err.message);
      setResult({ error: err.message, status: 0, ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading, result, error };
}

function ResultBox({ result, loading }) {
  if (loading) return <div style={{ ...styles.result, color: '#3498db' }}>Loading...</div>;
  if (!result) return null;
  return (
    <div style={{ ...styles.result, borderLeft: `3px solid ${result.ok ? '#2ed573' : '#e74c3c'}` }}>
      <div style={{ marginBottom: '6px' }}>
        <span style={{ ...styles.status, ...(result.ok ? styles.statusOk : styles.statusError) }}>
          {result.status || 'ERR'}
        </span>
        {result.duration && <span style={{ color: '#888', marginLeft: '8px', fontSize: '0.75rem' }}>{result.duration}ms</span>}
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {JSON.stringify(result.data || result.error, null, 2)}
      </pre>
    </div>
  );
}

// ── Menu Panel ────────────────────────────────────────────────────────────────
function MenuPanel({ onMenuLoaded }) {
  const { call, loading, result } = useApi();
  const [menu, setMenu] = useState([]);

  const loadMenu = async () => {
    const r = await call('/menu');
    if (r?.ok) {
      setMenu(r.data);
      onMenuLoaded(r.data);
    }
  };

  useEffect(() => { loadMenu(); }, []);

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>☕ Menu</div>
      {menu.slice(0, 8).map(item => (
        <div key={item.id} style={styles.menuItem}>
          <span style={styles.menuName}>{item.name} {!item.available && <span style={{ ...styles.tag, color: '#e74c3c' }}>sold out</span>}</span>
          <span style={styles.menuPrice}>${(item.price / 100).toFixed(2)}</span>
        </div>
      ))}
      <button style={{ ...styles.btn, ...styles.btnGray, marginTop: '10px', width: '100%' }} onClick={loadMenu} disabled={loading}>
        {loading ? 'Loading...' : '↻ Refresh Menu'}
      </button>
      <ResultBox result={result} loading={loading} />
    </div>
  );
}

// ── Order Panel ───────────────────────────────────────────────────────────────
function OrderPanel({ menu, onOrderPlaced }) {
  const { call, loading, result } = useApi();
  const [lastOrderId, setLastOrderId] = useState(null);

  const placeOrder = async (itemId) => {
    const r = await call('/orders', {
      method: 'POST',
      body: JSON.stringify({ items: [{ menuItemId: itemId, quantity: 1 }] }),
    });
    if (r?.ok) {
      setLastOrderId(r.data.orderId);
      onOrderPlaced(r.data);
    }
  };

  const availableItems = menu.filter(i => i.available).slice(0, 4);

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>🛒 Place Orders</div>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '12px' }}>Each button creates a real order with full trace: auth → validate → inventory → DB insert → payment</p>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {availableItems.map(item => (
          <button key={item.id} style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => placeOrder(item.id)} disabled={loading}>
            {loading ? '...' : item.name}
          </button>
        ))}
        {availableItems.length === 0 && <span style={{ color: '#888' }}>Load menu first</span>}
      </div>
      {lastOrderId && (
        <div style={{ ...styles.tip, marginTop: '10px' }}>
          Order {lastOrderId.substring(0, 8)}... — <a href={`${API}/orders/${lastOrderId}`} target="_blank" rel="noopener noreferrer" style={{ color: '#f0c040' }}>View in API</a>
        </div>
      )}
      <ResultBox result={result} loading={loading} />
    </div>
  );
}

// ── Scenarios Panel ───────────────────────────────────────────────────────────
function ScenariosPanel({ onActivity }) {
  const { call, loading, result } = useApi();

  const scenarios = [
    { id: 'healthy',  label: 'A: Healthy',      style: styles.btnInfo,    desc: 'Clean trace, all green spans' },
    { id: 'slow',     label: 'B: Slow (3s)',     style: styles.btnWarning, desc: 'Slow DB query, high latency span' },
    { id: 'db-error', label: 'C: DB Error',      style: styles.btnDanger,  desc: 'Failed span, error in APM' },
    { id: 'timeout',  label: 'D: Timeout',       style: styles.btnDanger,  desc: 'External API timeout span' },
    { id: 'cascade',  label: 'E: Cascade',       style: styles.btnDanger,  desc: 'Multiple failures in one trace' },
  ];

  const run = async (id) => {
    onActivity(`Running scenario: ${id}`);
    const r = await call(`/scenarios/${id}`);
    onActivity(`Scenario ${id}: ${r?.ok ? 'completed' : 'error'} (${r?.status})`);
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>🎭 Observability Scenarios</div>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '12px' }}>Each scenario produces a specific observable pattern. Run one, then find it in Kibana APM.</p>
      {scenarios.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <button style={{ ...styles.btn, ...s.style, minWidth: '140px' }} onClick={() => run(s.id)} disabled={loading}>
            {s.label}
          </button>
          <span style={{ color: '#888', fontSize: '0.8rem', marginLeft: '10px' }}>{s.desc}</span>
        </div>
      ))}
      <ResultBox result={result} loading={loading} />
    </div>
  );
}

// ── Load Generator Panel ──────────────────────────────────────────────────────
function LoadPanel({ menu, onActivity }) {
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);

  const generateLoad = async (n = 10) => {
    setRunning(true);
    setCount(0);
    const availableItems = menu.filter(i => i.available);
    if (availableItems.length === 0) { setRunning(false); return; }

    for (let i = 0; i < n; i++) {
      const item = availableItems[i % availableItems.length];
      try {
        await fetch(`${API}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer demo-user-${(i % 5) + 1}` },
          body: JSON.stringify({ items: [{ menuItemId: item.id, quantity: 1 }] }),
        });
        setCount(c => c + 1);
        onActivity(`Generated order ${i + 1}/${n}`);
      } catch (e) { /* continue */ }
      await new Promise(r => setTimeout(r, 200));
    }
    setRunning(false);
  };

  const runScenarios = async () => {
    setRunning(true);
    const s = ['healthy', 'slow', 'db-error', 'timeout', 'cascade'];
    for (const sc of s) {
      onActivity(`Auto-running scenario: ${sc}`);
      await fetch(`${API}/scenarios/${sc}`).catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    }
    setRunning(false);
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>⚡ Load Generator</div>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '12px' }}>Generate traffic to populate Kibana dashboards with meaningful data.</p>
      <div>
        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => generateLoad(10)} disabled={running || menu.length === 0}>
          {running ? `${count} orders...` : '10 Orders'}
        </button>
        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => generateLoad(50)} disabled={running || menu.length === 0}>
          50 Orders
        </button>
        <button style={{ ...styles.btn, ...styles.btnWarning }} onClick={runScenarios} disabled={running}>
          All Scenarios
        </button>
      </div>
      {running && (
        <div style={{ ...styles.result, color: '#3498db' }}>
          Running... ({count} completed)
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '8px' }}>
            <div style={{ height: '100%', background: '#3498db', width: `${(count / 50) * 100}%`, borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kibana Links Panel ────────────────────────────────────────────────────────
function KibanaPanel() {
  const links = [
    { label: 'APM Services',     path: '/app/apm/services', icon: '📊' },
    { label: 'APM Transactions', path: '/app/apm/services/coffeebrew-backend/transactions', icon: '🔍' },
    { label: 'APM Errors',       path: '/app/apm/services/coffeebrew-backend/errors', icon: '🚨' },
    { label: 'APM Service Map',  path: '/app/apm/service-map', icon: '🗺️' },
    { label: 'Discover (Logs)',  path: '/app/discover', icon: '📋' },
    { label: 'Logs Explorer',    path: '/app/logs/stream', icon: '📜' },
  ];

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>🔗 Kibana Links</div>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '12px' }}>
        Kibana: <strong style={{ color: '#f0c040' }}>http://localhost:5601</strong> — elastic / changeme
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {links.map(link => (
          <a key={link.path} href={`http://localhost:5601${link.path}`} target="_blank" rel="noopener noreferrer" style={styles.kibanaLink}>
            {link.icon} {link.label}
          </a>
        ))}
      </div>
      <div style={{ marginTop: '15px' }}>
        <div style={styles.tip}>💡 Trace → Log correlation: In APM trace view, click "Logs" tab to see correlated log entries</div>
        <div style={styles.tip}>💡 Log → Trace: In Discover, click a log entry's trace.id to jump to the trace</div>
        <div style={styles.tip}>💡 Service Map: Shows all services and their relationships with latency/error indicators</div>
      </div>
    </div>
  );
}

// ── Activity Log ──────────────────────────────────────────────────────────────
function ActivityLog({ entries }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>📜 Activity Log</div>
      <div style={styles.activityLog}>
        {entries.length === 0 && <div style={{ color: '#555', fontSize: '0.85rem' }}>No activity yet. Try placing an order or running a scenario.</div>}
        {[...entries].reverse().map((entry, i) => (
          <div key={i} style={styles.log}>
            <span style={{ color: '#555', marginRight: '8px' }}>{entry.time}</span>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [menu, setMenu] = useState([]);
  const [activityLog, setActivityLog] = useState([]);

  const addActivity = useCallback((message) => {
    setActivityLog(prev => [...prev.slice(-49), {
      message,
      time: new Date().toLocaleTimeString(),
    }]);
  }, []);

  const handleOrderPlaced = useCallback((order) => {
    addActivity(`Order placed: ${order.orderId?.substring(0, 8)}... ($${(order.totalCents / 100).toFixed(2)})`);
  }, [addActivity]);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>☕ CoffeeBrew</h1>
        <p style={styles.subtitle}>OpenTelemetry → Collector → Elastic APM Demo</p>
        <p style={{ color: '#555', fontSize: '0.8rem', marginTop: '4px' }}>
          Every interaction generates traces, metrics, and logs visible in Kibana
        </p>
      </header>

      <div style={styles.grid}>
        <MenuPanel onMenuLoaded={setMenu} />
        <OrderPanel menu={menu} onOrderPlaced={handleOrderPlaced} />
        <ScenariosPanel onActivity={addActivity} />
        <LoadPanel menu={menu} onActivity={addActivity} />
        <KibanaPanel />
        <ActivityLog entries={activityLog} />
      </div>
    </div>
  );
}
