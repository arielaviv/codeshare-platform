import type { StatElement as StatElementType } from '../../../types/deck';

interface Props {
  element: StatElementType;
  accentColor: string;
  textColor: string;
  textMuted: string;
}

export default function StatElement({ element, accentColor, textColor, textMuted }: Props) {
  const trendSymbol = element.trend === 'up' ? '▲' : element.trend === 'down' ? '▼' : null;
  const trendColor = element.trend === 'down' ? '#DC2626' : '#16A34A';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 200,
          fontWeight: 700,
          color: accentColor,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {element.value}
        {trendSymbol && (
          <span style={{ fontSize: 80, marginLeft: 24, color: trendColor }}>{trendSymbol}</span>
        )}
      </div>
      <div style={{ fontSize: 36, fontWeight: 400, color: textColor, marginTop: 32 }}>
        {element.label}
      </div>
      {element.caption && (
        <div style={{ fontSize: 24, color: textMuted, marginTop: 16 }}>{element.caption}</div>
      )}
    </div>
  );
}
