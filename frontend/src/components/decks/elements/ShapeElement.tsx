import type { ShapeElement as ShapeElementType } from '../../../types/deck';

interface Props {
  element: ShapeElementType;
}

export default function ShapeElement({ element }: Props) {
  if (element.shape === 'line') {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${element.w} ${element.h}`} preserveAspectRatio="none">
        <line
          x1={0}
          y1={element.h / 2}
          x2={element.w}
          y2={element.h / 2}
          stroke={element.fill}
          strokeWidth={element.strokeWidth || 4}
        />
      </svg>
    );
  }

  const radius =
    element.shape === 'circle' ? '50%' : element.borderRadius ? `${element.borderRadius}px` : '0';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: element.fill,
        borderRadius: radius,
        border: element.stroke ? `${element.strokeWidth || 2}px solid ${element.stroke}` : 'none',
      }}
    />
  );
}
