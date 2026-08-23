# Changelog

## 1.2.1 — 2026-08-23

**The controls on a swatch read differently on every colour.** They are drawn
in the swatch's own ink at a fixed opacity — but what reaches the eye is that
ink composited over the swatch, so the fade cost more contrast on some colours
than others. Measured with the app's own APCA, it costs 24–33 Lc: white and
near-black start above Lc 100 and can spare it, a mid-tone cannot. #808080 fell
from Lc 72 to 48, and its drag handle to Lc 40 — below the Lc 45 this app's own
scale gives as the floor for an icon. The buttons looked washed out until you
hovered one, which restored full ink.

The fade is now solved instead of fixed: the lowest opacity at which the
composited ink still reads at Lc 60 for the buttons, and at the Lc 45 icon
floor for the secondary drag handle. Light and dark swatches solve back to the
original values and look exactly as before; only the middle of the range firms
up.

The ink also stopped animating. A re-roll left the controls fading through
150ms of the previous swatch's ink while the swatch behind them had already
changed colour.

## 1.2.0 — 2026-08-23

A pass aimed at one bug class: the control that responds to a click and then
does nothing — no change, no request, no message. The admin-delete bug in 1.1.1
was one of those, and it had survived a full audit that read the source, so
this pass drove the interface in Chrome instead and hunted the shape
deliberately. Thirty-five findings were confirmed against the code by
adversarial review and then reproduced in the browser; twenty-five more were
refuted and dropped.

Minor rather than patch: palettes now carry alpha through every save and every
link, which changes what the app stores, and three administrator settings that
had never applied begin taking effect.

### Actions that ran and did nothing

- **"Profile saved" saved nothing you could see.** `PATCH /auth/me` answers
  with the user; the page read a `user` key that response does not have, merged
  `undefined`, and left the store untouched. The toast said saved, the field
  snapped back to the old name, and the server had in fact saved — the one
  combination guaranteed to make you try again.
- **All sixteen "Export as …" commands ignored the format they named.** Every
  one opened the export panel and dropped its emitter, so asking for Swift gave
  you whatever the panel last showed. The selection moved into the studio
  store, which also stops it being discarded whenever another tab is shown, and
  it persists between visits now.
- **Generate and all eight harmonies did nothing when every colour was
  locked** — no change, no history entry, no explanation, from five separate
  entry points including Space and the command palette. They say why now, in
  the same words wherever you meet the refusal. Picking from the Ranges preview
  grid in that state used to overwrite a locked swatch instead.
- **On a phone, asking for the panel that was already selected did nothing.**
  The sheet reacted to the stored panel *changing*, and it had not changed.
- **Opening a share link whose colours matched your own discarded it whole** —
  the names and locks it carried with it included.
- **Adding an opacity step outside 1–99, or one already in the list, cleared
  the box and added nothing**, which is exactly what success looks like.
- **Clearing a channel range's "to" box snapped the channel to its minimum**
  rather than leaving the value alone.

### Actions that reported something other than what happened

- **A failed visibility change said "Queued for review".** The helper swallowed
  its own error, so the caller could not tell moderation from a write that
  never happened, and reported the friendlier of the two.
- **Sign-out claimed success it could not know.** The local session is dropped
  regardless, so the header always updated; if the request never reached the
  server the cookie was still live there, and the missing catch skipped the
  redirect as well, leaving you on a page you no longer appeared to have access
  to.
- **Two keyboard shortcuts dropped a refused clipboard on the floor.** Every
  button that copies handles it — Ctrl+Shift+C and Ctrl+Shift+L were the only
  paths where the rejection went nowhere at all.
- **A refused role or status change reverted the row in silence.** The reason —
  "that is the only administrator" — went to a banner at the top of a long
  table, while the select snapped back where you were looking.
- **A 422 said "Some fields need attention" and threw away the sentence that
  explained it.** Lowering the instance colour limit turned every oversized
  save into an error with no stated cause.
- **The admin overview strip kept the figures it loaded on arrival** while
  saying "Updated 0s ago". Suspending someone left "0 suspended" on screen.

### Actions that quietly did the wrong thing

- **Deleting a user left every palette behind.** The confirmation says the
  account and every palette it owns are removed; the foreign key said otherwise,
  and the public ones stayed in Explore under no owner. They go with the
  account now, and the audit entry records how many.
- **Renaming a palette in the library swallowed your next click.** The title
  commits on blur and the whole card was disabled while that request ran — so
  the click that *caused* the blur, on Delete or Open or the visibility select,
  landed on a disabled control and vanished. A rename disables nothing now.
- **Opening a swatch's rename field and clicking away pinned the automatic
  name.** The box was pre-filled with the colour's own description, so leaving
  without typing committed it as an explicit name: an undo step, a dirty
  palette, and a name that stopped tracking the colour. It is a placeholder now.
- **Changing any preference silently saved an uncommitted display-name edit**
  that you had not pressed Save on.
- **Creating a palette had no re-entrancy guard.** The button disables itself,
  but only from the next render; clicks arriving inside that window each created
  one. Four rapid clicks now create one palette.
- **Settings took any value for any key.** An emptied number box arrived as 0
  and was stored as a choice — and `maxColors` at zero refuses every palette on
  the instance, with a success response. Values are checked against the type of
  the key's own default and refused with a reason.
- **A slow page could land on a list it no longer belonged to.** Both grids
  refilter while a request may be in flight; a stale page was appended to the
  filtered result and brought the wrong cursor with it. A failed "load more" no
  longer claims you have reached the end.

### Alpha

The adjust dialog has an alpha slider, a checkerboard to show the result and a
readout saying "45% alpha" — and the URL, the share link and the saved document
all wrote six-digit hex. Set an opacity and reload, and it was gone; send the
link and the recipient never saw it. Colours carry eight digits now when they
are not opaque, and a stored document appends alpha to its OKLCH channels only
when there is any to store. Both formats still read the old ones, and an opaque
palette still produces a byte-identical document.

### Settings that had never applied

`engine.defaultGamut` and `engine.defaultSwatchCount` were read at a moment
when `/meta` had not arrived — the studio deliberately does not wait for the
backend — so every visitor got the values compiled into the client. The first
palette now waits briefly, with a deadline, and falls back to the old behaviour
past it. `engine.defaultDarkStrategy` had a control in the console, a slot in
the API and no reader anywhere.

### Accessibility

The explanation triggers were 16×16 and the palette-layout toggles 22px tall,
against the 24×24 minimum — in an app that ships a contrast matrix and
colour-vision simulation. The icons stay the same size; the targets grew and
nothing on screen moved.

### Upgrading

Upload the contents of the ZIP over your installation. Do **not** overwrite
`config.php` or `storage/`. There is no schema change in this release, and
palettes saved by earlier versions are read unchanged.

## 1.1.1 — 2026-08-23

**Deleting a user from the admin console did nothing.** The confirmation
dialog appeared, "Delete permanently" closed it, and the account stayed on the
list — with no request sent, no error, and no toast.

`AlertDialogAction` is reka's `DialogClose`: it closes the dialog from its own
click handler, and Vue runs a child's own handler before the one that falls
through from the parent. The dialog's open state was derived from
`pendingDelete`, so closing it set that to `null` — and the confirm handler,
running second, found nothing to delete and returned. The payload and the
dialog's visibility are separate refs now, so the order cannot matter.

A delete that fails also says so, in a toast as well as the inline banner. The
bug had been present since 1.0.0.

## 1.1.0 — 2026-08-23

A bug-fix pass over the whole project, starting from six reports and ending
with eighty-odd fixes. Nothing here changes what the app is for.

**Studio** — toasts had no stylesheet, so they rendered unpositioned and behind
any open dialog. The controls panel lost its bottom padding to an overflowing
box, and its tab bar came unstuck partway down a long panel. Expanding Export's
"Per color" made the page scrollable into two thousand pixels of nothing: an
`.sr-only` label with no positioned ancestor escaped the panel and dragged the
document's height with it. Below 1024px the controls covered the whole studio
with no way to dismiss them; both panels are sheets there now, with a backdrop,
and the panel toggles moved into the toolbar, off the swatch buttons they were
sitting on.

**Accounts** — the sign-up form asked for an invitation code whether or not the
instance wanted one, the password meter used a different minimum from the
server, and the confirmation and reset links carried a parameter neither page
read. Route metadata (`requiresAuth`, `requiresAdmin`, `guestOnly`) is now
enforced by a guard instead of being decorative.

**Colour engine** — harmonies emitted duplicate colours at the default palette
size; the Radix and Material dark-mode curves put ramp steps out of order or
collapsed several onto one value; Material tone keys ran backwards; and the
chart-series extension produced identical greys for an achromatic palette.

**Export** — the "media query + class override" delivery emitted a light rule
that outranked the dark one, making the media query dead CSS. Two colours could
compose to the same variable and silently overwrite each other. Excluding a
colour renumbered every unnamed colour after it. The Tailwind emitters wrote
the prefix twice or threw outright; the SVG sheet drew every label in a shade
of its own tile; and a palette title containing `&`, `<` or `*/` broke the file
it landed in.

**Theme editor** — "Generate from the current palette" wrote the modal scrim
into `--popover`, turning every dropdown and tooltip in the app into a
translucent black slab with near-black text.

**Server** — searches containing `_` or `%` silently returned nothing.
Migrations only ran from cron, so an upgrade served 500s until the scheduler
fired. `/meta` ran six loopback HTTP requests for every admin page load. The
trending job used an optional SQLite function and threw on every run where it
was absent. Behind a TLS-terminating proxy the session cookie lost `Secure` and
every write failed the Origin check. The audit log was never pruned and the
nightly backup deleted manual snapshots.

**Mail** — a message `mail()` accepted but nothing delivered now has a
diagnosis: the self-test checks whether the sender's domain publishes SPF, and
the test-send reports the actual result and the envelope it used.

**Build** — the release tree lost its README, LICENCE and third-party notices
on every bundle; the CSP blocked the app's own pre-paint theme script; a
blanket `Require all granted` in `api/.htaccess` cancelled the deny rules
protecting the library and route files; and the FTPS deploy accepted any
certificate.

## 1.0.0

First public release.

**Generator** — range-constrained random generation across eleven colour
spaces, with wrap-around hue, six distributions, a seeded RNG and a minimum
perceptual distance. Thirteen harmony schemes on three colour wheels. Tonal
scales in Tailwind, Radix and Material shapes, generated by even lightness, by
solving for contrast, or a hybrid of the two. Palette extraction from an image,
entirely in the browser.

**Layouts** — columns, area-filling boxes, rows and cards.

**Previews** — eighteen templates driven by a role-assignment solver, so any
palette from 2 to 40 colours renders a coherent interface.

**Accessibility** — WCAG 2.x and APCA side by side, a full contrast matrix,
colour-vision simulation in linear light, and a collision detector.

**Export** — sixteen formats, configurable notation and naming, transparent
variants in three modes, and six light-to-dark inversion strategies.

**Theme editor** — the 44-token shadcn/tweakcn contract, with the app painted
by the same tokens it exports.

**Backend** — PHP 8 and SQLite with no dependencies. Install wizard with a
filesystem-proof challenge and a loopback exposure self-test, session and CSRF
handling, Argon2id passwords, token-bucket and per-account rate limiting,
hCaptcha, a retrying mail outbox, palette storage with version history, a
public gallery, a full admin surface, and a locked, deadline-chunked cron.
