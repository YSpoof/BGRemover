<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Tween } from "svelte/motion";
  import { quadInOut } from "svelte/easing";
  import AlertIcon from "~icons/mdi/alert-outline";
  import CheckIcon from "~icons/mdi/check";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { storage } from "$lib/services/storage";
  const appState = $state({
    showIntro: storage.getItem("showIntro") ?? true,
    isLoading: false,
    isProcessing: false,
    isComplete: false,
    currentTask: "",
    selectedFile: null as File | null,
    previewUrl: null as string | null,
    processedPreviewUrl: null as string | null,
    outputUrl: null as string | null,
    outputFileName: "output.png",
  });

  const progress = new Tween(0, { duration: 300, easing: quadInOut });

  let worker: Worker;
  let activeObjectUrl: string | null = null;

  const revokeObjectUrl = (url: string | null) => {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const cleanupObjectUrl = () => {
    if (activeObjectUrl) {
      revokeObjectUrl(activeObjectUrl);
      activeObjectUrl = null;
    }
  };

  const handleAcceptIntro = () => {
    appState.showIntro = false;
    storage.saveItem("showIntro", false);
    appState.isLoading = true;

    // Initialize worker and start preload
    worker = new Worker(new URL("../lib/workers/bg-removal.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = handleWorkerMessage;

    // Offload preload to worker
    worker.postMessage({
      type: "preload",
    });
  };

  const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    cleanupObjectUrl();
    appState.outputUrl = null;
    appState.processedPreviewUrl = null;
    appState.isComplete = false;
    appState.currentTask = "";

    if (input && input.files && input.files[0]) {
      appState.selectedFile = input.files[0];
      const previewUrl = URL.createObjectURL(input.files[0]);
      appState.previewUrl = previewUrl;
      activeObjectUrl = previewUrl;
    } else {
      appState.selectedFile = null;
      appState.previewUrl = null;
    }
  };

  const handleWorkerMessage = (event: MessageEvent) => {
    const { type, payload } = event.data;

    if (type === "preload-complete") {
      appState.isLoading = false;
    } else if (type === "progress") {
      appState.currentTask = payload.key;
      progress.target = payload.percent;
    } else if (type === "complete") {
      appState.isProcessing = false;
      appState.currentTask = "";
      appState.isComplete = true;
      appState.selectedFile = null;

      cleanupObjectUrl();
      const outputBlob = new Blob([payload.data], { type: payload.mimeType });
      const outputUrl = URL.createObjectURL(outputBlob);
      appState.previewUrl = outputUrl;
      appState.processedPreviewUrl = outputUrl;
      appState.outputUrl = outputUrl;
      appState.outputFileName = payload.fileName ?? "output.png";
      activeObjectUrl = outputUrl;

      progress.target = 100;
    } else if (type === "error") {
      console.error("Worker error:", payload.message);
      appState.currentTask = "error";
      appState.isProcessing = false;
      appState.isLoading = false;
    }
  };

  const handleDownloadResult = () => {
    if (!appState.outputUrl) return;

    const link = document.createElement("a");
    link.href = appState.outputUrl;
    link.download = appState.outputFileName ?? "output.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleRemoveBackground = async () => {
    appState.isProcessing = true;
    progress.target = 0;
    appState.currentTask = "processing";

    if (appState.selectedFile) {
      const file = appState.selectedFile;
      worker.postMessage({
        type: "remove-bg",
        payload: { file },
      });
    } else {
      appState.isProcessing = false;
    }
  };

  onMount(() => {
    if (!appState.showIntro) {
      handleAcceptIntro();
    }
  });

  onDestroy(() => {
    if (worker) {
      worker.terminate();
    }
    cleanupObjectUrl();
  });
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
  <div class="w-full max-w-xl">
    {#if appState.showIntro}
      <!-- Intro Screen -->
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h1 class="card-title text-2xl mx-auto mb-4">Removedor de Background</h1>

          <div class="alert alert-warning mb-4">
            <AlertIcon class="text-2xl" />
            <div>
              <h3 class="font-bold">Aviso Importante</h3>
              <div class="text-sm">
                Esta ferramenta precisa baixar ~100 MB na primeira utilização.
              </div>
            </div>
          </div>

          <div class="space-y-3 mb-6">
            <div class="flex items-start gap-2">
              <CheckIcon class="text-xl text-primary" />
              <p class="text-sm">Processamento 100% no navegador</p>
            </div>
            <div class="flex items-start gap-2">
              <CheckIcon class="text-xl text-primary" />
              <p class="text-sm">Suas imagens nunca saem do seu dispositivo</p>
            </div>
          </div>

          <button
            onclick={handleAcceptIntro}
            class="uppercase btn btn-primary w-full"
          >
            Continuar e Baixar Dependências
          </button>
        </div>
      </div>
    {:else if appState.isLoading}
      <!-- Loading State -->
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body items-center text-center">
          <span class="loading loading-spinner loading-lg text-primary"></span>
          <h2 class="card-title mt-4">Inicializando...</h2>
          <p class="text-sm text-base-content/70">Carregando dependências...</p>
          <ProgressBar
            currentTask={appState.currentTask}
            progress={progress.current}
          />
        </div>
      </div>
    {:else}
      <!-- Main Interface -->
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h1 class="card-title text-2xl mx-auto">Removedor de Background</h1>

          <p class="text-center opacity-75">Simples, rápido, gratuito e 100% local!</p>

          <!-- File Input -->
          <div class="form-control w-full">
            <label class="label flex-col w-full">
              <span class="label-text">Selecione a Imagem</span>
              <input
                onchange={handleFileChange}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml,image/bmp,image/gif"
                class="file-input file-input-bordered w-full"
                disabled={appState.isProcessing}
              />
            </label>
          </div>

          <!-- Preview Image -->
          {#if appState.processedPreviewUrl ?? appState.previewUrl}
            <div class="mt-4">
              <img
                src={appState.processedPreviewUrl ?? appState.previewUrl!}
                alt={appState.isComplete ? "Imagem processada" : "Imagem original"}
                class="w-full max-w-9/12 mx-auto object-contain rounded-lg"
                class:animate-pulse={appState.isProcessing}
              />
            </div>
          {/if}

          <!-- Progress Bar -->
          {#if appState.isProcessing}
            <ProgressBar
              currentTask={appState.currentTask}
              progress={progress.current}
            />
          {/if}

          <!-- Process Button -->
          <button
            onclick={appState.isComplete ? handleDownloadResult : handleRemoveBackground}
            disabled={appState.isProcessing || (!appState.selectedFile && !appState.isComplete)}
            class="btn btn-primary w-full mt-6"
          >
            {#if appState.isProcessing}
              <span class="loading loading-spinner loading-sm"></span>
              Processando...
            {:else if appState.isComplete}
              Baixar imagem
            {:else if appState.selectedFile}
              Remover Background
            {:else}
              Selecione uma imagem primeiro
            {/if}
          </button>

          <!-- Info -->
          <p class="text-xs text-base-content/60 text-center mt-4">
            {#if appState.isComplete}
              Background removido com sucesso! Clique no botão para baixar o resultado.
            {:else}
              Após o upload, clique no botão para remover o background.
            {/if}
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>
