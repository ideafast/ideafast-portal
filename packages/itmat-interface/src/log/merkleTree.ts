import { db } from '../database/database';
import { v4 as uuid } from 'uuid';
import { LOG_TYPE, LOG_ACTION, LOG_STATUS, USER_AGENT, userTypes } from '@itmat-broker/itmat-types';
import * as crypto from 'crypto';

const maxNodeSize = 4;
const maxTreeSize = 4096;

class MerkleNode {
    // TODO: sign the root node
    public hash: string;
    public dataBlocks: string[];
    public left: MerkleNode | null;
    public right: MerkleNode | null;
    private maxNodeSize = maxNodeSize;
    public level: number;
    // Assume the leaf node is level 0

    constructor(left: MerkleNode | null, right: MerkleNode | null, dataBlocks: string[]) {
        this.left = left;
        this.right = right;
        this.dataBlocks = dataBlocks;
        this.hash = this.calculateHash();
        this.level = this.assignLevel();
    }

    appendData(data: string) {
        this.dataBlocks.push(data);
        this.hash = this.calculateHash();
    }

    isNodeFull(): boolean {
        if (this.dataBlocks.length < this.maxNodeSize) {
            return false;
        } else {
            return true;
        }
    }

    calculateHash(): string {
        const hasher = crypto.createHash('sha256');
        if (this.left === null && this.right === null) {
            const dataString = this.dataBlocks.join('');
            return hasher.update(dataString).digest('hex');
        } else {
            const leftHash = this.left ? this.left.hash : '';
            const rightHash = this.right ? this.right.hash : '';
            return hasher.update(leftHash + rightHash).digest('hex');
        }
    }

    assignLevel(): number {
        if (this.left === null && this.right === null) {
            return 0;
        } else {
            const leftLevel = this.left ? this.left.level : 0;
            const rightLevel = this.right ? this.right.level : 0;
            return Math.max(leftLevel, rightLevel) + 1;
        }
    }
}

export class MerkleTree {
    public root: MerkleNode;
    // The list of bottom level leaf nodes
    // allNodes tracks nodes with different levels
    public allNodes: MerkleNode[][] = [];
    private maxTreeSize = maxTreeSize;

    constructor(data: string | null) {
        if (data === null) {
            const tmpNode = new MerkleNode(null, null, []);
            this.root = tmpNode;
            this.allNodes.push([tmpNode]);
        } else {
            const tmpNode = new MerkleNode(null, null, [data]);
            this.root = tmpNode;
            this.allNodes.push([tmpNode]);
        }
    }

    // public async initTrees(): Promise<null> {
    //     const logs = await db.collections!.log_collection.find({}).toArray();
    //     const dataList: string[] = logs.map(document => JSON.stringify(document))

    //     function partitionArray(dataList: string[], size: number): string[][] {
    //         let result: string[][] = [];
    //         for (let i = 0; i < dataList.length; i += size) {
    //             result.push(dataList.slice(i, i + size));
    //         }
    //         return result;
    //     }

    //     const dataLists = partitionArray(dataList, 4);
    //     const leafNodes = dataLists.map(dataBlocks => new MerkleNode(null, null, dataBlocks));
    //     this.allNodes.push(leafNodes);
    //     this.root = this.buildTree(leafNodes);


    //     return null;
    // }

    // // Build the merkle tree with a list of nodes
    // buildTree(nodes: MerkleNode[]): MerkleNode | null {
    //     if (nodes.length === 0) {
    //         return null;
    //     } else if (nodes.length === 1) {
    //         this.allNodes.push([nodes[0]])
    //         return nodes[0];
    //     }
    //     const levelNodes: MerkleNode[] = [];
    //     for (let i = 0; i < nodes.length; i += 2) {
    //         const left = nodes[i];
    //         const right = i + 1 < nodes.length ? nodes[i + 1] : null;
    //         const newNode = new MerkleNode(left, right, ['']);
    //         levelNodes.push(newNode);
    //     }
    //     this.allNodes.push(levelNodes)
    //     return this.buildTree(levelNodes);
    // }

    // Call update tree when there is a new node added into this.leaves
    updateTree(newNode: MerkleNode, treeLevel: number) {
        const thisLevelNodes = this.allNodes[treeLevel];
        const thisLevelLastNode = thisLevelNodes[thisLevelNodes.length - 1];
        const nextLevelExisted = treeLevel + 1 < this.allNodes.length ? true : false;
        thisLevelNodes.push(newNode);
        if (thisLevelNodes.length % 2 === 1) {
            const upperNewNode = new MerkleNode(newNode, null, []);
            this.updateTree(upperNewNode, treeLevel + 1);
        } else {
            const upperNewNode = new MerkleNode(thisLevelLastNode, newNode, []);
            if (nextLevelExisted) {
                this.allNodes[treeLevel + 1].pop();
                this.updateTree(upperNewNode, treeLevel + 1);
            } else {
                this.allNodes.push([upperNewNode]);
            }
        }
    }

    getRootHash(): string | null {
        return this.root ? this.root.hash : null;
    }

    appendData(newData: string) {
        const leafNodes = this.allNodes[0];
        if (leafNodes[leafNodes.length - 1].isNodeFull()) {
            const newNode = new MerkleNode(null, null, [newData]);
            leafNodes.push(newNode);
            this.updateTree(newNode, 0);
        } else {
            leafNodes[leafNodes.length - 1].appendData(newData);
        }
    }

    isTreeFull(): boolean {
        if (this.allNodes.length < this.maxTreeSize) {
            return false;
        } else {
            const leafNodes = this.allNodes[0];
            if (leafNodes[leafNodes.length - 1].isNodeFull()) {
                return true;
            } else {
                return false;
            }
        }
    }

    private findParent(root: MerkleNode | null, child: MerkleNode): MerkleNode | null {
        if (root === null || root === child) {
            return null;
        }
        if (root.left === child || root.right === child) {
            return root;
        }

        // DFS search
        const rightSearch = this.findParent(root.right, child);
        if (rightSearch) {
            return rightSearch;
        }

        return this.findParent(root.left, child);
    }

    verifyData(data: string): boolean {
        // Find the leaf with target data string in the data block
        let targetNode = this.allNodes[0].find(node => node.dataBlocks.includes(data));
        if (!targetNode) {
            return false; // Data not found
        }

        // Calculate hash path up to the root
        let currentHash = targetNode.hash;
        let parent = this.findParent(this.root, targetNode);
        while (parent) {
            const combinedHash = parent.left === targetNode ? currentHash + (parent.right?.hash ?? '') : (parent.left?.hash ?? '') + currentHash;
            currentHash = crypto.createHash('sha256').update(combinedHash).digest('hex');
            if (parent === this.root && currentHash === this.root.hash) {
                return true; // Verified successfully up to the root
            }
            targetNode = parent;
            parent = this.findParent(this.root, parent);
        }
        return false;
    }
}

export class MerkleTreeLog {
    public latestTree: MerkleTree;

    constructor(data: string | null) {
        if (data === null) {
            this.latestTree = new MerkleTree(null);
        } else {
            this.latestTree = new MerkleTree(data);
        }
    }

    async initLog(): Promise<null> {
        const logs = await db.collections!.log_collection.find({}).toArray();
        const dataList: string[] = logs.map(document => JSON.stringify(document));

        if (dataList.length === 0) {
            await db.collections!.hashnode_collection.insertOne({
                id: uuid(),
                rootHash: this.latestTree.root.hash,
                dataBlocks: [],
                hashNodes: []
            });
        } else {
            for (let i = 0; i < dataList.length; i++) {
                if (this.latestTree.isTreeFull() === true) {
                    const lastRootHash = this.latestTree.root.hash;
                    this.latestTree = new MerkleTree(lastRootHash);
                    await db.collections!.hashnode_collection.insertOne({
                        id: uuid(),
                        rootHash: this.latestTree.root.hash,
                        dataBlocks: [[lastRootHash]],
                        hashNodes: [[this.latestTree.root.hash]]
                    });
                }
                this.latestTree.appendData(dataList[i]);
                // Delete + insert = rewrite
                await db.collections!.hashnode_collection.deleteOne({
                    rootHash: this.latestTree.root.hash
                });

                const dataBlocks = this.latestTree.allNodes[0].map((node) => node.dataBlocks);
                const hashNodes = [];
                for (const nodeList of this.latestTree.allNodes) {
                    const hashNode = [];
                    for (const node of nodeList) {
                        hashNode.push(node.hash);
                    }
                    hashNodes.push(hashNode);
                }
                await db.collections!.hashnode_collection.insertOne({
                    id: uuid(),
                    rootHash: this.latestTree.root.hash,
                    dataBlocks: dataBlocks,
                    hashNodes: hashNodes
                });
            }
        }
        return null;
    }

    async updateLog(requestContext: any): Promise<null> {
        const dataString = JSON.stringify({
            requesterName: requestContext.contextValue?.req?.user?.username ?? 'NA',
            requesterType: requestContext.contextValue?.req?.user?.type ?? userTypes.SYSTEM,
            userAgent: (requestContext.contextValue.req.headers['user-agent'] as string)?.startsWith('Mozilla') ? USER_AGENT.MOZILLA : USER_AGENT.OTHER,
            logType: LOG_TYPE.REQUEST_LOG,
            actionType: (LOG_ACTION as any)[requestContext.operationName],
            actionData: JSON.stringify(ignoreFieldsHelper(requestContext.request.variables, requestContext.operationName)),
            time: Date.now(),
            status: requestContext.errors === undefined ? LOG_STATUS.SUCCESS : LOG_STATUS.FAIL,
            errors: requestContext.errors === undefined ? '' : requestContext.errors[0].message
        });

        if (this.latestTree.isTreeFull() === true) {
            const lastRootHash = this.latestTree.root.hash;
            this.latestTree = new MerkleTree(lastRootHash);
            await db.collections!.hashnode_collection.insertOne({
                id: uuid(),
                rootHash: this.latestTree.root.hash,
                dataBlocks: [[lastRootHash]],
                hashNodes: [[this.latestTree.root.hash]]
            });
        }
        this.latestTree.appendData(dataString);
        // Delete + insert = rewrite
        await db.collections!.hashnode_collection.deleteOne({
            rootHash: this.latestTree.root.hash
        });

        const dataBlocks = this.latestTree.allNodes[0].map((node) => node.dataBlocks);
        const hashNodes = [];
        for (const nodeList of this.latestTree.allNodes) {
            const hashNode = [];
            for (const node of nodeList) {
                hashNode.push(node.hash);
            }
            hashNodes.push(hashNode);
        }
        await db.collections!.hashnode_collection.insertOne({
            id: uuid(),
            rootHash: this.latestTree.root.hash,
            dataBlocks: dataBlocks,
            hashNodes: hashNodes
        });
        return null;
    }
}

function ignoreFieldsHelper(dataObj: any, operationName: string) {
    if (operationName === 'login') {
        delete dataObj['password'];
        delete dataObj['totp'];
    } else if (operationName === 'createUser') {
        delete dataObj['user']['password'];
    } else if (operationName === 'registerPubkey') {
        delete dataObj['signature'];
    } else if (operationName === 'issueAccessToken') {
        delete dataObj['signature'];
    } else if (operationName === 'editUser') {
        delete dataObj['user']['password'];
    } else if (operationName === 'uploadDataInArray') {
        if (Array.isArray(dataObj['data'])) {
            for (let i = 0; i < dataObj['data'].length; i++) {
                // only keep the fieldId
                delete dataObj['data'][i].value;
                delete dataObj['data'][i].file;
                delete dataObj['data'][i].metadata;
            }
        }
    } else if (operationName === 'uploadFile') {
        delete dataObj['file'];
    }
    return dataObj;
}