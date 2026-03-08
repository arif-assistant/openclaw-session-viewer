// ── GraphCanvas — React Flow wrapper ─────────────────────────────────
//
// Main graph canvas component with:
//   - MiniMap
//   - Controls (zoom/fit)
//   - Keyboard navigation
//   - Custom node/edge types

import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { SessionNode } from './SessionNode';
import { BranchEdge } from './BranchEdge';

// ── Custom types registration ────────────────────────────────────────

const nodeTypes = {
  sessionNode: SessionNode,
};

const edgeTypes = {
  branchEdge: BranchEdge,
};

// ── Props ────────────────────────────────────────────────────────────

interface GraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
}

// ── Inner component (must be inside ReactFlowProvider) ───────────────

function GraphCanvasInner({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
}: GraphCanvasProps) {
  const { fitView, setViewport, getViewport } = useReactFlow();

  // Fit view when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      // Small delay to let React Flow compute positions
      const timer = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, fitView]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // Keyboard navigation: arrow keys pan the canvas
  useEffect(() => {
    const PAN_STEP = 100;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const viewport = getViewport();
      let handled = true;

      switch (e.key) {
        case 'ArrowLeft':
          setViewport({ ...viewport, x: viewport.x + PAN_STEP }, { duration: 200 });
          break;
        case 'ArrowRight':
          setViewport({ ...viewport, x: viewport.x - PAN_STEP }, { duration: 200 });
          break;
        case 'ArrowUp':
          setViewport({ ...viewport, y: viewport.y + PAN_STEP }, { duration: 200 });
          break;
        case 'ArrowDown':
          setViewport({ ...viewport, y: viewport.y - PAN_STEP }, { duration: 200 });
          break;
        default:
          handled = false;
      }

      if (handled) e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [getViewport, setViewport]);

  // Selected node styling
  const styledNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    [nodes, selectedNodeId]
  );

  // Node/edge change handlers (needed for selection state)
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // We only apply selection changes; positions are controlled by layout
      const selectionChanges = changes.filter((c) => c.type === 'select');
      if (selectionChanges.length > 0) {
        applyNodeChanges(selectionChanges, nodes);
      }
    },
    [nodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      applyEdgeChanges(changes, edges);
    },
    [edges]
  );

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{ type: 'branchEdge' }}
      proOptions={{ hideAttribution: true }}
      className="bg-surface"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#374151"
      />
      <MiniMap
        nodeColor={(node) => {
          const data = node.data as Record<string, unknown>;
          return (data?.color as string) ?? '#6b7280';
        }}
        maskColor="rgba(0, 0, 0, 0.7)"
        className="!bg-surface-secondary !border-surface-tertiary"
      />
      <Controls
        showInteractive={false}
        className="!bg-surface-secondary !border-surface-tertiary !shadow-lg [&>button]:!bg-surface-secondary [&>button]:!border-surface-tertiary [&>button]:!text-gray-400 [&>button:hover]:!bg-surface-tertiary"
      />
    </ReactFlow>
  );
}

// ── Exported wrapper with provider ───────────────────────────────────

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
