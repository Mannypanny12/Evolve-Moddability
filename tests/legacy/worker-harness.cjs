'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createWorkerHarness(){
    const scriptPath = path.resolve(__dirname, '..', '..', 'evolve', 'evolve.js');
    const source = fs.readFileSync(scriptPath, 'utf8');

    let now = 0;
    let nextTimerId = 1;
    const timers = new Map();
    const listeners = new Map();
    const messages = [];

    const self = {
        addEventListener(type, callback){
            listeners.set(type, callback);
        },
        postMessage(message){
            messages.push(structuredClone(message));
        }
    };

    const context = vm.createContext({
        self,
        console,
        performance: {
            now(){
                return now;
            }
        },
        setTimeout(callback, delay){
            const id = nextTimerId++;
            timers.set(id, {
                callback,
                due: now + Number(delay)
            });
            return id;
        },
        clearTimeout(id){
            timers.delete(id);
        }
    });

    vm.runInContext(source, context, {
        filename: scriptPath
    });

    function send(data){
        const listener = listeners.get('message');
        if (!listener){
            throw new Error('Worker message listener was not registered');
        }
        listener({ data });
    }

    function nextTimer(){
        if (timers.size === 0){
            return null;
        }
        return Array.from(timers.entries())
            .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
    }

    function runNext(jitter = 0){
        const entry = nextTimer();
        if (!entry){
            throw new Error('No pending worker timer');
        }
        const [id, timer] = entry;
        timers.delete(id);
        now = timer.due + Number(jitter);
        timer.callback();
    }

    return {
        send,
        runNext,
        messages,
        pendingTimerCount(){
            return timers.size;
        },
        nextDelay(){
            const entry = nextTimer();
            return entry ? entry[1].due - now : null;
        },
        now(){
            return now;
        }
    };
}

module.exports = {
    createWorkerHarness
};
