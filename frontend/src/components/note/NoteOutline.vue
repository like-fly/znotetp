<script setup lang="ts">
import ZIcon from "@/components/DynamicIcon.vue";

export interface NoteOutlineItem {
    level: number;
    text: string;
    index: number;
}

const props = defineProps<{
    headings: NoteOutlineItem[];
}>();

const emit = defineEmits<{
    (e: "select", index: number): void;
}>();
</script>

<template>
  <div class="h-full overflow-y-auto bg-[#f7f7f5] px-5 py-4">
    <template v-if="props.headings.length > 0">
      <button
        v-for="heading in props.headings"
        :key="`${heading.index}-${heading.text}`"
        class="block w-full truncate rounded py-1 text-left leading-6 text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
        :class="[
          heading.level <= 1 ? 'text-[15px] font-semibold' : 'text-[14px]',
          heading.level === 2 ? 'pl-4' : heading.level === 3 ? 'pl-8' : heading.level >= 4 ? 'pl-12' : '',
        ]"
        type="button"
        @click="emit('select', heading.index)"
      >
        {{ heading.text }}
      </button>
    </template>
    <div v-else class="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-slate-400">
      <ZIcon name="ri:list-check-2" :size="24" color="currentColor" />
      <span>暂无大纲</span>
    </div>
  </div>
</template>
