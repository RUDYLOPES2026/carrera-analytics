import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getAttributionAnalysis } from "../attribution_analysis";
import { getServerAttributionData } from "../server_attribution_db";
import {
  getRealtimeUsers,
  getSessionsByDay,
  getSessionsByHour,
  getTrafficSources,
  getDeviceDistribution,
  getKeyMetrics,
  getTopPages,
  searchPages,
  getPeriodComparison,
  getSectionAnalysis,
  getDayHistory,
  getSessionsByDayComparison,
  getLeadsAnalysis,
  getLeadsComparison,
  getURLMonitor,
  getUTMAnalysis,
  getComparisonDetails,
  getTVCampaignData,
  getTVLeadsData,
  getGWMCampaignData,
  getGWMJunCampaignData,
  // LPs
  getLPsRealtimeUsers,
  getLPsKeyMetrics,
  getLPsSessionsByDay,
  getLPsTrafficSources,
  getLPsDeviceDistribution,
  getLPsTopPages,
  searchLPsPages,
  getLPsPeriodComparison,
  getLPsComparisonDetails,
  getLPsAllPagesMetrics,
  getLPsPageUTMs,
  getLPsPageSessionsByDay,
  getLPsSummaryMetrics,
  getLPsGroupedByBrand,
  getLPsUTMAnalysis,
  getLPsDayHistory,
  getLPsSessionsByDayComparison,
  getDayDiagnosis,
  LP_PAGES,
  getUtmDimensions,
  getKeyMetricsFiltered,
  getSessionsByDayFiltered,
  getSessionsByHourFiltered,
  getTrafficSourcesFiltered,
  getDeviceDistributionFiltered,
  getTopPagesFiltered,
} from "../analytics";

const periodSchema = z.enum(["today", "yesterday", "7days", "15days", "30days", "90days", "custom"]).default("30days");

// Input schema that supports both preset periods and custom date ranges
const periodInput = z.object({
  period: periodSchema,
  customStart: z.string().optional(), // YYYY-MM-DD
  customEnd: z.string().optional(),   // YYYY-MM-DD
});

// Input schema with optional overview filters (URL + UTM)
const periodInputWithFilters = periodInput.extend({
  urlFilter: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

export const analyticsRouter = router({
  realtimeUsers: publicProcedure.query(async () => {
    return getRealtimeUsers();
  }),

  sessionsByDay: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getSessionsByDay(input.period, input.customStart, input.customEnd);
    }),

  sessionsByHour: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getSessionsByHour(input.period, input.customStart, input.customEnd);
    }),

  trafficSources: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getTrafficSources(input.period, input.customStart, input.customEnd);
    }),

  deviceDistribution: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getDeviceDistribution(input.period, input.customStart, input.customEnd);
    }),

  keyMetrics: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getKeyMetrics(input.period, input.customStart, input.customEnd);
    }),

  topPages: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getTopPages(input.period, input.customStart, input.customEnd);
    }),

  searchPages: publicProcedure
    .input(periodInput.extend({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      return searchPages(input.query, input.period, input.customStart, input.customEnd);
    }),

  periodComparison: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getPeriodComparison(input.period, input.customStart, input.customEnd);
    }),

  sectionAnalysis: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getSectionAnalysis(input.period, input.customStart, input.customEnd);
    }),

  dayHistory: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getDayHistory(input.period, input.customStart, input.customEnd);
    }),

  sessionsByDayComparison: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getSessionsByDayComparison(input.period, input.customStart, input.customEnd);
    }),

  leadsAnalysis: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLeadsAnalysis(input.period, input.customStart, input.customEnd);
    }),

  leadsComparison: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLeadsComparison(input.period, input.customStart, input.customEnd);
    }),

  urlMonitor: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getURLMonitor(input.period, input.customStart, input.customEnd);
    }),

  utmAnalysis: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getUTMAnalysis(input.period, input.customStart, input.customEnd);
    }),

  comparisonDetails: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getComparisonDetails(input.period, input.customStart, input.customEnd);
    }),

  tvCampaign: publicProcedure
    .query(async () => {
      return getTVCampaignData();
    }),

  tvLeads: publicProcedure
    .input(z.object({ brand: z.string().optional() }))
    .query(({ input }) => {
      return getTVLeadsData(input.brand);
    }),

  gwmCampaign: publicProcedure.query(async () => {
    return getGWMCampaignData();
  }),

  gwmJunCampaign: publicProcedure.query(async () => {
    return getGWMJunCampaignData();
  }),

  // ─── Carrera LPs (property 503617174) ────────────────────────────────────

  lpsRealtimeUsers: publicProcedure.query(async () => {
    return getLPsRealtimeUsers();
  }),

  lpsKeyMetrics: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLPsKeyMetrics(input.period, input.customStart, input.customEnd);
    }),

  lpsSessionsByDay: publicProcedure
    .input(periodInput.extend({ brandOrPath: z.string().optional() }))
    .query(async ({ input }) => {
      return getLPsSessionsByDay(input.period, input.customStart, input.customEnd, input.brandOrPath);
    }),

  lpsTrafficSources: publicProcedure
    .input(periodInput.extend({ brandOrPath: z.string().optional() }))
    .query(async ({ input }) => {
      return getLPsTrafficSources(input.period, input.customStart, input.customEnd, input.brandOrPath);
    }),

  lpsDeviceDistribution: publicProcedure
    .input(periodInput.extend({ brandOrPath: z.string().optional() }))
    .query(async ({ input }) => {
      return getLPsDeviceDistribution(input.period, input.customStart, input.customEnd, input.brandOrPath);
    }),

  lpsTopPages: publicProcedure
    .input(periodInput.extend({ brandOrPath: z.string().optional() }))
    .query(async ({ input }) => {
      return getLPsTopPages(input.period, input.customStart, input.customEnd, input.brandOrPath);
    }),

  searchLpsPages: publicProcedure
    .input(periodInput.extend({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      return searchLPsPages(input.query, input.period, input.customStart, input.customEnd);
    }),

  lpsPeriodComparison: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLPsPeriodComparison(input.period, input.customStart, input.customEnd);
    }),

  lpsComparisonDetails: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLPsComparisonDetails(input.period, input.customStart, input.customEnd);
    }),

  // Visão por LP individual
  lpsAllPages: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLPsAllPagesMetrics(input.period, input.customStart, input.customEnd);
    }),

  lpsSummary: publicProcedure
    .input(periodInput.extend({ brandOrPath: z.string().optional() }))
    .query(async ({ input }) => {
      return getLPsSummaryMetrics(input.period, input.customStart, input.customEnd, input.brandOrPath);
    }),

  lpsPageUTMs: publicProcedure
    .input(periodInput.extend({ page: z.string().min(1) }))
    .query(async ({ input }) => {
      return getLPsPageUTMs(input.page, input.period, input.customStart, input.customEnd);
    }),

  lpsPageSessionsByDay: publicProcedure
    .input(periodInput.extend({ page: z.string().min(1) }))
    .query(async ({ input }) => {
      return getLPsPageSessionsByDay(input.page, input.period, input.customStart, input.customEnd);
    }),

  lpsPageList: publicProcedure.query(() => LP_PAGES),
  lpsGroupedByBrand: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLPsGroupedByBrand(input.period, input.customStart, input.customEnd);
    }),
  lpsUTMAnalysis: publicProcedure
    .input(periodInput.extend({ brand: z.string().optional() }))
    .query(async ({ input }) => {
      return getLPsUTMAnalysis(input.period, input.customStart, input.customEnd, input.brand);
    }),
  lpsDayHistory: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLPsDayHistory(input.period, input.customStart, input.customEnd);
    }),
  lpsSessionsByDayComparison: publicProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      return getLPsSessionsByDayComparison(input.period, input.customStart, input.customEnd);
    }),

  dayDiagnosis: publicProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(async ({ input }) => {
      return getDayDiagnosis(input.date);
    }),

  attributionAnalysis: publicProcedure.query(async () => {
    return getAttributionAnalysis();
  }),
  serverAttributionData: publicProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ input, ctx }) => {
      return getServerAttributionData(ctx.env?.DB ?? null, input.days);
    }),

  // ─── Overview Filters ────────────────────────────────────────────────────

  utmDimensions: publicProcedure
    .input(periodInput.extend({
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return getUtmDimensions(input.period, input.customStart, input.customEnd, input.utmSource, input.utmMedium);
    }),

  keyMetricsFiltered: publicProcedure
    .input(periodInputWithFilters)
    .query(async ({ input }) => {
      return getKeyMetricsFiltered(input.period, input.customStart, input.customEnd, {
        urlFilter: input.urlFilter, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
      });
    }),

  sessionsByDayFiltered: publicProcedure
    .input(periodInputWithFilters)
    .query(async ({ input }) => {
      return getSessionsByDayFiltered(input.period, input.customStart, input.customEnd, {
        urlFilter: input.urlFilter, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
      });
    }),

  sessionsByHourFiltered: publicProcedure
    .input(periodInputWithFilters)
    .query(async ({ input }) => {
      return getSessionsByHourFiltered(input.period, input.customStart, input.customEnd, {
        urlFilter: input.urlFilter, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
      });
    }),

  trafficSourcesFiltered: publicProcedure
    .input(periodInputWithFilters)
    .query(async ({ input }) => {
      return getTrafficSourcesFiltered(input.period, input.customStart, input.customEnd, {
        urlFilter: input.urlFilter, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
      });
    }),

  deviceDistributionFiltered: publicProcedure
    .input(periodInputWithFilters)
    .query(async ({ input }) => {
      return getDeviceDistributionFiltered(input.period, input.customStart, input.customEnd, {
        urlFilter: input.urlFilter, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
      });
    }),

  topPagesFiltered: publicProcedure
    .input(periodInputWithFilters)
    .query(async ({ input }) => {
      return getTopPagesFiltered(input.period, input.customStart, input.customEnd, {
        urlFilter: input.urlFilter, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
      });
    }),
});
