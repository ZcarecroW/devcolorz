<script setup lang="ts">
/**
 * A messaging thread: bubbles on both sides, an attachment card, a typing
 * indicator and a composer.
 *
 * The decision worth knowing: outgoing bubbles use `--p-primary` with
 * `--p-text-on-primary`, incoming bubbles use `--p-surface-alt` with
 * `--p-text`. That pairing is the fastest way to catch a primary that looks
 * fine as a button but cannot carry a paragraph of small text.
 */
import { computed } from 'vue'
import { CheckCheck, Paperclip, Phone, SendHorizontal, Smile, Video } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

interface Bubble {
  from: 'them' | 'me'
  text: string
  time: string
  read?: boolean
}

const thread: Bubble[] = [
  { from: 'them', text: 'The ramp landed. Steps 400 through 700 finally hold their hue.', time: '09:12' },
  { from: 'me', text: 'Nice. Did the 700 pass Lc 60 on the card surface?', time: '09:13', read: true },
  { from: 'them', text: 'Lc 63. I had to drop chroma about eight percent to get there.', time: '09:14' },
  {
    from: 'me',
    text: 'Worth it. Ship it and I will redo the button states tonight.',
    time: '09:15',
    read: true,
  },
]

const quickReplies = ['Looks good', 'Send the file', 'Later today']
</script>

<template>
  <div
    class="@container flex w-full flex-col"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Thread header -->
    <div
      class="flex items-center gap-3 border-b px-4 py-3"
      :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
    >
      <span class="relative shrink-0">
        <span
          class="block size-9 rounded-full"
          :style="{ background: `linear-gradient(135deg, ${ramp(1)}, ${ramp(3)})` }"
        />
        <span
          class="absolute right-0 bottom-0 size-2.5 rounded-full border-2"
          :style="{ background: 'var(--p-success)', borderColor: 'var(--p-surface)' }"
        />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold">Marta Oyelaran</span>
        <span class="block text-[11px]" :style="{ color: 'var(--p-text-muted)' }">
          Active now · Design systems
        </span>
      </span>
      <span class="flex items-center gap-1" :style="{ color: 'var(--p-text-muted)' }">
        <Phone class="size-4" />
        <Video class="size-4" />
        <InfoHint
          title="Bubble contrast"
          wide
          class="ml-1 text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
          text="Outgoing bubbles are the primary color carrying body text, which is a harder job than carrying a button label: paragraphs run smaller and longer, so a primary that scrapes past Lc 60 on a label often fails here. If this side of the conversation is tiring to read, use the primary for controls only and give messages a surface."
        />
      </span>
    </div>

    <!-- Conversation -->
    <div class="flex flex-col gap-3 px-4 py-4">
      <div class="flex items-center gap-2">
        <span class="h-px flex-1" :style="{ background: 'var(--p-border)' }" />
        <span class="text-[10px] tracking-wide uppercase" :style="{ color: 'var(--p-text-muted)' }">
          Today
        </span>
        <span class="h-px flex-1" :style="{ background: 'var(--p-border)' }" />
      </div>

      <div
        v-for="(bubble, i) in thread"
        :key="i"
        class="flex"
        :class="bubble.from === 'me' ? 'justify-end' : 'justify-start'"
      >
        <span class="flex max-w-[85%] flex-col gap-1 @xl:max-w-[60%]">
          <span
            class="rounded-2xl px-3 py-2 text-xs leading-relaxed"
            :class="bubble.from === 'me' ? 'rounded-br-sm' : 'rounded-bl-sm'"
            :style="
              bubble.from === 'me'
                ? { background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }
                : {
                    background: 'var(--p-surface-alt)',
                    color: 'var(--p-text)',
                    boxShadow: 'inset 0 0 0 1px var(--p-border)',
                  }
            "
          >
            {{ bubble.text }}
          </span>
          <span
            class="flex items-center gap-1 text-[10px] tabular-nums"
            :class="bubble.from === 'me' ? 'justify-end' : 'justify-start'"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            {{ bubble.time }}
            <CheckCheck v-if="bubble.read" class="size-3" :style="{ color: 'var(--p-info)' }" />
          </span>
        </span>
      </div>

      <!-- Attachment card, so the thread has one non-text surface -->
      <div class="flex justify-start">
        <span
          class="w-52 overflow-hidden rounded-2xl rounded-bl-sm"
          :style="{ background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
        >
          <span
            class="flex h-24 items-end gap-1 p-3"
            :style="{
              background: `linear-gradient(135deg, ${ramp(0)}, ${ramp(2)} 55%, ${ramp(4)})`,
            }"
          >
            <span
              v-for="bar in 7"
              :key="bar"
              class="flex-1 rounded-sm"
              :style="{
                height: `${18 + ((bar * 13) % 60)}%`,
                background: 'var(--p-background)',
                opacity: 0.55,
              }"
            />
          </span>
          <span class="block px-3 py-2">
            <span class="block text-[11px] font-medium">ramp-audit-v4.png</span>
            <span class="block text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
              284 KB · PNG
            </span>
          </span>
        </span>
      </div>

      <!-- Typing indicator -->
      <div class="flex justify-start">
        <span
          class="flex items-center gap-1 rounded-2xl rounded-bl-sm px-3 py-2.5"
          :style="{ background: 'var(--p-surface-alt)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
          aria-label="Marta is typing"
        >
          <span
            v-for="dot in 3"
            :key="dot"
            class="size-1.5 animate-pulse rounded-full"
            :style="{ background: 'var(--p-text-muted)', animationDelay: `${(dot - 1) * 160}ms` }"
          />
        </span>
      </div>
    </div>

    <!-- Quick replies -->
    <div class="flex flex-wrap gap-1.5 px-4 pb-3">
      <span
        v-for="reply in quickReplies"
        :key="reply"
        class="rounded-full px-2.5 py-1 text-[11px]"
        :style="{
          color: 'var(--p-accent)',
          boxShadow: 'inset 0 0 0 1px var(--p-accent)',
          background: 'color-mix(in oklab, var(--p-accent) 10%, transparent)',
        }"
      >
        {{ reply }}
      </span>
    </div>

    <!-- Composer -->
    <div
      class="flex items-center gap-2 border-t px-4 py-3"
      :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
    >
      <Paperclip class="size-4 shrink-0" :style="{ color: 'var(--p-text-muted)' }" />
      <span
        class="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2"
        :style="{ background: 'var(--p-background)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <span class="min-w-0 flex-1 truncate text-xs" :style="{ color: 'var(--p-text-muted)' }">
          Write a message
        </span>
        <Smile class="size-4 shrink-0" :style="{ color: 'var(--p-text-muted)' }" />
      </span>
      <span
        class="grid size-9 shrink-0 place-items-center rounded-full"
        :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
      >
        <SendHorizontal class="size-4" />
      </span>
    </div>
  </div>
</template>
