// Button metrics are in design pixels: px() scales them from the design width
// declared per platform in app.json (480 round, 390 square).
export const BTN_W = 150
export const BTN_H = 58
export const BTN_RADIUS = 30
export const BTN_Y = 296
export const BTN_FONT = 26

export const RETRY_BTN = {
  x: 78,
  y: 236,
  w: 324,
  h: 78,
  radius: 39,
  font_size: 28,
  color: '#000000',
  background_color: '#4dd0e1',
  press_color: '#26a69a',
  text: 'Try again'
}

// Fifth screen: the support / donation page. It reuses the row of buttons at
// BTN_Y, so only the text block above it needs measuring.
export const SUPPORT = {
  title_y: 66,
  title_font: 26,
  body_y: 104,
  body_h: 150,
  body_font: 22,
  cta_x: 90,
  cta_y: 268,
  cta_w: 300,
  cta_h: 70,
  cta_font: 26,
  cta_radius: 35
}
