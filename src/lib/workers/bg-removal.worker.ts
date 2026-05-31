import { removeBackground, preload, type Config } from "@imgly/background-removal";
import type { IncomingMessage, WorkerPhase } from "$lib/types";

const baseUrl = self.location.origin;

let activePhase: WorkerPhase = "preload";
let activeItemId: string | null = null;

const config: Config = {
  device: "gpu",
  publicPath: `${baseUrl}/models/`,
  debug: true,
  model: "isnet",
  progress: (key: string, current: number, total: number) => {
    const percent = Math.round((current / total) * 100);
    self.postMessage({
      type: "progress",
      payload: {
        phase: activePhase,
        itemId: activeItemId,
        key,
        current,
        total,
        percent,
      },
    });
    if (activeItemId) {
      console.log(`Progress [${activeItemId}] [${key}]: ${percent}% (${current}/${total})`);
    } else {
      console.log(`Progress [${key}]: ${percent}% (${current}/${total})`);
    }
  },
  output: {
    format: "image/png",
    quality: 1,
  },
};

self.onmessage = async (event: MessageEvent) => {
  const message = event.data as IncomingMessage;

  if (message.type === "preload") {
    activePhase = "preload";
    activeItemId = null;

    try {
      await preload(config);
      self.postMessage({ type: "preload-complete" });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          phase: "preload",
          itemId: null,
          message: error instanceof Error ? error.message : "Preload failed",
        },
      });
    }
  } else if (message.type === "remove-bg") {
    const { file, itemId } = message.payload;

    try {
      activePhase = "remove";
      activeItemId = itemId;

      const result = await removeBackground(file, config);
      const outputFileName =
        file instanceof File ? `${file.name.replace(/\.[^/.]+$/, "")}.png` : "output.png";
      const arrayBuffer = await result.arrayBuffer();

      self.postMessage({
        type: "complete",
        payload: {
          itemId,
          data: arrayBuffer,
          mimeType: result.type,
          fileName: outputFileName,
        },
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          phase: "remove",
          itemId,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    } finally {
      activeItemId = null;
    }
  }
};
