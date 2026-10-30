// BeautIzzy — Cash Register domain public entry point
//
//   register.ts     THE selection and arithmetic of collected money (day, month,
//                   interval summaries, entries, paying clients, daily totals)
//   comparison.ts   period comparisons over that same selection (trend of the
//                   collected total, product units and direct product sales)

export type {
  CashRegisterEntry,
  CashRegisterInterval,
  CashRegisterSources,
  CashRegisterSummary,
  RecordedPayment,
} from './register';
export {
  EMPTY_CASH_REGISTER_SUMMARY,
  countCashRegisterPayingClients,
  getCashRegisterDailyTotals,
  getCashRegisterDayEntries,
  getCashRegisterDayKey,
  getCashRegisterDaySummary,
  getCashRegisterEntryClientId,
  getCashRegisterIntervalSummary,
  getCashRegisterMonthEntries,
  getCashRegisterMonthSummary,
  getCashRegisterPayments,
} from './register';
export type {
  CashRegisterComparison,
  CashRegisterComparisonOutcome,
  CashRegisterComparisonReference,
  CashRegisterComparisonUnavailableReason,
  CashRegisterMonthInsights,
  CashRegisterProductSummary,
  CashRegisterTrend,
  CashRegisterTrendDirection,
} from './comparison';
export {
  compareCashRegisterValues,
  getCashRegisterDayInterval,
  getCashRegisterDayProductSummary,
  getCashRegisterHistoryStart,
  getCashRegisterMonthComparison,
  getCashRegisterMonthInterval,
  getCashRegisterMonthInsights,
  getCashRegisterProductSummary,
  isCashRegisterIntervalCovered,
} from './comparison';
