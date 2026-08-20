# Third-party licences

DevColorz is MIT licensed. It builds on the following, each under its own terms.

## Bundled at runtime

| Project | Licence | Used for |
|---|---|---|
| [Vue](https://vuejs.org) | MIT | the application framework |
| [Tailwind CSS](https://tailwindcss.com) | MIT | styling |
| [shadcn-vue](https://www.shadcn-vue.com) / [Reka UI](https://reka-ui.com) | MIT | the component primitives |
| [culori](https://culorijs.org) | MIT | colour conversion, behind our own engine |
| [Pinia](https://pinia.vuejs.org), [Vue Router](https://router.vuejs.org), [VueUse](https://vueuse.org) | MIT | state, routing, composables |
| [Lucide](https://lucide.dev) | ISC | icons |
| [vue-sonner](https://vue-sonner.vercel.app) | MIT | toasts |
| [Zod](https://zod.dev) | MIT | schema validation |

## Data

**Colour names** come from [color-names](https://github.com/meodai/color-names)
by meodai, MIT licensed. The 4,959-entry "best of" subset is compiled into
`app/lib/color/names.data.ts` by `scripts/gen-color-names.mjs`.

**Colour-vision simulation matrices** are from Machado, Oliveira & Fernandes
(2009), *A Physiologically-based Model for Simulation of Color Vision
Deficiency*, IEEE TVCG 15(6), 1291–1298. They are extracted from culori's
tables by `scripts/gen-cvd-matrices.mjs` and applied in linear light, as the
paper defines them.

## Algorithms

**APCA** is the perceptual contrast algorithm by Andrew Somers
([APCA-W3](https://github.com/Myndex/apca-w3)). DevColorz implements the
published 0.1.9 formula directly rather than bundling the reference code; the
implementation is verified against hand-computed vectors in
`app/lib/color/engine.spec.ts`.

**The CSS Color 4 gamut-mapping algorithm** follows the
[W3C specification](https://www.w3.org/TR/css-color-4/#css-gamut-mapping).

Nothing here is affiliated with or endorsed by any of the above.
