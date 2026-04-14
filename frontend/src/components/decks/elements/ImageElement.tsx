import type { ImageElement as ImageElementType } from '../../../types/deck';

interface Props {
  element: ImageElementType;
}

export default function ImageElement({ element }: Props) {
  return (
    <img
      src={element.src}
      alt={element.alt || ''}
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit: element.objectFit,
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    />
  );
}
