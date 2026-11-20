import { BaseApp } from '@zeppos/zml/base-app'
import { log as Logger } from '@zos/utils'

import { startKpay } from './page/support/kpay'

const logger = Logger.getLogger('tempest-app')

App(
  BaseApp({
    globalData: {},
    onCreate() {
      logger.log('app onCreate')
      // KiezelPay needs the raw message builder, so it is started here rather
      // than inside a page. If it cannot start, the weather screens carry on.
      startKpay(this)
    },
    onDestroy() {
      logger.log('app onDestroy')
    }
  })
)
