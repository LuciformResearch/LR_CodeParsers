/**
 * Test script for new parsers: SCSS, Vue, Svelte
 */

import { SCSSParser } from './dist/esm/scss/index.js';
import { VueParser } from './dist/esm/vue/index.js';
import { SvelteParser } from './dist/esm/svelte/index.js';

// Sample SCSS content
const scssContent = `
// Variables
$primary-color: #3498db;
$secondary-color: #2ecc71 !default;
$spacing: 1rem;

// Mixin
@mixin flex-center($direction: row) {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: $direction;
}

// Function
@function calculate-width($cols, $total: 12) {
  @return percentage($cols / $total);
}

// Placeholder
%button-base {
  padding: $spacing;
  border: none;
  cursor: pointer;
}

// @use and @forward (module system)
@use 'sass:math';
@forward 'buttons' with ($primary: $primary-color);

// Nested rules
.container {
  max-width: 1200px;
  margin: 0 auto;

  .header {
    @include flex-center;
    background: $primary-color;

    &:hover {
      opacity: 0.9;
    }

    .logo {
      width: calculate-width(3);
    }
  }

  .button {
    @extend %button-base;
    background: $secondary-color;
  }
}

@media (max-width: 768px) {
  .container {
    padding: $spacing;
  }
}
`;

// Sample Vue SFC content
const vueContent = `
<template>
  <div class="user-profile">
    <UserAvatar :src="avatarUrl" @click="openProfile" />
    <h1 v-if="isVisible">{{ user.name }}</h1>
    <p v-for="item in items" :key="item.id">{{ item.text }}</p>
    <button @click.prevent="handleSubmit">Submit</button>
    <slot name="footer" :data="footerData"></slot>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUserStore } from '@/stores/user';
import UserAvatar from './UserAvatar.vue';

// Props
const props = defineProps<{
  userId: string;
  initialData?: Record<string, unknown>;
}>();

// Emits
const emit = defineEmits(['update', 'close']);

// Composables
const { user, isLoading } = useUserStore();
const { formatDate } = useDateFormatter();

// Refs
const isVisible = ref(true);
const items = ref([]);

// Computed
const avatarUrl = computed(() => user.value?.avatar || '/default.png');

// Methods
function handleSubmit() {
  emit('update', { userId: props.userId });
}

function openProfile() {
  console.log('Opening profile');
}
</script>

<style scoped lang="scss">
.user-profile {
  padding: 1rem;

  h1 {
    color: var(--primary);
  }
}
</style>
`;

// Sample Svelte content
const svelteContent = `
<script context="module">
  export const prerender = true;
</script>

<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import { writable } from 'svelte/store';
  import Button from './Button.svelte';

  // Props
  export let title: string;
  export let count = 0;
  export let items: string[] = [];

  // Store
  const theme = writable('light');
  $: currentTheme = $theme;

  // Reactive
  $: doubled = count * 2;
  $: console.log('Count changed:', count);

  // Event dispatcher
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleClick() {
    count += 1;
    dispatch('increment', { count });
  }

  function reset() {
    count = 0;
  }
</script>

<div class="container" use:tooltip={{ text: 'Hello' }}>
  <h1 transition:fade>{title}</h1>

  {#if count > 0}
    <p in:slide out:fade>Count: {count} (doubled: {doubled})</p>
  {/if}

  {#each items as item, i}
    <span>{i}: {item}</span>
  {/each}

  <Button on:click={handleClick}>
    Increment
  </Button>

  <slot name="extra" {count}></slot>
</div>

<style lang="scss">
  .container {
    padding: 1rem;

    h1 {
      color: blue;
    }
  }
</style>
`;

async function testSCSSParser() {
  console.log('\n' + '='.repeat(60));
  console.log('Testing SCSSParser');
  console.log('='.repeat(60));

  const parser = new SCSSParser();
  await parser.initialize();

  const result = await parser.parseFile('test.scss', scssContent);

  console.log('\n📊 Stylesheet Info:');
  console.log(`  - File: ${result.stylesheet.file}`);
  console.log(`  - Lines: ${result.stylesheet.linesOfCode}`);
  console.log(`  - Rules: ${result.stylesheet.ruleCount}`);
  console.log(`  - Max nesting depth: ${result.stylesheet.maxNestingDepth}`);

  console.log('\n💠 Variables ($):');
  for (const v of result.stylesheet.variables) {
    console.log(`  - ${v.name}: ${v.value}${v.isDefault ? ' !default' : ''}`);
  }

  console.log('\n🔧 Mixins:');
  for (const m of result.stylesheet.mixins) {
    const params = m.parameters.map(p => `$${p.name}${p.defaultValue ? `=${p.defaultValue}` : ''}`).join(', ');
    console.log(`  - ${m.name}(${params})${m.hasContent ? ' {@content}' : ''}`);
  }

  console.log('\n📐 Functions:');
  for (const f of result.stylesheet.functions) {
    const params = f.parameters.map(p => `$${p.name}${p.defaultValue ? `=${p.defaultValue}` : ''}`).join(', ');
    console.log(`  - ${f.name}(${params})`);
  }

  console.log('\n📦 @use statements:');
  for (const u of result.stylesheet.uses) {
    console.log(`  - @use '${u.path}'${u.namespace ? ` as ${u.namespace}` : ''}`);
  }

  console.log('\n📤 @forward statements:');
  for (const f of result.stylesheet.forwards) {
    console.log(`  - @forward '${f.path}'${f.prefix ? ` as ${f.prefix}*` : ''}`);
  }

  console.log('\n🎯 Includes (@include):');
  for (const inc of result.stylesheet.includes) {
    console.log(`  - @include ${inc.mixinName}`);
  }

  console.log('\n⬆️ Extends (@extend):');
  for (const ext of result.stylesheet.extends) {
    console.log(`  - @extend ${ext.selector}${ext.isOptional ? ' !optional' : ''}`);
  }

  console.log('\n📺 Media queries:');
  for (const mq of result.stylesheet.mediaQueries) {
    console.log(`  - @media ${mq}`);
  }

  return result;
}

async function testVueParser() {
  console.log('\n' + '='.repeat(60));
  console.log('Testing VueParser');
  console.log('='.repeat(60));

  const parser = new VueParser();
  await parser.initialize();

  const result = await parser.parseFile('UserProfile.vue', vueContent);

  console.log('\n📊 SFC Info:');
  console.log(`  - Component: ${result.sfc.componentName}`);
  console.log(`  - Lines: ${result.sfc.linesOfCode}`);
  console.log(`  - Has template: ${result.sfc.hasTemplate}`);
  console.log(`  - Has script: ${result.sfc.hasScript}`);
  console.log(`  - Has script setup: ${result.sfc.hasScriptSetup}`);
  console.log(`  - Has style: ${result.sfc.hasStyle}`);
  console.log(`  - Style scoped: ${result.sfc.styleScoped}`);
  console.log(`  - Script lang: ${result.sfc.scriptLang || 'js'}`);
  console.log(`  - Style lang: ${result.sfc.styleLang || 'css'}`);

  console.log('\n📥 Props:');
  for (const p of result.sfc.props) {
    console.log(`  - ${p.name}${p.type ? `: ${p.type}` : ''}${p.required ? ' (required)' : ''}`);
  }

  console.log('\n📤 Emits:');
  for (const e of result.sfc.emits) {
    console.log(`  - ${e.name}`);
  }

  console.log('\n🧩 Composables:');
  for (const c of result.sfc.composables) {
    console.log(`  - ${c.name} → { ${c.returns.join(', ')} }`);
  }

  console.log('\n🔌 Component usages:');
  for (const u of result.sfc.componentUsages) {
    console.log(`  - <${u.name}> props: [${u.props.join(', ')}] events: [${u.events.join(', ')}]`);
  }

  console.log('\n🎯 Directives:');
  const directivesByName = {};
  for (const d of result.sfc.directives) {
    const key = d.name + (d.argument ? `:${d.argument}` : '');
    directivesByName[key] = (directivesByName[key] || 0) + 1;
  }
  for (const [name, count] of Object.entries(directivesByName)) {
    console.log(`  - ${name} (${count}x)`);
  }

  console.log('\n📦 Imports:');
  for (const imp of result.sfc.imports) {
    console.log(`  - ${imp}`);
  }

  return result;
}

async function testSvelteParser() {
  console.log('\n' + '='.repeat(60));
  console.log('Testing SvelteParser');
  console.log('='.repeat(60));

  const parser = new SvelteParser();
  await parser.initialize();

  const result = await parser.parseFile('Counter.svelte', svelteContent);

  console.log('\n📊 Component Info:');
  console.log(`  - Component: ${result.component.componentName}`);
  console.log(`  - Lines: ${result.component.linesOfCode}`);
  console.log(`  - Has script: ${result.component.hasScript}`);
  console.log(`  - Has module script: ${result.component.hasModuleScript}`);
  console.log(`  - Has style: ${result.component.hasStyle}`);
  console.log(`  - Script lang: ${result.component.scriptLang || 'js'}`);
  console.log(`  - Style lang: ${result.component.styleLang || 'css'}`);

  console.log('\n📥 Props (export let):');
  for (const p of result.component.props) {
    console.log(`  - ${p.name}${p.type ? `: ${p.type}` : ''}${p.default ? ` = ${p.default}` : ''}`);
  }

  console.log('\n⚡ Reactive statements ($:):');
  for (const r of result.component.reactives) {
    console.log(`  - ${r.label ? `${r.label} = ` : ''}${r.expression.slice(0, 40)}...`);
    console.log(`    deps: [${r.dependencies.join(', ')}]`);
  }

  console.log('\n🏪 Stores ($):');
  for (const s of result.component.stores) {
    console.log(`  - $${s.name}`);
  }

  console.log('\n📤 Event dispatchers:');
  for (const d of result.component.dispatchers) {
    console.log(`  - dispatch('${d.eventName}')`);
  }

  console.log('\n🔌 Component usages:');
  for (const u of result.component.componentUsages) {
    console.log(`  - <${u.name}> events: [${u.events.join(', ')}]`);
  }

  console.log('\n🎬 Actions (use:):');
  for (const a of result.component.actions) {
    console.log(`  - use:${a.name}${a.parameters ? `={${a.parameters}}` : ''}`);
  }

  console.log('\n✨ Transitions:');
  for (const t of result.component.transitions) {
    console.log(`  - ${t.type}:${t.name}`);
  }

  console.log('\n🎰 Slots:');
  for (const s of result.component.slots) {
    console.log(`  - <slot name="${s.name}"${s.props.length ? ` props: [${s.props.join(', ')}]` : ''}>`);
  }

  console.log('\n📦 Imports:');
  for (const imp of result.component.imports) {
    console.log(`  - ${imp}`);
  }

  return result;
}

async function main() {
  console.log('🧪 Testing new parsers...\n');

  try {
    await testSCSSParser();
    console.log('\n✅ SCSSParser: OK');
  } catch (error) {
    console.error('\n❌ SCSSParser: FAILED');
    console.error(error);
  }

  try {
    await testVueParser();
    console.log('\n✅ VueParser: OK');
  } catch (error) {
    console.error('\n❌ VueParser: FAILED');
    console.error(error);
  }

  try {
    await testSvelteParser();
    console.log('\n✅ SvelteParser: OK');
  } catch (error) {
    console.error('\n❌ SvelteParser: FAILED');
    console.error(error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Tests completed!');
  console.log('='.repeat(60));
}

main().catch(console.error);
