import { removeBackground, preload, type Config } from "@imgly/background-removal";

const baseUrl = self.location.origin;

const config: Config = {
  device: "gpu",
  publicPath: `${baseUrl}/models/`,
  debug: true,
  model: "isnet",
  progress: (key: string, current: number, total: number) => {
    const percent = Math.round((current / total) * 100);
    self.postMessage({
      type: "progress",
      payload: { key, current, total, percent },
    });
    console.log(`Progress [${key}]: ${percent}% (${current}/${total})`);
  },
  output: {
    format: "image/png",
    quality: 1,
  },
};

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === "preload") {
    try {
      await preload(config);
      self.postMessage({ type: "preload-complete" });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : "Preload failed",
        },
      });
    }
  } else if (type === "remove-bg") {
    try {
      const { file } = payload;

      const result = await removeBackground(file, config);
      const outputFileName = file instanceof File
        ? `${file.name.replace(/\.[^/.]+$/, "")}.png`
        : "output.png";
      const arrayBuffer = await result.arrayBuffer();

      self.postMessage({
        type: "complete",
        payload: {
          data: arrayBuffer,
          mimeType: result.type,
          fileName: outputFileName,
        },
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
};
