import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 * Without `twMerge`, passing `class="p-2"` to a component whose base is `p-4`
 * gives you both, and whichever appears later in the stylesheet wins — which
 * is not what the caller meant.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
