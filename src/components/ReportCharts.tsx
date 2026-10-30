'use client';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#ff9800', '#4caf50', '#2196f3', '#f44336', '#9c27b0', '#00bcd4', '#ffeb3b', '#ff5722'];

export function InfractionsByTypeChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([type, count]) => ({ type, count }));
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="type" angle={-45} textAnchor="end" height={80} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#ff9800" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InfractionsByDriverChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([driver, count]) => ({ driver, count }));
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="driver" type="category" width={120} />
          <Tooltip />
          <Bar dataKey="count" fill="#4caf50" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InfractionsByMonthChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#2196f3" strokeWidth={2} dot={{ fill: '#2196f3', r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDistributionChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([status, count]) => ({ status, count }));
  const colorMap: Record<string, string> = {
    Registrada: '#ff9800',
    Pagada: '#4caf50',
    Anulada: '#999999',
  };
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(entry: any) => `${entry.status} (${entry.count})`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="count"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colorMap[entry.status] || COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FinesProgressChart({ paid, pending }: { paid: number; pending: number }) {
  const total = paid + pending;
  const paidPercent = total > 0 ? (paid / total) * 100 : 0;
  const chartData = [
    { name: 'Pagadas', value: paid },
    { name: 'Pendientes', value: pending },
  ];
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name}: $${value.toFixed(2)}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            <Cell fill="#4caf50" />
            <Cell fill="#ff9800" />
          </Pie>
          <Tooltip formatter={(value) => `$${(value as number).toFixed(2)}`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
