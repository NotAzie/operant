/**
 * Operant V2 Persistent Hash Array Mapped Trie (HAMT)
 *
 * Implements an immutable, persistent 32-way bitmapped trie providing O(1)
 * structural sharing for operational reality snapshots and counterfactual branches.
 *
 * Memory overhead is strictly bounded, enabling thousands of concurrent temporal
 * branches without state duplication.
 */

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // Ensure 32-bit unsigned
}

function popcount(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

interface Node<V> {
  type: 'bitmap' | 'leaf' | 'collision';
}

class LeafNode<V> implements Node<V> {
  readonly type = 'leaf';
  constructor(
    readonly hash: number,
    readonly key: string,
    readonly value: V
  ) {}
}

class CollisionNode<V> implements Node<V> {
  readonly type = 'collision';
  constructor(
    readonly hash: number,
    readonly entries: Array<{ key: string; value: V }>
  ) {}
}

class BitmapNode<V> implements Node<V> {
  readonly type = 'bitmap';
  constructor(
    readonly bitmap: number,
    readonly children: Array<Node<V>>
  ) {}

  public getChild(index: number): Node<V> | undefined {
    const mask = 1 << index;
    if ((this.bitmap & mask) === 0) return undefined;
    const arrayIndex = popcount(this.bitmap & (mask - 1));
    return this.children[arrayIndex];
  }

  public setChild(index: number, child: Node<V>): BitmapNode<V> {
    const mask = 1 << index;
    const arrayIndex = popcount(this.bitmap & (mask - 1));
    const exists = (this.bitmap & mask) !== 0;

    const newChildren = this.children.slice();
    if (exists) {
      newChildren[arrayIndex] = child;
      return new BitmapNode(this.bitmap, newChildren);
    } else {
      newChildren.splice(arrayIndex, 0, child);
      return new BitmapNode(this.bitmap | mask, newChildren);
    }
  }

  public removeChild(index: number): BitmapNode<V> | undefined {
    const mask = 1 << index;
    if ((this.bitmap & mask) === 0) return this;
    const arrayIndex = popcount(this.bitmap & (mask - 1));
    const newChildren = this.children.slice();
    newChildren.splice(arrayIndex, 1);
    const newBitmap = this.bitmap ^ mask;
    if (newBitmap === 0) return undefined;
    return new BitmapNode(newBitmap, newChildren);
  }
}

export class PersistentHAMT<V = unknown> {
  private constructor(
    private readonly root: Node<V> | undefined,
    private readonly count: number
  ) {}

  public static empty<V = unknown>(): PersistentHAMT<V> {
    return new PersistentHAMT<V>(undefined, 0);
  }

  public size(): number {
    return this.count;
  }

  public get(key: string): V | undefined {
    if (!this.root) return undefined;
    const hash = fnv1a(key);
    return this.getNodeValue(this.root, hash, key, 0);
  }

  private getNodeValue(node: Node<V>, hash: number, key: string, shift: number): V | undefined {
    if (node.type === 'leaf') {
      const leaf = node as LeafNode<V>;
      return leaf.key === key ? leaf.value : undefined;
    }
    if (node.type === 'collision') {
      const coll = node as CollisionNode<V>;
      const match = coll.entries.find((e) => e.key === key);
      return match ? match.value : undefined;
    }
    const bitmapNode = node as BitmapNode<V>;
    const index = (hash >>> shift) & 0x1f;
    const child = bitmapNode.getChild(index);
    if (!child) return undefined;
    return this.getNodeValue(child, hash, key, shift + 5);
  }

  /**
   * Returns a new PersistentHAMT with the key-value pair set, sharing unchanged nodes.
   */
  public set(key: string, value: V): PersistentHAMT<V> {
    const hash = fnv1a(key);
    let sizeDelta = { value: 0 };
    const newRoot = this.insertNode(this.root, hash, key, value, 0, sizeDelta);
    return new PersistentHAMT(newRoot, this.count + sizeDelta.value);
  }

  private insertNode(
    node: Node<V> | undefined,
    hash: number,
    key: string,
    value: V,
    shift: number,
    sizeDelta: { value: number }
  ): Node<V> {
    if (!node) {
      sizeDelta.value = 1;
      return new LeafNode(hash, key, value);
    }

    if (node.type === 'leaf') {
      const leaf = node as LeafNode<V>;
      if (leaf.key === key) {
        return new LeafNode(hash, key, value); // Overwrite existing value
      }
      if (leaf.hash === hash) {
        // Hash collision
        sizeDelta.value = 1;
        return new CollisionNode(hash, [
          { key: leaf.key, value: leaf.value },
          { key, value },
        ]);
      }
      // Expand into bitmap node
      sizeDelta.value = 1;
      const emptyBitmap = new BitmapNode<V>(0, []);
      return this.insertNode(
        this.insertNode(emptyBitmap, leaf.hash, leaf.key, leaf.value, shift, { value: 0 }),
        hash,
        key,
        value,
        shift,
        { value: 0 }
      );
    }

    if (node.type === 'collision') {
      const coll = node as CollisionNode<V>;
      if (coll.hash === hash) {
        const existingIdx = coll.entries.findIndex((e) => e.key === key);
        const newEntries = coll.entries.slice();
        if (existingIdx >= 0) {
          newEntries[existingIdx] = { key, value };
        } else {
          sizeDelta.value = 1;
          newEntries.push({ key, value });
        }
        return new CollisionNode(hash, newEntries);
      }
      const emptyBitmap = new BitmapNode<V>(0, []);
      const index = (coll.hash >>> shift) & 0x1f;
      const bNode = emptyBitmap.setChild(index, coll);
      return this.insertNode(bNode, hash, key, value, shift, sizeDelta);
    }

    const bNode = node as BitmapNode<V>;
    const index = (hash >>> shift) & 0x1f;
    const child = bNode.getChild(index);
    const updatedChild = this.insertNode(child, hash, key, value, shift + 5, sizeDelta);
    return bNode.setChild(index, updatedChild);
  }

  /**
   * Fork current state into an independent shadow branch in O(1) time and memory.
   */
  public fork(): PersistentHAMT<V> {
    return new PersistentHAMT(this.root, this.count);
  }

  /**
   * Export all key-value entries as an iterable array
   */
  public entries(): Array<[string, V]> {
    const list: Array<[string, V]> = [];
    this.collectEntries(this.root, list);
    return list;
  }

  private collectEntries(node: Node<V> | undefined, list: Array<[string, V]>): void {
    if (!node) return;
    if (node.type === 'leaf') {
      const l = node as LeafNode<V>;
      list.push([l.key, l.value]);
    } else if (node.type === 'collision') {
      const c = node as CollisionNode<V>;
      for (const e of c.entries) {
        list.push([e.key, e.value]);
      }
    } else {
      const b = node as BitmapNode<V>;
      for (const ch of b.children) {
        this.collectEntries(ch, list);
      }
    }
  }
}
