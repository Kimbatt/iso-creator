import { SvelteMap } from "svelte/reactivity";

export type LinkedListKey = string;

class LinkedListNode<TValue> {
    public key: LinkedListKey = $state("");
    public value: TValue;
    public prev: LinkedListNode<TValue> | null = $state(null);
    public next: LinkedListNode<TValue> | null = $state(null);

    constructor(key: LinkedListKey, value: TValue) {
        this.key = key;
        this.value = value;
    }
}

export class LinkedList<TValue> {
    public head: LinkedListNode<TValue> | null = $state(null);
    public tail: LinkedListNode<TValue> | null = $state(null);

    public nodeMap = new SvelteMap<LinkedListKey, LinkedListNode<TValue>>();

    public isEmpty() {
        return this.nodeMap.size === 0;
    }

    public get length() {
        return this.nodeMap.size;
    }

    public clear() {
        this.head = null;
        this.tail = null;
        this.nodeMap.clear();
    }

    public get(key: LinkedListKey) {
        return this.nodeMap.get(key);
    }

    public pushBack(key: LinkedListKey, value: TValue) {
        const node = $state(new LinkedListNode<TValue>(key, value));
        if (this.tail === null) {
            this.head = node;
            this.tail = node;
        } else {
            const tail = this.tail;
            tail.next = node;
            node.prev = tail;
            this.tail = node;
        }

        this.nodeMap.set(key, node);
        return node;
    }

    public remove(node: LinkedListNode<TValue>) {
        const isFirst = this.head !== null && node.key === this.head.key;
        const isLast = this.tail !== null && node.key === this.tail.key;

        const prev = node.prev;
        const next = node.next;

        if (prev !== null) {
            prev.next = next;
        }
        if (next !== null) {
            next.prev = prev;
        }

        node.prev = null;
        node.next = null;

        if (isFirst) {
            this.head = next;
        }
        if (isLast) {
            this.tail = prev;
        }

        this.nodeMap.delete(node.key);
    }

    public addAfter(node: LinkedListNode<TValue>, toAdd: LinkedListNode<TValue>) {
        const next = node.next;
        node.next = toAdd;
        toAdd.prev = next;

        this.nodeMap.set(toAdd.key, toAdd);
    }

    public addBefore(node: LinkedListNode<TValue>, toAdd: LinkedListNode<TValue>) {
        const prev = node.prev;
        node.prev = toAdd;
        toAdd.next = prev;

        this.nodeMap.set(toAdd.key, toAdd);
    }

    public changeKey(oldKey: LinkedListKey, newKey: LinkedListKey) {
        const node = this.nodeMap.get(oldKey);
        if (node === undefined) {
            return false;
        }

        if (this.nodeMap.has(newKey)) {
            return false;
        }

        this.nodeMap.delete(oldKey);
        node.key = newKey;
        this.nodeMap.set(newKey, node);
        return true;
    }

    public sortByKey(comparer: (a: LinkedListKey, b: LinkedListKey) => number) {
        if (this.head === null) {
            return;
        }

        const elements = [...this];
        elements.sort((a, b) => comparer(a.key, b.key));

        let current = elements[0];

        current.prev = null;
        this.head = current;

        const length = elements.length;
        for (let i = 1; i < length; ++i) {
            const next = elements[i];
            current.next = next;
            next.prev = current;

            current = next;
        }

        current.next = null;
        this.tail = current;
    }

    *[Symbol.iterator]() {
        let node = this.head;
        while (node !== null) {
            yield node;
            node = node.next;
        }
    }
}
