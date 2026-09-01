# Changelog

## 1.6.0 — 2026-09-02

A bug-fix pass over the whole project: every module read end to end, the
interface driven in a browser at desktop and phone widths, and the backend
exercised from a fresh install. Sixty-odd findings, from arithmetic in the
colour engine to a toolbar that fell off the edge of a 1280-pixel screen.
Minor rather than patch: share links and the Android export change shape, and
there is a schema migration.

### The colour engine

- **"Solve for contrast" doubled back on itself against a mid-tone surface.**
  Contrast is symmetric — a colour a little lighter than a gray surface scores
  the same as one a little darker — and the solver scanned the whole lightness
  range, so a ramp against a gray reference darkened for four steps and then
  climbed to near-white for the rest. It now stays on one side of the surface.
- **Radix dark ramps collapsed steps in a narrow band.** With the floor at 0.4
  and the ceiling at 0.6 — both values the export panel offers — eight
  light-mode inputs landed on one dark value, so four consecutive Tailwind
  steps were the same colour. The anchors are fractions of the band now, and
  at the default band they reproduce the old values exactly.
- **The "Digital (HSL)" wheel was the perceptual wheel with a different
  label.** It rotated in OKLCH like the option next to it, while its own hint
  explained how unevenly HSL spaces its hues. It has a measured wheel of its
  own now, built the way the artistic one is.
- **A golden-ratio channel could not satisfy the distance requirement.** The
  sequence never draws from the generator, so all forty retries for a colour
  produced the same value, and two channels both set to it moved in lockstep
  along one diagonal of the space. Retries now move along the sequence, and
  each channel has its own offset.
- **A split complementary at zero spread put the same colour in twice.** Its
  seed list starts with two coincident hues, and returned as-is because it was
  already the right length. Coincident seeds are one seed now.
- **Crossed bounds turned "Preserve contrast" into a naive flip.** A floor
  above the ceiling meant the solver ran no iterations and returned its
  starting guess. The band is put in order first, for every strategy.
- **The HSL flip was two different algorithms.** Going dark it flipped in HSL;
  coming back it flipped in OKLCH. Both directions use HSL now.
- **Display P3 gamut mapping produced sRGB.** The clip and chroma-reduction
  steps converted through sRGB whatever gamut was asked for.
- **A curve of zero or below made every scale step the same colour**, and a
  negative one made nine of eleven steps black. The exponent has a floor.
- **The edges distribution left the range at a negative spread**, and an alpha
  above 1 was silently dropped rather than clamped.

### Links, documents and exports

- **The packed share link clipped wide-gamut colours.** It claimed to carry
  everything and carried six hex digits per colour, so a Display P3 red lost
  fourteen percent of its chroma in transit. Links written from now on carry
  the OKLCH channels as well; older links still read, and older versions still
  read the new ones.
- **A malformed link threw instead of reading as no link.** A stray `%` from
  a truncated paste rejected the promise every other bad input turns into a
  quiet null.
- **A document with a truncated channel tuple produced a colour with undefined
  chroma and hue.** Three finite numbers are required; anything less falls
  back to the hex.
- **The SVG sheet was invalid with every colour excluded**: zero columns wide
  and `NaN` rows tall.
- **The Android export was one file with two roots.** Day and night resources
  belong in two files, and saved as one `.xml` the pair was not well-formed.
  The download now produces `values/colors.xml` and `values-night/colors.xml`.
- **The Tailwind v4 variant named `.dark` whatever the dark class was set
  to**, so renaming the class left `dark:` utilities looking for one that no
  toggle set.
- **A CSS dark override could never beat a base selector of higher
  specificity.** With the selector set to `#app` the `.dark` block was dead
  CSS. It is paired with the base selector now, on the same element and as an
  ancestor.
- **The boxes layout could plan zero-size tiles** when the gap alone was wider
  than the box, and returned one span for ten items while the container was
  still unmeasured.
- **Clearing the shadow opacity in the theme editor gave a 0% shadow** rather
  than the documented 10%, and disagreed with the build script that generates
  the shipped stylesheet from the same values.

### The studio

- **Long values were cut to "oklch(80…".** The column turned its label on its
  side below one fixed width that was right for a hex and wrong for anything
  longer. The threshold follows the notation now, and in the boxes and cards
  layouts — which cannot rotate — the value wraps instead of ending in an
  ellipsis.
- **On a 1280-pixel screen the toolbar's last three controls sat past the
  right edge.** Wrapping was switched off from that width on the assumption
  that one row fits there; it does not until about 1400. It wraps only when it
  must, and the layout captions wait for a wider screen.
- **The phone toolbar was five rows tall.** The hover-only explanations,
  which cannot open on a touch screen, and the keyboard cheat sheet step
  aside below the small breakpoint.
- **Three icon-only buttons had no accessible name on a phone**, and the four
  layout buttons were announced by their whole explanatory paragraph.
- **Reloading the page said "Loaded 5 colors from the link."** The studio
  rewrites its own address as you work, so a reload arrived through the same
  door as a colleague's link. The tab remembers what it wrote.
- **The accessibility panel mislabelled the simulation** after the toolbar
  had switched it, and flicking its switch brought the stale one back.
- **Replacing the palette with a scale or an image kept the locks**, pinning
  colours the user never chose and refusing every later roll on them.
- **Holding an arrow key on a slider left dozens of undo entries**, one per
  key repeat. A hold is one gesture now, like a drag. Ctrl+Z also works while
  a slider has focus.
- **`+` and `−` at the limits did nothing and said nothing**, from the keys and
  from the command palette. They say why now.
- **Dropping two images in quick succession could revert to the first** when
  the larger finished decoding last, and "Add to palette" recorded one undo
  entry per colour.
- **Pasting an image worked only on the Image tab**, while the cheat sheet
  promised it everywhere. Pasted anywhere in the studio, an image now opens
  the tab and lands.
- **The seed field fought the typist**: a leading zero vanished under the
  cursor and a minus sign could only be pasted.
- **The Per-color badge counted overrides for colours no longer in the
  palette.**
- **Contrast-matrix cells shrank to ten pixels** for a large palette, inside
  the one panel whose job is accessibility. Twenty-four is the floor; the
  matrix scrolls past it.
- **Dragging a swatch showed no drop target.** The swatch under the pointer is
  outlined.
- **The dark-mode drift readout used fixed green and amber** instead of the
  theme's own success and warning colours.

### Pages and the console

- **A settings save with one refused field was reported as if nothing had
  been saved, when its neighbours had.** The server wrote the accepted keys
  before reporting the rejection, so the form showed every field as unsaved
  while most were live and Discard reverted a form whose changes were already
  in effect. A save is all or nothing now.
- **The theme editor edited the mode you were not looking at** after the
  header's appearance menu switched the app. The pills and rows follow the
  app.
- **The setup wizard threw away the session it had just been given.** The
  server signs the new administrator in; the wizard read only the two tokens,
  so the header went on offering "Sign in". It adopts the session and offers
  the admin console.
- **Switching admin tabs discarded unsaved settings.** A tab panel unmounts
  when it is not showing. The Settings panel stays mounted.
- **A pasted `?tab=system` link did nothing if the console was already
  open**, since the tab was read from the address once. It follows the
  address now.
- **The outbox could show rows for a filter no longer selected** when two
  loads overlapped. The same stale-response guard the other lists use.
- **The sign-up button was enabled before the captcha was solved**, unlike the
  reset form's.
- **Two quick preference picks could save in the wrong order**, and a fast
  double-click on a heart could toggle a like twice.
- **Revoking someone's sessions left the overview's session count stale.**
- **The Users and outbox tables scrolled sideways inside their card on a
  phone**, with the row menu — and the delete in it — off-screen. Columns a
  phone can spare are hidden there instead.
- **Focus stayed on the old page after a navigation.** It moves to the new
  content, so the next Tab starts there and a screen reader hears the change.
- A handful of British spellings in American-English copy.

### The server

- **Update checks failed on PHP 8.2** — the application's own minimum. The
  updater named two curl constants that arrived in 8.3, and the self-test
  reported the host able to check. Older hosts use the bitmask constants.
- **The sync endpoint applied none of the palette rules.** Empty palettes,
  forty-one colours and megabyte titles went straight in, past the instance's
  quota. It validates like a single create now.
- **Changing the password or address and deleting the account checked the
  password under no lockout**, so a stolen session cookie could try ninety
  passwords a minute. They share the sign-in form's lockout now.
- **A password reset left the lockout in place**, so someone locked out by a
  guesser reset their password and still could not sign in.
- **An anonymous request for a private palette got 401 where a missing one
  got 404**, confirming the existence the 404 is there to hide.
- **A blank site address was accepted**, which made mail links and the
  exposure probe trust whatever Host header a request carried; and a
  rate-limit bucket of any shape was stored and silently replaced by the
  built-in default at read time. Both are refused with a reason.
- **The prune job scanned three whole tables.** None of its columns led an
  index, and one predicate was an expression no index can serve. Migration
  `005_prune_indexes` adds the indexes; the predicate is a plain comparison.
- **Retrying one outbox message could send five others** and report their
  outcome as its own.
- The updater now checks directory entries in an archive like files, treats
  `Config.php` as `config.php` on a case-folding filesystem, and an empty
  preferences object is stored as an object rather than a list.

### Developing

- **Signing in from `npm run dev` was impossible.** The API refuses a write
  whose Origin is not its own host, and the dev proxy forwarded the browser's.
  It rewrites Origin now.
- **A chunk that failed to load after an update left the pane blank.** Every
  page and template is a hashed chunk, and the built-in updater replaces
  them under any open tab. The page reloads once and picks up the new index.
- The smoke test now exercises `cron.php` with its real token from a fresh
  install, and asserts the atomic save, the base-URL guard, sync validation
  and the anonymous 404. Twenty-five unit tests cover the engine and library
  fixes.

### Upgrading

Upload the contents of the ZIP over your installation, or let an installation
running 1.4.0 or later do it for itself from **Admin → System → Updates**. Do
**not** overwrite `config.php` or `storage/`. Migration `005_prune_indexes`
runs on the first request and only adds indexes. Palettes and links saved by
earlier versions are read unchanged.

## 1.5.0 — 2026-08-23

**A MILELO link in the header**, beside the GitHub mark. MILELO is a primary
school in Kijenge, Arusha, where lessons and meals cost the families nothing;
hovering the mark opens a card explaining what the project is and who runs it.
It opens on keyboard focus as well as hover, and the wordmark is inlined rather
than hot-linked so no visitor's address is sent to a third-party CDN to render
it.

**The README shows the app.** Eight labelled screenshots, each with alt text
and a caption, walking through the constrained generator, the harmony wheels,
tonal scales, the contrast matrix and colour-vision simulation, export, the
theme editor repainting the application itself, Explore and the admin console.
The live instance at devcolorz.fabula.vision is linked at the top.

Nothing else changed: this release is a link, some words and some pictures.

## 1.4.0 — 2026-08-23

**A GitHub mark in the header**, left of the appearance toggle, linking to the
project this application is built from.

**Updates.** The System tab shows the installed version, the newest release,
when it last looked, and the notes for anything newer — with one button to
check, one to install, and one to undo the last install. The Settings tab
decides whether the daily check runs, at which hour, and whether what it finds
is installed without being asked. Checking and automatic installation are both
on by default, at 05:00 server time.

Installing an update downloads an archive and unpacks it over the running code,
so the care is in what is allowed and what is checked first. The repository is
compiled into the application rather than being a setting. The download address
is rebuilt from that constant and the release tag, never taken from the API
response. Every path inside the archive must stay within the staging directory,
the tree has to look like DevColorz, and the version inside has to match the
release it claims to be — a mislabelled archive cannot quietly downgrade the
site. `config.php` and `storage/` are never written, and every replaced file is
kept so one button puts the previous version back.

What this cannot check is *who* published a release: GitHub does not sign
release assets, so anyone holding the project account could publish something
an installation with automatic updates on would install unattended. The switch
says so where it sits. Turn it off to read the notes first.

A host that cannot do this says so on the page rather than failing halfway —
no outbound HTTP, no zip extension, or an application directory PHP may not
write to are each reported with what to do instead.

Fixed alongside: `APP_VERSION` lived in the front controller, which the
scheduler does not load, so a scheduled check would have died on an undefined
constant while the same code worked from the console. It has its own file now.

## 1.3.0 — 2026-08-23

**Display names are unique.** Two accounts could both be called Alex. The
display name is the only part of a profile anyone else ever sees — it is on
every published palette and every row of the admin user list — so two people
wearing it made both unattributable.

Names are compared trimmed and case-folded, so "Alex", "alex" and "  ALEX  "
are one name, and the folding is done in PHP rather than SQLite, whose
`lower()` handles ASCII only and would have let Ünal and ünal both through. All
three write paths enforce it — registration, the account page, and an
administrator editing someone — and each ignores the account doing the asking,
so re-saving your own profile is never refused on the strength of the name you
already have.

**Upgrading with duplicates already in the database is handled.** A unique
index cannot be created while duplicates exist, so rather than fail the upgrade
the migration renames: the earliest account of each set keeps its name and the
others are numbered after it, skipping anything already taken. Four accounts
called Alex become Alex, Alex 2, Alex 3 and alex 4, each keeping its own
capitalisation.

Smaller, alongside it: the admin console showed "Some fields need attention."
where the server had sent a sentence explaining what was actually wrong, and
the account page printed both the specific message and the generic one.

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
