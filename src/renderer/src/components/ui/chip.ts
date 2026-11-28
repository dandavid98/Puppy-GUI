/**
 * The small rounded controls under the message box (attach, folder, permissions, context, model): one look
 * for all of them, so they read as a set. Open (aria-expanded) looks like hovered, so you can see which is open.
 */
const LOOK = 'items-center rounded-full border border-line text-muted hover:bg-raised hover:text-ink aria-expanded:bg-raised aria-expanded:text-ink'

/** A chip with a label (and usually an icon). */
export const CHIP = `inline-flex gap-1 px-2.5 py-1 text-xs ${LOOK}`

/** A chip with only an icon: round, and as tall as a labelled one, so the row lines up. */
export const ICON_CHIP = `inline-flex size-[26px] shrink-0 justify-center ${LOOK}`

/** Icon size inside a chip. */
export const CHIP_ICON = 13
