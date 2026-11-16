/**
 * @typedef {Object} Served
 * @property {string} root
 * @property {number} livereloadPort
 * @property {number} gen the child generation that last asked for it
 * @property {{ ready: Promise<void>, refresh: (path?: string) => void, close: () => Promise<void> }} handle
 */
/**
 * @typedef {Object} ChildRecord
 * @property {import('node:child_process').ChildProcess} proc
 * @property {number} gen
 * @property {boolean} expected the command is ending it: its exit is not news
 * @property {boolean} exited
 * @property {boolean} swept earlier children's unclaimed servers are retired
 * @property {Set<string>} asked the `host:port` pairs it has asked for
 * @property {number} before how many servers were up when it started
 * @property {Promise<void>} gone resolves on its exit
 */
/**
 * The two lines printed when the child ends by itself: what happened, what is
 * still served, and what starts another.
 *
 * @param {{ name: string, code: number|null, signal: string|null, served: string[] }} input `served` is one `./folder at address` per server
 * @returns {string}
 */
export function exitedLines({ name, code, signal, served }: {
    name: string;
    code: number | null;
    signal: string | null;
    served: string[];
}): string;
/**
 * Run the dev session.
 *
 * @param {Object} options
 * @param {string} options.script the resolved script file
 * @param {string[]} [options.args] the script's own arguments
 * @param {string} [options.cwd]
 * @param {Record<string, string|undefined>} [options.env]
 * @param {typeof nodeSpawn} [options.spawn]
 * @param {typeof startDevServer} [options.startServer]
 * @param {(file: string, options: object) => { on: Function, close: () => Promise<void> }} [options.watch] chokidar's `watch`
 * @param {NodeJS.EventEmitter} [options.signals] where SIGINT and SIGTERM are heard
 * @param {(line: string) => void} [options.say] the command's own lines
 * @param {string} [options.platform]
 * @param {(pid: number, signal: string) => void} [options.kill]
 * @param {number} [options.stopWait]
 * @returns {{ done: Promise<number>, stop: () => Promise<void> }} `done` resolves 0 once everything has stopped
 */
export function superviseDev({ script, args, cwd, env, spawn, startServer, watch, signals, say, platform, kill, stopWait, }: {
    script: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string | undefined>;
    spawn?: typeof nodeSpawn;
    startServer?: typeof startDevServer;
    watch?: (file: string, options: object) => {
        on: Function;
        close: () => Promise<void>;
    };
    signals?: NodeJS.EventEmitter;
    say?: (line: string) => void;
    platform?: string;
    kill?: (pid: number, signal: string) => void;
    stopWait?: number;
}): {
    done: Promise<number>;
    stop: () => Promise<void>;
};
export type Served = {
    root: string;
    livereloadPort: number;
    /**
     * the child generation that last asked for it
     */
    gen: number;
    handle: {
        ready: Promise<void>;
        refresh: (path?: string) => void;
        close: () => Promise<void>;
    };
};
export type ChildRecord = {
    proc: import("node:child_process").ChildProcess;
    gen: number;
    /**
     * the command is ending it: its exit is not news
     */
    expected: boolean;
    exited: boolean;
    /**
     * earlier children's unclaimed servers are retired
     */
    swept: boolean;
    /**
     * the `host:port` pairs it has asked for
     */
    asked: Set<string>;
    /**
     * how many servers were up when it started
     */
    before: number;
    /**
     * resolves on its exit
     */
    gone: Promise<void>;
};
import { spawn as nodeSpawn } from 'node:child_process';
import { startDevServer } from './dev-server.js';
