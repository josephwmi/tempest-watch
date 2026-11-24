// Screen order shared by the < / > buttons and swipe gestures:
// 0 Temperature, 1 Wind, 2 Air, 3 Sun & rain, 4 Support.
export const PAGES = 5

// Buttons keep their original behaviour and wrap around the ends.
export function buttonTarget(page, dir, pages = PAGES) {
  return (((page + dir) % pages) + pages) % pages
}

// Swipes do not wrap. A left swipe (finger moves right to left) shows the next
// screen, a right swipe the previous one, like any carousel. At either end, and
// for any gesture that is not left/right, this returns null: the caller should
// then NOT consume the gesture so the system default still applies (on the
// first screen a right swipe keeps working as the system "back" gesture).
export function swipeTarget(page, gesture, consts, pages = PAGES) {
  if (!consts) return null
  let dir = 0
  if (gesture === consts.GESTURE_LEFT) dir = 1
  else if (gesture === consts.GESTURE_RIGHT) dir = -1
  else return null
  const next = page + dir
  if (next < 0 || next >= pages) return null
  return next
}
