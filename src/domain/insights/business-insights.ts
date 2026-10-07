// BeautIzzy — Business insights (« Tops & tendances ») — pure
//
// Read-only statistics of ONE civil period, derived on demand from the
// existing records. Nothing is stored, cached or projected. Two concepts stay
// apart and are never mixed into one number:
//
//   A. MONEY RECEIVED — by PAYMENT date
//      cashCollected            THE Cash Register selection and arithmetic
//                               (`getCashRegisterIntervalSummary`): final
//                               checkouts, standalone Sale payments and ACTIVE
//                               deposits, each on its own `paidAt`. A VOIDED
//                               deposit counts nowhere. A deposit kept on a
//                               CANCELLED / NO_SHOW Appointment is still money
//                               received.
//
//   B. BUSINESS ACTIVITY — by APPOINTMENT date (`startAt`)
//      completed Appointments   status COMPLETED (explicit checkout, prepaid
//                               completion, or the automatic past-day
//                               completion) and `startAt` in the period.
//                               SCHEDULED, CONFIRMED, IN_PROGRESS, CANCELLED and
//                               NO_SHOW are not activity, whatever was paid.
//      appointment value        `getAppointmentExpectedTotal` — services net of
//                               the discount + Sales sold during the Appointment,
//                               exactly the value « Résumé du jour » averages.
//                               Deposits are a way of paying it, never extra value.
//      averageAppointmentValue  Σ appointment values / completed count, rounded
//                               to the cent; 0 without completed Appointments.
//      client spending          THE Client « Total dépensé » rule, scoped to the
//                               period: services net of the discount
//                               (`getAppointmentServicesTotal`) of COMPLETED
//                               Appointments. No product Sale, no deposit.
//      top services             AppointmentItem snapshots of the completed
//                               Appointments, one item = one performance.
//
//   C. PRODUCTS SOLD — by SALE date (`completedAt`)
//      every Sale, standalone or sold during an Appointment, counted once per
//      line from its snapshot (product name, quantity).
//
// Rankings keep at most three rows, never pad, and break every tie
// deterministically. Names shown are the snapshot of the most recent
// occurrence INSIDE the period, so renaming a Service or Product today never
// rewrites what an older period calls it.
//
// Financial conflicts: an Appointment of the period whose ACTIVE deposits
// exceed its expected total (`findAppointmentDepositInvariantBreach`). By that
// rule a COMPLETED Appointment is never a conflict, so a conflicting
// Appointment is never activity and none of its value is counted; its deposits,
// being real money received, stay in the cash total exactly as in the Caisse.
// Only their number is reported. Nothing is repaired or normalised.
//
// Calendar Blocks are never an input.

import {
  findAppointmentDepositInvariantBreach,
  getAppointmentExpectedTotal,
  getAppointmentServicesTotal,
  type Appointment,
  type AppointmentDeposit,
} from '../appointments';
import { getCashRegisterIntervalSummary, type CashRegisterSummary } from '../cash-register';
import type { Sale } from '../sales';
import { isWithinInsightsPeriod, type InsightsPeriod } from './period';

/** Rankings show at most this many rows. */
export const INSIGHTS_RANKING_SIZE = 3;

export interface BusinessInsightsSources {
  readonly appointments: readonly Appointment[];
  readonly sales: readonly Sale[];
  /** Every deposit; only ACTIVE ones are money. Absent = none. */
  readonly deposits?: readonly AppointmentDeposit[];
}

export interface ServiceRankingRow {
  readonly serviceId: string;
  /** Snapshot name of the most recent completed occurrence in the period. */
  readonly serviceName: string;
  readonly count: number;
}

export interface ProductRankingRow {
  readonly productId: string;
  /** Snapshot name of the most recent sale line in the period. */
  readonly productName: string;
  readonly unitCount: number;
}

export interface ClientRankingRow {
  readonly clientId: string;
  /** Period « Total dépensé »: services net of discount, COMPLETED only. */
  readonly spendingCents: number;
  readonly completedAppointmentCount: number;
}

export interface BusinessInsights {
  readonly period: InsightsPeriod;
  /** Money received in the period: the Cash Register summary of the same span. */
  readonly cash: CashRegisterSummary;
  readonly completedAppointmentCount: number;
  /** Σ expected totals of the completed Appointments. */
  readonly completedAppointmentValueCents: number;
  readonly averageAppointmentValueCents: number;
  readonly soldProductUnitCount: number;
  readonly topServices: readonly ServiceRankingRow[];
  readonly topProducts: readonly ProductRankingRow[];
  readonly topSpendingClients: readonly ClientRankingRow[];
  readonly topLoyalClients: readonly ClientRankingRow[];
  /** Appointments of the period with an unresolved deposit invariant breach. */
  readonly financialConflictCount: number;
  /** Nothing received, nothing completed, nothing sold. */
  readonly isEmpty: boolean;
}

function groupBy<Item>(items: readonly Item[], keyOf: (item: Item) => string | undefined) {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined) continue;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

const collator = new Intl.Collator('fr-FR', { sensitivity: 'base' });

/** Stable, total order on (label, id) — the last tie-breaker of every ranking. */
function compareLabelThenId(aLabel: string, aId: string, bLabel: string, bId: string): number {
  return collator.compare(aLabel, bLabel) || (aId < bId ? -1 : aId > bId ? 1 : 0);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface RankedName {
  count: number;
  name: string;
  /** Instant of the occurrence the name was read from. */
  latestAt: number;
}

/** Counts one occurrence and keeps the name of the most recent one. */
function tally(map: Map<string, RankedName>, id: string, name: string, at: number, amount: number) {
  const current = map.get(id);
  if (!current) {
    map.set(id, { count: amount, name, latestAt: at });
    return;
  }
  current.count += amount;
  if (at > current.latestAt) {
    current.name = name;
    current.latestAt = at;
  }
}

export function getBusinessInsights(
  sources: BusinessInsightsSources,
  period: InsightsPeriod,
): BusinessInsights {
  const deposits = sources.deposits ?? [];
  const cash = getCashRegisterIntervalSummary(
    { appointments: sources.appointments, sales: sources.sales, deposits },
    period,
  );

  // One pass to index the related records: no lookup scans every Sale.
  const salesByAppointment = groupBy(sources.sales, (sale) => sale.appointmentId);
  const depositsByAppointment = groupBy(deposits, (deposit) => deposit.appointmentId);
  const linkedSalesOf = (appointment: Appointment) => salesByAppointment.get(appointment.id) ?? [];

  const services = new Map<string, RankedName>();
  const clients = new Map<string, { spendingCents: number; completedAppointmentCount: number }>();
  let completedAppointmentCount = 0;
  let completedAppointmentValueCents = 0;
  let financialConflictCount = 0;

  for (const appointment of sources.appointments) {
    if (!isWithinInsightsPeriod(period, appointment.startAt)) continue;

    if (appointment.status !== 'COMPLETED') {
      if (
        findAppointmentDepositInvariantBreach(
          appointment,
          linkedSalesOf(appointment),
          depositsByAppointment.get(appointment.id) ?? [],
        )
      ) {
        financialConflictCount += 1;
      }
      continue;
    }

    completedAppointmentCount += 1;
    completedAppointmentValueCents += getAppointmentExpectedTotal(
      appointment,
      linkedSalesOf(appointment),
    ).expectedTotalCents;

    const client = clients.get(appointment.clientId) ?? { spendingCents: 0, completedAppointmentCount: 0 };
    client.spendingCents += getAppointmentServicesTotal(appointment).netCents;
    client.completedAppointmentCount += 1;
    clients.set(appointment.clientId, client);

    for (const item of appointment.items) {
      tally(services, item.serviceId, item.serviceName, appointment.startAt.getTime(), 1);
    }
  }

  const products = new Map<string, RankedName>();
  let soldProductUnitCount = 0;
  for (const sale of sources.sales) {
    if (!isWithinInsightsPeriod(period, sale.completedAt)) continue;
    for (const item of sale.items) {
      tally(products, item.productId, item.productName, sale.completedAt.getTime(), item.quantity);
      soldProductUnitCount += item.quantity;
    }
  }

  const topServices = [...services.entries()]
    .sort(
      ([aId, a], [bId, b]) => b.count - a.count || compareLabelThenId(a.name, aId, b.name, bId),
    )
    .slice(0, INSIGHTS_RANKING_SIZE)
    .map(([serviceId, { name, count }]) => ({ serviceId, serviceName: name, count }));

  const topProducts = [...products.entries()]
    .sort(
      ([aId, a], [bId, b]) => b.count - a.count || compareLabelThenId(a.name, aId, b.name, bId),
    )
    .slice(0, INSIGHTS_RANKING_SIZE)
    .map(([productId, { name, count }]) => ({ productId, productName: name, unitCount: count }));

  const clientRows: ClientRankingRow[] = [...clients.entries()].map(([clientId, client]) => ({
    clientId,
    ...client,
  }));

  const topSpendingClients = clientRows
    .filter((row) => row.spendingCents > 0)
    .sort(
      (a, b) =>
        b.spendingCents - a.spendingCents ||
        b.completedAppointmentCount - a.completedAppointmentCount ||
        compareIds(a.clientId, b.clientId),
    )
    .slice(0, INSIGHTS_RANKING_SIZE);

  const topLoyalClients = [...clientRows]
    .sort(
      (a, b) =>
        b.completedAppointmentCount - a.completedAppointmentCount ||
        b.spendingCents - a.spendingCents ||
        compareIds(a.clientId, b.clientId),
    )
    .slice(0, INSIGHTS_RANKING_SIZE);

  return {
    period,
    cash,
    completedAppointmentCount,
    completedAppointmentValueCents,
    averageAppointmentValueCents:
      completedAppointmentCount === 0
        ? 0
        : Math.round(completedAppointmentValueCents / completedAppointmentCount),
    soldProductUnitCount,
    topServices,
    topProducts,
    topSpendingClients,
    topLoyalClients,
    financialConflictCount,
    isEmpty: cash.checkoutCount === 0 && completedAppointmentCount === 0 && soldProductUnitCount === 0,
  };
}
