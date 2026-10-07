// Starting points for people who don't know StatFin's table names — its own
// search ranks electricity prices above the consumer price index. Each is an
// ordinary explorer URL state, so it opens exactly like a shared link. The
// ids are Statistics Finland's and get renewed now and then; a starter that
// stops resolving shows the API's error like any other table would.

import type { ExplorerState } from './urlstate'

export interface Starter {
  title: string
  /** One line on what the view shows, under the title on the landing page. */
  blurb: string
  state: ExplorerState
}

export const STARTERS: Starter[] = [
  {
    title: 'Population by municipality',
    blurb: 'Where Finns live, mapped across every municipality.',
    state: { table: 'vaerak/11ra.px', view: 'map', sel: {} },
  },
  {
    title: 'Unemployment rate by municipality',
    blurb: 'Unemployed jobseekers as a share of the workforce, monthly.',
    state: { table: 'tyonv/12tf.px', view: 'map', sel: { contentscode: ['TYOTOSUUS'] } },
  },
  {
    title: 'Median income by municipality',
    blurb: "Adults' median disposable cash income.",
    state: { table: 'tjt/14ww.px', view: 'map', sel: { contentscode: ['hkturaha18_med'] } },
  },
  {
    title: 'Apartment prices per m² by municipality',
    blurb: 'What a square metre of an old flat costs, and where.',
    state: { table: 'ashi/13mx.px', view: 'map', sel: {} },
  },
  {
    title: 'Inflation: consumer prices, annual change',
    blurb: 'Annual change in the consumer price index, monthly.',
    state: { table: 'khi/15b5.px', view: 'chart', sel: { contentscode: ['vm_khi'] } },
  },
  {
    title: 'GDP, quarterly',
    blurb: 'Gross domestic product and its supply and demand, quarterly.',
    state: { table: 'ntp/132h.px', view: 'chart', sel: {} },
  },
  {
    title: 'Greenhouse gas emissions',
    blurb: "Finland's emissions since 1990, with and without land use.",
    state: {
      table: 'khki/138v.px',
      view: 'chart',
      sel: { timeperiod_y: '*', paastoluokka_1_20150101: ['0A', '0B'] },
    },
  },
  {
    title: 'Births since 1751',
    blurb: 'Live births in Finland every year for over 270 years.',
    state: { table: 'synt/12dj.px', view: 'chart', sel: { timeperiod_y: '*' } },
  },
  {
    title: 'Life expectancy',
    blurb: 'Life expectancy at birth for men and women, since 1751.',
    state: {
      table: 'kuol/12am.px',
      view: 'chart',
      sel: { timeperiod_y: '*', sukupuoli_9_20180101: ['1', '2'] },
    },
  },
]
