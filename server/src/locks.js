export function createItemLock() {
    const locks = new Map();

    return async function withLock(key, fn) {
        const previous = locks.get(key) || Promise.resolve();

        let release;
        const current = new Promise((res) => (release = res));
        locks.set(key, previous.then(() => current));

        await previous;
        try {
            return await fn();
        } finally {
            release();
            if (locks.get(key) === current) locks.delete(key);
        }
    };
}
