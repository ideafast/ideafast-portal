import { db } from '../database/database';
import { v4 as uuid } from 'uuid';
import { LOG_TYPE, LOG_ACTION, LOG_STATUS, USER_AGENT, userTypes } from '@itmat-broker/itmat-types';
import * as crypto from 'crypto';

// The number of data in one node
const maxNodeSize = 4;
// The number of nodes in one merkle tree
const maxTreeSize = 4;

class MerkleNode {
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

    // Build the merkle tree with a non-null list of nodes
    buildTree(nodes: MerkleNode[], hash: string[][], level: number): MerkleNode {
        if (level === 0) {
            this.allNodes.pop();
        }

        this.allNodes.push(nodes);
        for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            if (nodes[nodeIndex].hash !== hash[level][nodeIndex]) {
                throw Error('Incorrect hashes!');
            }
        }
        if (nodes.length === 1) {
            this.root = nodes[0];
            return this.root;
        } else {
            const levelNodes: MerkleNode[] = [];
            for (let i = 0; i < nodes.length; i += 2) {
                const left = nodes[i];
                const right = i + 1 < nodes.length ? nodes[i + 1] : null;
                const newNode = new MerkleNode(left, right, ['']);
                levelNodes.push(newNode);
            }
            return this.buildTree(levelNodes, hash, level + 1);
        }
    }

    // Call update tree when there is a new node added into this.leaves
    updateTree(newNode: MerkleNode | null, treeLevel: number) {
        const thisLevelNodes = this.allNodes[treeLevel];
        const thisLevelLastNode = thisLevelNodes[thisLevelNodes.length - 1];
        const nextLevelExisted = treeLevel + 1 < this.allNodes.length ? true : false;
        if (newNode === null) {
            thisLevelLastNode.hash = thisLevelLastNode.calculateHash();
            if (nextLevelExisted === true) {
                const nextLevelNodes = this.allNodes[treeLevel + 1];
                if (nextLevelNodes[nextLevelNodes.length - 1].right === null) {
                    nextLevelNodes[nextLevelNodes.length - 1].left = thisLevelLastNode;
                } else {
                    nextLevelNodes[nextLevelNodes.length - 1].right = thisLevelLastNode;
                }
                this.updateTree(null, treeLevel + 1);
            }
        } else {
            thisLevelNodes.push(newNode);
            if (thisLevelNodes.length % 2 === 1) {
                const upperNewNode = new MerkleNode(newNode, null, []);
                this.updateTree(upperNewNode, treeLevel + 1);
            } else {
                const upperNewNode = new MerkleNode(thisLevelLastNode, newNode, []);
                if (nextLevelExisted) {
                    if (newNode.right !== null) {
                        this.allNodes[treeLevel + 1].pop();
                        this.updateTree(upperNewNode, treeLevel + 1);
                    } else {
                        const nextLevelNodes = this.allNodes[treeLevel + 1];
                        nextLevelNodes[nextLevelNodes.length - 1] = upperNewNode;
                        this.updateTree(null, treeLevel + 1);
                    }
                } else {
                    console.log('Tree level increased');
                    this.root = upperNewNode;
                    this.allNodes.push([upperNewNode]);
                }
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
            this.updateTree(newNode, 0);
            console.log('Node full!');
        } else {
            leafNodes[leafNodes.length - 1].appendData(newData);
            this.updateTree(null, 0);
        }
    }

    isTreeFull(): boolean {
        if (this.allNodes[0].length < this.maxTreeSize) {
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
    private lastTreeIndex = 0;
    public lastTree: MerkleTree;

    constructor(data: string | null) {
        if (data === null) {
            this.lastTree = new MerkleTree(null);
        } else {
            this.lastTree = new MerkleTree(data);
        }
    }

    async initLog(): Promise<null> {
        const logs = await db.collections!.log_collection.find({}).toArray();
        console.log(`The number of logs in the database ${logs.length}`);
        const dataList: string[] = logs.map(document => JSON.stringify(document));

        if (dataList.length === 0) {
            console.log('Create an empty new tree');
            await db.collections!.hashnode_collection.insertOne({
                id: uuid(),
                treeIndex: this.lastTreeIndex,
                rootHash: this.lastTree.root.hash,
                dataBlocks: [],
                hashNodes: []
            });
        } else {
            for (let i = 0; i < dataList.length; i++) {
                if (this.lastTree.isTreeFull() === true) {
                    console.log('Create a new tree wiht the last hash');
                    const lastRootHash = this.lastTree.root.hash;
                    this.lastTree = new MerkleTree(lastRootHash);
                    this.lastTreeIndex += 1;
                    await db.collections!.hashnode_collection.insertOne({
                        id: uuid(),
                        treeIndex: this.lastTreeIndex,
                        rootHash: this.lastTree.root.hash,
                        dataBlocks: [[lastRootHash]],
                        hashNodes: [[this.lastTree.root.hash]]
                    });
                }
                await db.collections!.hashnode_collection.deleteOne({
                    rootHash: this.lastTree.root.hash
                });
                this.lastTree.appendData(dataList[i]);
                // Delete + insert = rewrite
                const dataBlocks = this.lastTree.allNodes[0].map((node) => node.dataBlocks);
                const hashNodes = [];
                for (const nodeList of this.lastTree.allNodes) {
                    const hashNode = [];
                    for (const node of nodeList) {
                        hashNode.push(node.hash);
                    }
                    hashNodes.push(hashNode);
                }
                await db.collections!.hashnode_collection.insertOne({
                    id: uuid(),
                    treeIndex: this.lastTreeIndex,
                    rootHash: this.lastTree.root.hash,
                    dataBlocks: dataBlocks,
                    hashNodes: hashNodes
                });

                console.log(i);
                console.log(this.lastTree.root.hash);
                console.log((await db.collections!.hashnode_collection.find({}).toArray()).map(tree => tree.rootHash));
                console.log('--------------------');
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

        if (this.lastTree.isTreeFull() === true) {
            const lastRootHash = this.lastTree.root.hash;
            this.lastTree = new MerkleTree(lastRootHash);
            this.lastTreeIndex += 1;
            console.log('Create a new tree wiht the last hash');
            await db.collections!.hashnode_collection.insertOne({
                id: uuid(),
                treeIndex: this.lastTreeIndex,
                rootHash: this.lastTree.root.hash,
                dataBlocks: [[lastRootHash]],
                hashNodes: [[this.lastTree.root.hash]]
            });
        }
        // Delete + insert = rewrite
        await db.collections!.hashnode_collection.deleteOne({
            rootHash: this.lastTree.root.hash
        });
        this.lastTree.appendData(dataString);

        const dataBlocks = this.lastTree.allNodes[0].map((node) => node.dataBlocks);
        const hashNodes = [];
        for (const nodeList of this.lastTree.allNodes) {
            const hashNode = [];
            for (const node of nodeList) {
                hashNode.push(node.hash);
            }
            hashNodes.push(hashNode);
        }
        await db.collections!.hashnode_collection.insertOne({
            id: uuid(),
            treeIndex: this.lastTreeIndex,
            rootHash: this.lastTree.root.hash,
            dataBlocks: dataBlocks,
            hashNodes: hashNodes
        });

        console.log(this.lastTree.root.hash);
        console.log((await db.collections!.hashnode_collection.find({}).toArray()).map(tree => tree.rootHash));
        console.log('--------------------');
        return null;
    }

    async verifyLog(data: string): Promise<null> {
        for (let index = 0; index < this.lastTreeIndex; index++) {
            const tmpLog = await db.collections!.hashnode_collection.findOne({
                treeIndex: index
            });

            if (tmpLog !== null) {
                const tmpTree = new MerkleTree(null);
                const tmpNodes = tmpLog.dataBlocks.map(dataBlock => new MerkleNode(null, null, dataBlock));
                const tmpHashes = tmpLog.hashNodes;
                tmpTree.buildTree(tmpNodes, tmpHashes, 0);
                if (tmpTree.verifyData(data)) {
                    console.log(`${data} found in tree ${tmpLog.rootHash}`);
                    break;
                }
            }
            else {
                throw Error('Logs not found!');
            }
        }
        return null;
    }

    signTree(privateKey: string): string {
        if (!this.lastTree.root) {
            throw new Error('Tree is empty');
        }
        const signer = crypto.createSign('SHA256');
        signer.update(this.lastTree.root.hash);
        return signer.sign(privateKey, 'hex');
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