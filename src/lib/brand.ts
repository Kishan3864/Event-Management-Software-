// Product (platform) branding. Each client business has its own name and logo in its settings;
// this is only the name of the software itself (login screen, installed app, browser tab).
// Change it in .env.local (NEXT_PUBLIC_PRODUCT_NAME / NEXT_PUBLIC_PRODUCT_SHORT_NAME) and run `npm run brand`.

export const PRODUCT = {
  name: process.env.NEXT_PUBLIC_PRODUCT_NAME || "Tent House Manager",
  shortName: process.env.NEXT_PUBLIC_PRODUCT_SHORT_NAME || "Tent Manager",
  tagline: "Bookings, billing & stock for tent houses, resorts and gardens",
  madeBy: "Brighton Solution",
};
