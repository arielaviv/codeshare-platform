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
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { ChartElement as ChartElementType } from '../../../types/deck';

interface Props {
  element: ChartElementType;
}

const PIE_FALLBACK_COLORS = ['#2563EB', '#14B8A6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#10B981'];

export default function ChartElement({ element }: Props) {
  const accent = element.accentColor || '#2563EB';

  if (element.chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={element.data} margin={{ top: 16, right: 24, left: 24, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
          <XAxis dataKey="label" stroke="#525252" fontSize={18} />
          <YAxis stroke="#525252" fontSize={18} />
          <Tooltip />
          <Bar dataKey="value" fill={accent} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (element.chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={element.data} margin={{ top: 16, right: 24, left: 24, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
          <XAxis dataKey="label" stroke="#525252" fontSize={18} />
          <YAxis stroke="#525252" fontSize={18} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={3} dot={{ fill: accent }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // pie
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={element.data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius="70%"
          label
        >
          {element.data.map((_, i) => (
            <Cell key={i} fill={i === 0 ? accent : PIE_FALLBACK_COLORS[i % PIE_FALLBACK_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
