export interface IHashNode {
    id: string;
    treeIndex: number;
    rootHash: string;
    dataBlocks: string[][];
    hashNodes:string[][];
}