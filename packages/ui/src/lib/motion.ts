export const UI_BUTTON_HOVER = {
  y: -1,
  scale: 1.01,
}

export const UI_BUTTON_TAP = {
  y: 0,
  scale: 0.98,
}

export const UI_SHEET_OVERLAY_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1] as const,
}

export const UI_SHEET_PANEL_TRANSITION = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 28,
  mass: 0.9,
}
