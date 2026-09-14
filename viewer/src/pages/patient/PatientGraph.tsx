import { useMemo } from 'react';
import { IconRobot } from '@tabler/icons-react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { isAiLabeled, labelKind } from '../../ai/labels';
import { referenceKey } from '../../ai/provenance';
import { resourceKey, type ResourceAnnotation } from '../../components/ResourceTable';

const NODE_WIDTH = 190;
const NODE_HEIGHT = 70;
const RING_CAPACITY = 10;
const RING_RADIUS = 400;
const RING_GAP = 280;

type GraphNodeData = {
  resourceType: string;
  shortId: string;
  fullReference: string;
  aiKind?: ReturnType<typeof labelKind>;
  humanVerified: boolean;
  isPatient: boolean;
};

type GraphNode = Node<GraphNodeData, 'resource'>;

const nodeTypes = { resource: GraphResourceNode };

export default function PatientGraph({
  resources,
  annotations,
  onSelect,
}: {
  resources: fhir4.Resource[];
  annotations: Map<string, ResourceAnnotation>;
  onSelect: (resource: fhir4.Resource) => void;
}) {
  const { nodes, edges } = useMemo(
    () => buildGraph(resources, annotations),
    [annotations, resources],
  );
  return (
    <div className="patient-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.2, maxZoom: 1.1 }}
        minZoom={0.12}
        maxZoom={1.5}
        onNodeClick={(_event, node) => {
          const resource = resources.find((candidate) => resourceKey(candidate) === node.id);
          if (resource) onSelect(resource);
        }}
      >
        <Background gap={24} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function GraphResourceNode({ data }: NodeProps<GraphNode>) {
  return (
    <div
      className={`patient-graph-node${data.isPatient ? ' patient-graph-node--patient' : ''}${data.aiKind ? ' patient-graph-node--ai' : ''}`}
      title={data.fullReference}
      aria-label={data.fullReference}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      {data.aiKind && (
        <div
          className="patient-graph-ai-indicator"
          title={aiLabelDescription(data.aiKind)}
          aria-label={aiLabelDescription(data.aiKind)}
        >
          <IconRobot size={26} stroke={2.4} />
          <span>AI</span>
        </div>
      )}
      <div className="patient-graph-node__type">{data.resourceType}</div>
      <div className="patient-graph-node__id">{data.shortId}</div>
      {data.aiKind && (
        <div className="patient-graph-node__label">
          {data.aiKind}
          {data.humanVerified ? ' · verified' : ''}
        </div>
      )}
    </div>
  );
}

export function buildGraph(
  resources: fhir4.Resource[],
  annotations: Map<string, ResourceAnnotation>,
): { nodes: GraphNode[]; edges: Edge[] } {
  const ids = new Set(resources.map(resourceKey));
  const edges: Edge[] = [];
  const relatedToPatient = new Set<string>();
  const patient = resources.find((resource) => resource.resourceType === 'Patient');
  const patientId = patient ? resourceKey(patient) : undefined;

  for (const resource of resources) {
    const source = resourceKey(resource);
    for (const reference of references(resource)) {
      const target = referenceKey(reference);
      if (!target || !ids.has(target)) continue;
      const edgeId = `${source}->${target}`;
      if (!edges.some((edge) => edge.id === edgeId))
        edges.push({ id: edgeId, source, target, animated: false });
      if (patientId && (source === patientId || target === patientId)) {
        if (source !== patientId) relatedToPatient.add(source);
        if (target !== patientId) relatedToPatient.add(target);
      }
    }
  }

  const others = resources
    .filter((resource) => resourceKey(resource) !== patientId)
    .sort((left, right) => {
      const leftRelated = relatedToPatient.has(resourceKey(left)) ? 0 : 1;
      const rightRelated = relatedToPatient.has(resourceKey(right)) ? 0 : 1;
      return (
        leftRelated - rightRelated ||
        left.resourceType.localeCompare(right.resourceType) ||
        (left.id ?? '').localeCompare(right.id ?? '')
      );
    });
  const positions = new Map<string, { x: number; y: number }>();
  if (patientId) positions.set(patientId, { x: -NODE_WIDTH / 2, y: -NODE_HEIGHT / 2 });
  others.forEach((resource, index) => {
    const ring = Math.floor(index / RING_CAPACITY) + 1;
    const indexInRing = index % RING_CAPACITY;
    const remaining = others.length - (ring - 1) * RING_CAPACITY;
    const countInRing = Math.min(RING_CAPACITY, remaining);
    const angle = -Math.PI / 2 + (indexInRing / countInRing) * Math.PI * 2;
    const radius = RING_RADIUS + (ring - 1) * RING_GAP;
    positions.set(resourceKey(resource), {
      x: Math.cos(angle) * radius - NODE_WIDTH / 2,
      y: Math.sin(angle) * radius - NODE_HEIGHT / 2,
    });
  });

  const nodes: GraphNode[] = resources.map((resource) => {
    const id = resourceKey(resource);
    const annotation = annotations.get(id);
    const isPatient = id === patientId;
    const aiKind =
      annotation && isAiLabeled(annotation.label) ? labelKind(annotation.label) : undefined;
    const shortId = resource.id
      ? `${resource.id.slice(0, 12)}${resource.id.length > 12 ? '…' : ''}`
      : 'unknown';
    return {
      id,
      position: positions.get(id) ?? { x: 0, y: 0 },
      data: {
        resourceType: resource.resourceType,
        shortId,
        fullReference: id,
        aiKind,
        humanVerified: annotation?.humanVerified ?? false,
        isPatient,
      },
      type: 'resource',
      style: { width: NODE_WIDTH, height: NODE_HEIGHT },
    };
  });
  return { nodes, edges };
}

function aiLabelDescription(kind: ReturnType<typeof labelKind>): string {
  if (kind === 'resource') return 'AI-labeled resource';
  if (kind === 'partial') return 'AI-labeled inline element(s)';
  if (kind === 'both') return 'AI-labeled resource and inline element(s)';
  return 'Not AI-labeled';
}

function references(resource: fhir4.Resource): string[] {
  const values: string[] = [];
  walk(resource, values);
  return values;
}

function walk(value: unknown, values: string[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, values));
    return;
  }
  const object = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(object)) {
    if (key === 'contained') continue;
    if (key === 'reference' && typeof child === 'string') values.push(child);
    else walk(child, values);
  }
}
