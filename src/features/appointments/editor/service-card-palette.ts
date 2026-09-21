// Souris — Service picker card palette (DESIGN_OVERRIDES.md §22)
//
// Colour says WHAT a catalog Service is; selection only intensifies it:
//
//   SERVICE (simple service)   → mint
//   any other service type     → lavender
//
// The family comes from the Service `type` field, never from its name. A
// selected card keeps its family: stronger surface, stronger border, and a
// check badge in the family accent. Plain token lookup, no colour computed at
// runtime.

import type { ServiceType } from '@/domain/appointments';
import { serviceCardColors } from '@/shared/ui/theme';

export type ServiceCardFamily = keyof typeof serviceCardColors;

export interface ServiceCardPalette {
  readonly family: ServiceCardFamily;
  readonly background: string;
  readonly border: string;
  /** Service name. */
  readonly title: string;
  /** Duration line. */
  readonly subtitle: string;
  /** Check badge of a selected card: the family's strongest tone. */
  readonly accent: string;
}

export function getServiceCardFamily(type: ServiceType): ServiceCardFamily {
  return type === 'SERVICE' ? 'simple' : 'other';
}

export function getServiceCardPalette(type: ServiceType, selected: boolean): ServiceCardPalette {
  const family = getServiceCardFamily(type);
  const tokens = serviceCardColors[family];

  return {
    family,
    background: selected ? tokens.selectedBackground : tokens.background,
    border: selected ? tokens.selectedBorder : tokens.border,
    title: tokens.title,
    subtitle: tokens.subtitle,
    accent: tokens.selectedBorder,
  };
}
