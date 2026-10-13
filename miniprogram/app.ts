import { ensureStore } from './services/ledger'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    ensureStore()
  },
})
