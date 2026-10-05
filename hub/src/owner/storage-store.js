const DATABASE = 'zhang-owner-upload-sessions-v2';
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => { for (const name of ['sessions','cleanup']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export function createUploadSessionStore(scope) {
  async function transaction(mode, task, collection = 'sessions') {
    const db = await openDatabase();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(collection, mode), store = tx.objectStore(collection); let result;
      const request = task(store); if (request) request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }
  return {
    async list() { return (await transaction('readonly', store => store.getAll())).filter(record => record.scope === scope).map(({ scope: ignored, ...record }) => record); },
    async put(record) { await transaction('readwrite', store => store.put({ ...record, scope })); },
    async remove(key) { await transaction('readwrite', store => store.delete(key)); },
    async cleanupList() { return (await transaction('readonly', store => store.getAll(), 'cleanup')).filter(record => record.scope === scope); },
    async cleanupPut(record) { await transaction('readwrite', store => store.put({ ...record, key: `${scope}:${record.id}:${record.storageKey}`, scope }), 'cleanup'); },
    async cleanupRemove(key) { await transaction('readwrite', store => store.delete(key), 'cleanup'); },
  };
}
