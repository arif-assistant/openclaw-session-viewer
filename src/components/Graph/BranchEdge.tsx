// ── BranchEdge — Custom React Flow edge ──────────────────────────────
//
// Renders edges between nodes using a smooth bezier curve.

import { memo } from 'react';
import {
  type EdgeProps,
  getSmoothStepPath,
  BaseEdge,
} from '@xyflow/react';

function BranchEdgeComponent(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    style,
    markerEnd,
  } = props;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: '#4b5563',
        strokeWidth: 1.5,
        ...style,
      }}
    />
  );
}

export const BranchEdge = memo(BranchEdgeComponent);
