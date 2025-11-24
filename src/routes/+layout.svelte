<script lang="ts">
  import "./layout.css";
  import { updated } from "$app/state";

  let { children } = $props();
</script>

<svelte:head>
  <title>BGRemover | LZArt</title>
  <link
    rel="icon"
    type="image/svg+xml"
    href="/favicon.svg"
  />
  <link
    rel="manifest"
    href="/manifest.json"
  />
</svelte:head>

<main>
  {@render children()}
</main>

{#if updated.current}
  <div class="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
    <div class="bg-warning text-warning-content px-4 py-2 rounded shadow">
      O site foi atualizado, por favor, recarregue a página!
    </div>
  </div>
{/if}
