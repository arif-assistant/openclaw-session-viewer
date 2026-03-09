// ── SubagentEdge — Dashed purple edge for sub-agent connections ──────

import { memo } from 'react';
import {
  type EdgeProps,
  getSmoothStepPath,
  BaseEdge,
} from '@xyflow/react';

function SubagentEdgeComponent(props: EdgeProps) {
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
        stroke: '#a855f7',
        strokeWidth: 1.5,
        strokeDasharray: '6 3',
        ...style,
      }}
    />
  );
}

export const SubagentEdge = memo(SubagentEdgeComponent);
