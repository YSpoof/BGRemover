<script lang="ts">
  interface Props {
    progress: number;
    currentTask: string;
  }

  let { progress, currentTask }: Props = $props();
</script>

<!-- Progress Bar -->
<div class="mt-6">
  <div class="flex justify-between items-center gap-2 mb-2">
    <p class="text-sm font-semibold text-left">{currentTask}</p>
    <p class="text-sm text-base-content/70 text-right">{progress.toFixed(0)}%</p>
  </div>
  <progress
    class="progress progress-primary w-full"
    value={progress}
    max="100"
  ></progress>
</div>
