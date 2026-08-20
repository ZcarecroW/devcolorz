<script setup lang="ts">
/**
 * SVG colour matrices for every simulated colour-vision deficiency.
 *
 * Rendered once at the document root; previews reference them with
 * `filter: url(#cvd-deuteranopia)`.
 *
 * The matrices are the Machado 2009 tables, which are defined for linear
 * light. SVG filters interpolate in linearRGB by default, so the browser does
 * the linearisation for us — which is exactly why `color-interpolation-filters`
 * is set explicitly rather than left to a stylesheet that might override it.
 */
import { CVD_IDS, CVD_TYPES, svgMatrixFor } from '@/lib/color/cvd'

const filters = CVD_IDS.filter((id) => id !== 'none').map((id) => ({
  id,
  label: CVD_TYPES[id].label,
  values: svgMatrixFor(id).join(' '),
}))
</script>

<template>
  <svg aria-hidden="true" focusable="false" class="pointer-events-none absolute size-0 overflow-hidden">
    <defs>
      <filter
        v-for="filter in filters"
        :id="`cvd-${filter.id}`"
        :key="filter.id"
        color-interpolation-filters="linearRGB"
      >
        <title>{{ filter.label }}</title>
        <feColorMatrix type="matrix" :values="filter.values" />
      </filter>
    </defs>
  </svg>
</template>
