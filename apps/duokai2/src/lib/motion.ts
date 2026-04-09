export const PAGE_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
}

export const PAGE_VIEW_VARIANTS = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: 6,
  },
}

export const EXPANDABLE_VARIANTS = {
  collapsed: {
    opacity: 0,
    height: 0,
    marginTop: 0,
  },
  expanded: {
    opacity: 1,
    height: 'auto',
    marginTop: 16,
  },
}

export const EXPANDABLE_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1] as const,
}
