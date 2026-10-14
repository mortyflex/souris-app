// BeautIzzy — the first-entry illustrations
//
// Approved masters (assets/illustrations/onboarding), drawn as supplied
// (`contain`, sized at render time, never cropped, recoloured or re-encoded).
//
//   welcome.png            the compact accent of the account screens, so
//                          they read as the same flow as the setup steps
//   starter-services.png   Discovery slide 1 (daily organisation) — ALSO the
//                          setup step 4 master: that limited reuse is approved
//   products.png           Discovery slide 2 (products, stock, sales)
//   clients.png            Discovery slide 3 (clients and business insights)
//
// The paywall master (assets/illustrations/paywall/growth.png) is reserved
// for the BeautIzzy Plus gate and is never used by the first-launch screens.

export const welcomeIllustration = require('../../../assets/illustrations/onboarding/welcome.png');

export const discoveryIllustrations = {
  organisation: require('../../../assets/illustrations/onboarding/starter-services.png'),
  products: require('../../../assets/illustrations/onboarding/products.png'),
  insights: require('../../../assets/illustrations/onboarding/clients.png'),
} as const;
