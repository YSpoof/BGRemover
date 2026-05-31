<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Tween } from "svelte/motion";
  import { quadInOut } from "svelte/easing";
  import AlertIcon from "~icons/mdi/alert-outline";
  import CheckIcon from "~icons/mdi/check";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { storage } from "$lib/services/storage";
  import type {
    QueueItem,
    QueueItemStatus,
    WorkerCompletePayload,
    WorkerErrorPayload,
    WorkerProgressPayload,
  } from "$lib/types";

  const supportedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/gif",
  ]);

  const appState = $state({
    showIntro: storage.getItem("showIntro") ?? true,
    isLoading: false,
    isQueueRunning: false,
    preloadTask: "",
    queue: [] as QueueItem[],
    activeItemId: null as string | null,
  });

  const preloadProgress = new Tween(0, { duration: 300, easing: quadInOut });

  let worker: Worker | null = null;

  const revokeObjectUrl = (url: string | null) => {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const makeOutputFileName = (name: string) => `${name.replace(/\.[^/.]+$/, "")}.png`;

  const createQueueItem = (file: File): QueueItem => {
    const previewUrl = URL.createObjectURL(file);

    return {
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      previewUrl,
      outputUrl: null,
      outputFileName: makeOutputFileName(file.name),
      status: "pending",
      progress: 0,
      task: "",
      errorMessage: null,
    };
  };

  const updateQueueItem = (itemId: string, updater: (item: QueueItem) => void) => {
    const index = appState.queue.findIndex((item) => item.id === itemId);
    if (index === -1) return;

    updater(appState.queue[index]);
  };

  const markQueueItemError = (itemId: string, message: string) => {
    updateQueueItem(itemId, (item) => {
      item.status = "error";
      item.errorMessage = message;
      item.task = "error";
      item.progress = 0;
    });
  };

  const pendingCount = () => appState.queue.filter((item) => item.status === "pending" && item.file).length;
  const completedCount = () => appState.queue.filter((item) => item.status === "complete").length;
  const processingPosition = () => {
    const finished = appState.queue.filter((item) => item.status === "complete" || item.status === "error").length;
    return Math.min(finished + (appState.activeItemId ? 1 : 0), appState.queue.length);
  };

  const processNextPending = () => {
    if (!worker) {
      appState.isQueueRunning = false;
      appState.activeItemId = null;
      return;
    }

    const nextItem = appState.queue.find((item) => item.status === "pending" && item.file);

    if (!nextItem || !nextItem.file) {
      appState.isQueueRunning = false;
      appState.activeItemId = null;
      return;
    }

    appState.isQueueRunning = true;
    appState.activeItemId = nextItem.id;

    updateQueueItem(nextItem.id, (item) => {
      item.status = "processing";
      item.errorMessage = null;
      item.progress = 0;
      item.task = "processing";
    });

    worker.postMessage({
      type: "remove-bg",
      payload: {
        itemId: nextItem.id,
        file: nextItem.file,
      },
    });
  };

  const startQueue = () => {
    if (appState.isLoading || appState.isQueueRunning || !worker) return;
    if (pendingCount() === 0) return;

    processNextPending();
  };

  const initializeWorker = () => {
    if (worker || appState.isLoading) return;

    appState.isLoading = true;
    appState.preloadTask = "";
    preloadProgress.target = 0;

    worker = new Worker(new URL("../lib/workers/bg-removal.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = handleWorkerRuntimeError;
    worker.onmessageerror = handleWorkerMessageError;
    worker.postMessage({ type: "preload" });
  };

  const handleAcceptIntro = () => {
    appState.showIntro = false;
    storage.saveItem("showIntro", false);

    initializeWorker();
  };

  const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    if (!files.length)    return;

    for (const file of files) {
      if (!supportedMimeTypes.has(file.type)) {
        appState.queue.push({
          id: crypto.randomUUID(),
          file: null,
          fileName: file.name,
          previewUrl: null,
          outputUrl: null,
          outputFileName: makeOutputFileName(file.name),
          status: "error",
          progress: 0,
          task: "",
          errorMessage: "Formato de arquivo nao suportado.",
        });
        continue;
      }

      appState.queue.push(createQueueItem(file));
    }

    input.value = "";
  };

  const handleWorkerMessage = (event: MessageEvent) => {
    const { type, payload } = event.data as {
      type: string;
      payload?: unknown;
    };

    if (type === "preload-complete") {
      appState.isLoading = false;
      appState.preloadTask = "";
      preloadProgress.target = 100;
    } else if (type === "progress") {
      const progressPayload = payload as WorkerProgressPayload;

      if (progressPayload.phase === "preload") {
        appState.preloadTask = progressPayload.key;
        preloadProgress.target = progressPayload.percent;
        return;
      }

      if (progressPayload.phase === "remove" && progressPayload.itemId) {
        updateQueueItem(progressPayload.itemId, (item) => {
          item.task = progressPayload.key;
          item.progress = progressPayload.percent;
        });
      }
    } else if (type === "complete") {
      const completePayload = payload as WorkerCompletePayload;

      updateQueueItem(completePayload.itemId, (item) => {
        revokeObjectUrl(item.outputUrl);

        const outputBlob = new Blob([completePayload.data], { type: completePayload.mimeType });
        const outputUrl = URL.createObjectURL(outputBlob);

        item.outputUrl = outputUrl;
        item.outputFileName = completePayload.fileName ?? makeOutputFileName(item.fileName);
        item.status = "complete";
        item.progress = 100;
        item.task = "";
        item.errorMessage = null;
      });

      appState.activeItemId = null;
      processNextPending();
    } else if (type === "error") {
      const errorPayload = payload as WorkerErrorPayload;

      console.error("Worker error:", errorPayload.message);

      if (errorPayload.phase === "preload") {
        appState.preloadTask = "error";
        appState.isLoading = false;
        appState.isQueueRunning = false;
        appState.activeItemId = null;
        return;
      }

      if (errorPayload.itemId) {
        markQueueItemError(errorPayload.itemId, errorPayload.message);
      }

      appState.activeItemId = null;
      processNextPending();
    }
  };

  const handleWorkerRuntimeError = (event: ErrorEvent) => {
    console.error("Worker runtime error:", event.message);

    appState.isLoading = false;

    if (appState.activeItemId) {
      markQueueItemError(appState.activeItemId, "Falha inesperada no processamento.");
    }

    appState.activeItemId = null;
    appState.isQueueRunning = false;
  };

  const handleWorkerMessageError = (_event: MessageEvent) => {
    console.error("Worker message parsing error.");

    appState.isLoading = false;

    if (appState.activeItemId) {
      markQueueItemError(appState.activeItemId, "Erro de comunicacao com o worker.");
    }

    appState.activeItemId = null;
    appState.isQueueRunning = false;
  };

  const handleDownloadItem = (itemId: string) => {
    const item = appState.queue.find((entry) => entry.id === itemId);

    if (!item?.outputUrl) return;

    const link = document.createElement("a");
    link.href = item.outputUrl;
    link.download = item.outputFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const removeQueueItem = (itemId: string) => {
    const index = appState.queue.findIndex((item) => item.id === itemId);
    if (index === -1) return;

    const item = appState.queue[index];
    if (item.status === "processing") return;

    revokeObjectUrl(item.previewUrl);
    revokeObjectUrl(item.outputUrl);
    appState.queue.splice(index, 1);
  };

  const clearCompleted = () => {
    const remaining: QueueItem[] = [];

    for (const item of appState.queue) {
      if (item.status === "complete") {
        revokeObjectUrl(item.previewUrl);
        revokeObjectUrl(item.outputUrl);
      } else {
        remaining.push(item);
      }
    }

    appState.queue = remaining;
  };

  const retryItem = (itemId: string) => {
    updateQueueItem(itemId, (item) => {
      if (!item.file) return;

      revokeObjectUrl(item.outputUrl);
      item.outputUrl = null;
      item.status = "pending";
      item.progress = 0;
      item.task = "";
      item.errorMessage = null;
    });
  };

  const getStatusLabel = (status: QueueItemStatus) => {
    if (status === "pending") return "Pendente";
    if (status === "processing") return "Processando";
    if (status === "complete") return "Concluido";
    return "Erro";
  };

  const getStatusClass = (status: QueueItemStatus) => {
    if (status === "pending") return "badge-ghost";
    if (status === "processing") return "badge-info";
    if (status === "complete") return "badge-success";
    return "badge-error";
  };

  const getPreviewSrc = (item: QueueItem) => item.outputUrl ?? item.previewUrl;

  const cleanupQueueObjectUrls = () => {
    for (const item of appState.queue) {
      revokeObjectUrl(item.previewUrl);
      revokeObjectUrl(item.outputUrl);
    }
  };

  onMount(() => {
    if (!appState.showIntro) {
      initializeWorker();
    }
  });

  onDestroy(() => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    cleanupQueueObjectUrls();
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
            currentTask={appState.preloadTask}
            progress={preloadProgress.current}
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
              <span class="label-text">Selecione uma ou mais imagens</span>
              <input
                onchange={handleFileChange}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/svg+xml,image/bmp,image/gif"
                class="file-input file-input-bordered w-full"
                disabled={appState.isLoading}
              />
            </label>
          </div>

          <div class="grid gap-2 mt-6 sm:grid-cols-2">
            <button
              onclick={startQueue}
              disabled={appState.isQueueRunning || pendingCount() === 0}
              class="btn btn-primary"
            >
              {#if appState.isQueueRunning}
                <span class="loading loading-spinner loading-sm"></span>
                Processando fila...
              {:else}
                Iniciar ({pendingCount()})
              {/if}
            </button>

            <button
              onclick={clearCompleted}
              disabled={appState.isQueueRunning || completedCount() === 0}
              class="btn btn-outline"
            >
              Limpar concluidos ({completedCount()})
            </button>
          </div>

          {#if appState.queue.length > 0}
            <div class="mt-6 space-y-4">
              {#each appState.queue as item (item.id)}
                <article
                  class="card bg-base-200/60 border border-base-300"
                  class:border-primary={item.id === appState.activeItemId}
                >
                  <div class="card-body p-4">
                    <div class="flex flex-col gap-3 sm:flex-row">
                      <div class="w-full sm:w-32 h-24 shrink-0 rounded-lg bg-base-300 overflow-hidden flex items-center justify-center">
                        {#if getPreviewSrc(item)}
                          <img
                            src={getPreviewSrc(item)!}
                            alt={item.status === "complete" ? "Imagem processada" : "Imagem original"}
                            class="h-full w-full object-contain"
                          />
                        {:else}
                          <span class="text-xs opacity-60 px-2 text-center">Sem preview</span>
                        {/if}
                      </div>

                      <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <h2 class="font-semibold truncate">{item.fileName}</h2>
                          <span class={`badge ${getStatusClass(item.status)}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </div>

                        {#if item.errorMessage}
                          <p class="text-sm text-error mt-1">{item.errorMessage}</p>
                        {/if}

                        <div class="mt-2">
                          <div class="flex items-center justify-between text-xs opacity-80">
                            <span class="truncate">
                              {#if item.status === "pending"}
                                Aguardando
                              {:else if item.status === "processing"}
                                {item.task || "processando"}
                              {:else if item.status === "complete"}
                                Concluido
                              {:else}
                                Falhou
                              {/if}
                            </span>
                            <span>{item.progress.toFixed(0)}%</span>
                          </div>
                          <progress
                            class="progress progress-primary w-full mt-1"
                            value={item.progress}
                            max="100"
                          ></progress>
                        </div>

                        <div class="mt-3 flex flex-wrap gap-2">
                          {#if item.status === "complete" && item.outputUrl}
                            <button
                              onclick={() => handleDownloadItem(item.id)}
                              class="btn btn-sm btn-primary"
                            >
                              Baixar
                            </button>
                          {/if}

                          {#if item.status === "error" && item.file}
                            <button
                              onclick={() => retryItem(item.id)}
                              disabled={appState.isQueueRunning}
                              class="btn btn-sm btn-outline"
                            >
                              Tentar novamente
                            </button>
                          {/if}

                          <button
                            onclick={() => removeQueueItem(item.id)}
                            disabled={item.status === "processing"}
                            class="btn btn-sm btn-error btn-ghost"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-base-content/60 text-center mt-6">
              Selecione arquivos para montar sua fila de processamento.
            </p>
          {/if}

          <!-- Info -->
          <p class="text-xs text-base-content/60 text-center mt-4">
            {#if appState.isQueueRunning}
              Processando {processingPosition()} de {appState.queue.length} arquivo(s).
            {:else if completedCount() > 0}
              {completedCount()} arquivo(s) concluido(s). Baixe individualmente ou adicione mais imagens.
            {:else}
              Adicione imagens, inicie a fila e acompanhe o progresso de cada arquivo.
            {/if}
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>
