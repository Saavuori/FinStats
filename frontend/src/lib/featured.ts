// Hand-picked "key indicators" for the landing page: the headline statistics
// people most often come looking for, each opened on a view worth seeing
// rather than the generic first-value default.
//
// Table ids and value codes are StatFin's and do change when Statistics Finland
// restructures a statistic. A stale entry degrades gracefully: the landing page
// hides cards whose table is missing from the live table list, and `pick`
// values that no longer exist fall back to the default selection.

export interface Featured {
  /** Subject folder and table id, as in the PxWeb URL. */
  path: string
  id: string
  title: string
  blurb: string
  /** Value codes to select instead of the default, keyed by variable code. */
  pick?: Record<string, string[]>
  /** How many of the latest time periods to select (default 20). */
  periods?: number
  view?: 'chart' | 'map'
}

export const FEATURED: Featured[] = [
  {
    path: 'vaerak',
    id: '11ra.px',
    title: 'An ageing country',
    blurb: 'Share of residents aged 65+, mapped by municipality.',
    // A share, not a head count: counts are so skewed towards Helsinki that the
    // linear ramp would leave the rest of the map one pale colour.
    pick: { contentscode: ['vaesto_yli64_p'] },
    view: 'map',
  },
  {
    path: 'khi',
    id: '122p.px',
    title: 'Inflation',
    blurb: 'Annual change in the consumer price index, monthly.',
    periods: 120,
  },
  {
    path: 'tyti',
    id: '135z.px',
    title: 'Unemployment rate',
    blurb: 'Labour Force Survey, seasonally adjusted and trend.',
    pick: { contentscode: ['Tyottaste_kausi', 'tyottaste_trendi'] },
    periods: 120,
  },
  {
    path: 'ntp',
    id: '132h.px',
    title: 'GDP growth',
    blurb: 'Year-on-year change in GDP volume, quarterly.',
    pick: { taloustoimi_1_20180101: ['B1GMH'], contentscode: ['vol_vv_kausitvv2015'] },
    periods: 60,
  },
  {
    path: 'ashi',
    id: '13mv.px',
    title: 'Housing prices',
    blurb: 'Price per m² of old flats: Greater Helsinki vs the rest.',
    pick: { alue_43_20220407: ['pks', 'msu'] },
    periods: 81,
  },
  {
    path: 'khki',
    id: '138v.px',
    title: 'Greenhouse gas emissions',
    blurb: "Finland's emissions since 1990, with and without land use.",
    pick: { paastoluokka_1_20150101: ['0A', '0B'] },
    periods: 40,
  },
  {
    path: 'synt',
    id: '12dj.px',
    title: 'Births',
    blurb: 'Live births every year since 1751.',
    periods: 300,
  },
  {
    path: 'kuol',
    id: '12am.px',
    title: 'Life expectancy',
    blurb: 'Life expectancy at birth for men and women, since 1751.',
    pick: { sukupuoli_9_20180101: ['1', '2'] },
    periods: 100,
  },
]
