// KiezelPay settings for Tempest.
//
// Product id 1477462642. It has to be written literally in the two files that
// use it -- app-side/index.js and page/support/kpay.js -- because Zeus's
// bundler drops a config that reaches those files only through an import: the
// built package then carries no product id at all and every purchase is
// attributed to product 0. Tests check both copies stay in step.
//
// This file is kept as the record of what the two copies mean.
export const kpayConfig = {
  id: 1477462642,
  trialEnabled: false,
  // false = real money. true would make kzl.io/code accept codes without
  // charging, which must never ship to the store.
  testMode: false
}

// The app is a set of four weather screens; a donation unlocks nothing, so the
// "paid features" concept is only used to decide when to show the support page.
export const KPAY_IS_DONATION = true

export function isKpayConfigured() {
  return typeof kpayConfig.id === 'number' && kpayConfig.id > 0
}
