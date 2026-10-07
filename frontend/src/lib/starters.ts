// Starting points for people who don't know StatFin's table names — its own
// search ranks electricity prices above the consumer price index. Each is an
// ordinary explorer URL state, so it opens exactly like a shared link. The
// ids are Statistics Finland's and get renewed now and then; a starter that
// stops resolving shows the API's error like any other table would.

import type { ExplorerState } from './urlstate'

export interface Starter {
  title: string
  state: ExplorerState
}

export const STARTERS: Starter[] = [
  {
    title: 'Population by municipality',
    state: { table: 'vaerak/11ra.px', view: 'map', sel: {} },
  },
  {
    title: 'Unemployment rate by municipality',
    state: { table: 'tyonv/12tf.px', view: 'map', sel: { contentscode: ['TYOTOSUUS'] } },
  },
  {
    title: 'Median income by municipality',
    state: { table: 'tjt/14ww.px', view: 'map', sel: { contentscode: ['hkturaha18_med'] } },
  },
  {
    title: 'Apartment prices per m² by municipality',
    state: { table: 'ashi/13mx.px', view: 'map', sel: {} },
  },
  {
    title: 'Inflation: consumer prices, annual change',
    state: { table: 'khi/15b5.px', view: 'chart', sel: { contentscode: ['vm_khi'] } },
  },
  {
    title: 'GDP, quarterly',
    state: { table: 'ntp/132h.px', view: 'chart', sel: {} },
  },
]
