export class OutputRegistry {
    constructor(logger: any);
    logger: any;
    files: Map<any, any>;
    warned: Set<any>;
    key(file: any): string;
    collision(file: any, previous: any, owner: any, kind?: string): void;
    canWriteAsset(file: any, owner: any): boolean;
    claim(file: any, owner: any, kind?: string): void;
    owns(file: any, owner: any): boolean;
    owner(file: any): any;
    kind(file: any): any;
    relocate(from: any, to: any): void;
    release(file: any, owner: any): void;
}
