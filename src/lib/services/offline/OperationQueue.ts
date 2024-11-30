import { v4 as uuidv4 } from 'uuid';
import type { PendingOperation } from '../../types';
import { IndexedDBStorage } from "../../storage/IndexedDB";

export class OperationQueue {
    constructor(private storage: IndexedDBStorage) {}

    private readonly MAX_RETRIES = 3;

    async enqueue(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
        const queuedOperation: PendingOperation = {
            id: uuidv4(),
            ...operation,
            timestamp: Date.now(),
            retryCount: 0
        };

        await this.storage.addPendingOperation(queuedOperation);
    }

    async dequeue(): Promise<PendingOperation | null> {
        const operations = await this.storage.getPendingOperationsOrderedByTimestamp();
        return operations.length > 0 ? operations[0] : null;
    }

    async remove(operationId: string): Promise<void> {
        await this.storage.deletePendingOperation(operationId);
    }

    async shouldRetry(operation: PendingOperation): Promise<boolean> {
        return operation.retryCount < this.MAX_RETRIES;
    }

    async updateRetryCount(operation: PendingOperation): Promise<void> {
        const updatedOperation = {
            ...operation,
            retryCount: operation.retryCount + 1
        };
        await this.storage.updatePendingOperation(updatedOperation);
    }
}