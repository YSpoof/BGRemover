import { browser } from "$app/environment";

const saveItem = <T>(key: string, value: T): void => {
  if (browser) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const getItem = <T>(key: string): T | null => {
  if (!browser) return null;
  const item = localStorage.getItem(key);
  return item ? (JSON.parse(item) as T) : null;
};

export const storage = {
  saveItem,
  getItem,
}