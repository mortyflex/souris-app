// BeautIzzy — the first-entry illustrations
//
// Approved masters (assets/illustrations/onboarding), drawn as supplied
// (`contain`, sized at render time, never cropped, recoloured or re-encoded).
// Every master is a square 1254 × 1254 transparent PNG.
//
//   welcome.png            the compact accent of sign-up (sign-in and the email
//                          confirmation are anchored by the brand mark instead)
//   activity-duo.png       Discovery slide 1 (organisation): two professionals
//                          with appointment elements
//   products-man.png       Discovery slide 2 (products, stock, sales)
//   clients-duo.png        Discovery slide 3 (clients and business insights)
//
// The mapping is FIXED for everyone: the two-character and single-character
// masters show that one BeautIzzy serves every beauty occupation, never a
// profile of the person. Nothing selects a variant by gender, activity,
// randomness or launch count. Reserved, deliberately not bundled here:
// clients-man.png, clients.png, products.png and starter-services.png (the
// setup step 4 master) stay available as alternatives; the paywall masters
// (assets/illustrations/paywall: growth-duo.png preferred, growth.png,
// growth-man.png) belong to the future BeautIzzy Plus gate.

export const welcomeIllustration = require('../../../assets/illustrations/onboarding/welcome.png');

export const discoveryIllustrations = {
  organisation: require('../../../assets/illustrations/onboarding/activity-duo.png'),
  products: require('../../../assets/illustrations/onboarding/products-man.png'),
  insights: require('../../../assets/illustrations/onboarding/clients-duo.png'),
} as const;
