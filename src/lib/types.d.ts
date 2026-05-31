export type QueueItemStatus = "pending" | "processing" | "complete" | "error";

export interface QueueItem {
  id: string;
  file: File | null;
  fileName: string;
  previewUrl: string | null;
  outputUrl: string | null;
  outputFileName: string;
  status: QueueItemStatus;
  progress: number;
  task: string;
  errorMessage: string | null;
}

export type WorkerPhase = "preload" | "remove";

export interface WorkerProgressPayload {
  phase: WorkerPhase;
  itemId: string | null;
  key: string;
  current: number;
  total: number;
  percent: number;
}

export interface WorkerCompletePayload {
  itemId: string;
  data: ArrayBuffer;
  mimeType: string;
  fileName: string;
}

export interface WorkerErrorPayload {
  phase: WorkerPhase;
  itemId: string | null;
  message: string;
}

export interface PreloadMessage {
  type: "preload";
}

export interface RemoveMessage {
  type: "remove-bg";
  payload: {
    itemId: string;
    file: File;
  };
}

export type IncomingMessage = PreloadMessage | RemoveMessage;
