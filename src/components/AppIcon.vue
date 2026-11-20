<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'moon'"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></template>
    <template v-else-if="name === 'sun'"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></template>
    <template v-else-if="name === 'book'"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22V4.5ZM20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22V4.5Z"/></template>
    <template v-else-if="name === 'review'"><path d="M20 11a8 8 0 1 0-2.35 5.65M20 4v7h-7"/><path d="m9 12 2 2 4-5"/></template>
    <template v-else-if="name === 'sparkles'"><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></template>
    <template v-else-if="name === 'quiz'"><path d="M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="2" width="6" height="5" rx="2"/><path d="m8 14 2 2 5-5M8 20h8"/></template>
    <template v-else-if="name === 'pen'"><path d="m14 5 5 5M4 20l3.5-.7L20 6.8a2.1 2.1 0 0 0-3-3L4.7 16.5 4 20Z"/><path d="M13 20h8"/></template>
    <template v-else-if="name === 'back'"><path d="m15 18-6-6 6-6M9 12h11"/></template>
    <template v-else-if="name === 'volume'"><path d="M11 5 6 9H3v6h3l5 4V5ZM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></template>
    <template v-else-if="name === 'check'"><path d="m5 12 4 4L19 6"/></template>
    <template v-else-if="name === 'close'"><path d="m6 6 12 12M18 6 6 18"/></template>
    <template v-else-if="name === 'download'"><path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/></template>
    <template v-else-if="name === 'upload'"><path d="M12 16V4m-5 5 5-5 5 5M4 19v2h16v-2"/></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></template>
    <template v-else-if="name === 'target'"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></template>
    <template v-else-if="name === 'reset'"><path d="M3 11a9 9 0 1 0 2.6-6.4M3 5v6h6"/></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 3h6l1 4H8l1-4ZM6 7l1 14h10l1-14M10 11v6M14 11v6"/></template>
    <template v-else-if="name === 'gear'"><circle cx="12" cy="12" r="3.1"/><path d="M19.1 14.6a1.55 1.55 0 0 0 .31 1.71l.06.06a1.9 1.9 0 1 1-2.68 2.68l-.06-.06a1.55 1.55 0 0 0-1.71-.31 1.55 1.55 0 0 0-.94 1.42V20a1.9 1.9 0 1 1-3.79 0v-.08a1.55 1.55 0 0 0-1-1.42 1.55 1.55 0 0 0-1.71.31l-.06.06a1.9 1.9 0 1 1-2.68-2.68l.06-.06a1.55 1.55 0 0 0 .31-1.71 1.55 1.55 0 0 0-1.42-.94H4a1.9 1.9 0 1 1 0-3.79h.08a1.55 1.55 0 0 0 1.42-1 1.55 1.55 0 0 0-.31-1.71l-.06-.06a1.9 1.9 0 1 1 2.68-2.68l.06.06a1.55 1.55 0 0 0 1.71.31h.08a1.55 1.55 0 0 0 .94-1.42V4a1.9 1.9 0 1 1 3.79 0v.08a1.55 1.55 0 0 0 .94 1.42 1.55 1.55 0 0 0 1.71-.31l.06-.06a1.9 1.9 0 1 1 2.68 2.68l-.06.06a1.55 1.55 0 0 0-.31 1.71v.08a1.55 1.55 0 0 0 1.42.94H20a1.9 1.9 0 1 1 0 3.79h-.08a1.55 1.55 0 0 0-1.42.94Z"/></template>
    <template v-else-if="name === 'image'"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.6" cy="9.4" r="1.6"/><path d="m4 17 4.6-4.4a2 2 0 0 1 2.7 0L21 20"/></template>
    <template v-else-if="name === 'shuffle'"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></template>
    <template v-else-if="name === 'auto'"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/></template>
    <template v-else-if="name === 'list'"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></template>
    <template v-else-if="name === 'spark'"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.6L7 20v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z"/><path d="m11 7.6.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z"/></template>
    <template v-else-if="name === 'music'"><path d="M9 18V5.6l10-2v11.8"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.4" r="2.5"/></template>
    <template v-else-if="name === 'send'"><path d="M21 3 10.5 13.5M21 3l-6.6 18-3.9-7.5L3 9.6 21 3Z"/></template>
    <template v-else-if="name === 'cpu'"><rect x="7" y="7" width="10" height="10" rx="2.2"/><rect x="10.2" y="10.2" width="3.6" height="3.6" rx="1"/><path d="M9.6 3v4M14.4 3v4M9.6 17v4M14.4 17v4M3 9.6h4M3 14.4h4M17 9.6h4M17 14.4h4"/></template>
    <template v-else-if="name === 'cloud'"><path d="M7.4 18.5h9.2a3.9 3.9 0 0 0 .5-7.76 6.1 6.1 0 0 0-11.7-.42A3.6 3.6 0 0 0 7.4 18.5Z"/></template>
    <template v-else-if="name === 'folder'"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.8c.7 0 1.3.3 1.8.9l1 1.3h6.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z"/></template>
    <template v-else-if="name === 'scan'"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/></template>
    <template v-else-if="name === 'repeat'"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></template>
    <template v-else-if="name === 'repeat-one'"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3M11 10h2v5M10 11l2-1"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'playlist'"><path d="M4 6h11M4 12h11M4 18h7M17 15l4 3-4 3M17 6h4"/></template>
    <template v-else><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></template>
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 24 });
</script>

<style scoped>
.app-icon { display: block; flex: 0 0 auto; }
</style>
