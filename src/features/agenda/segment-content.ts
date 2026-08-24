import type { AgendaStaffSegment } from './layout/agenda-staff-segments';

export type AgendaSegmentDensity = 'tall' | 'medium' | 'compact' | 'visual';

export interface AgendaSegmentContent {
  readonly mode: 'lines' | 'compact' | 'visual';
  readonly clientLabel?: string;
  readonly serviceLabel?: string;
  readonly phaseLabel?: string;
  readonly phaseOnSeparateLine: boolean;
  readonly showReprise: boolean;
  readonly compactClientLabel?: string;
  readonly compactSecondaryLabel?: string;
  readonly compactSecondaryIsReprise: boolean;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function getDistinctPhaseLabel(serviceName: string, phaseNames: readonly string[]): string | undefined {
  const serviceKey = normalizeLabel(serviceName);
  const distinctPhases = phaseNames
    .map((phaseName) => phaseName.trim())
    .filter((phaseName) => phaseName.length > 0)
    .filter((phaseName) => normalizeLabel(phaseName) !== serviceKey);

  return distinctPhases.length > 0 ? distinctPhases.join(' · ') : undefined;
}

function getCompactClientName(clientName: string): string {
  return clientName.trim().split(/\s+/)[0] ?? clientName.trim();
}

export function getAgendaSegmentDensity(height: number): AgendaSegmentDensity {
  if (height >= 56) return 'tall';
  if (height >= 32) return 'medium';
  if (height >= 16) return 'compact';
  return 'visual';
}

export function getAgendaSegmentContent(
  segment: AgendaStaffSegment,
  clientName: string,
  density: AgendaSegmentDensity,
): AgendaSegmentContent {
  const serviceLabel = segment.serviceName.trim();
  const phaseLabel = getDistinctPhaseLabel(serviceLabel, segment.phaseNames);
  const compactClientLabel = getCompactClientName(clientName);

  if (density === 'visual') {
    return {
      mode: 'visual',
      showReprise: segment.isResume,
      phaseOnSeparateLine: false,
      compactSecondaryIsReprise: false,
    };
  }

  if (density === 'compact') {
    return {
      mode: 'compact',
      showReprise: segment.isResume,
      phaseOnSeparateLine: false,
      compactClientLabel,
      compactSecondaryLabel: segment.isResume ? 'Reprise' : serviceLabel,
      compactSecondaryIsReprise: segment.isResume,
    };
  }

  return {
    mode: 'lines',
    clientLabel: clientName,
    serviceLabel,
    phaseLabel: segment.isResume && density === 'medium' ? undefined : phaseLabel,
    phaseOnSeparateLine: density === 'tall',
    showReprise: segment.isResume,
    compactSecondaryIsReprise: false,
  };
}
