
const events = require('events');

class Queue extends events {
    constructor(options = {}) {
        super();

        options = options || {};

        this.concurrency = options.concurrency || Infinity;
        this.timeout = options.timeout || 0;
        this.autostart = options.autostart || false;
        this.results = options.results || null;
        this.pending = 0;
        this.session = 0;
        this.running = false;

        this.jobs = [];
        this.timers = {};
    }

    slice(begin, end) {
        this.jobs = this.jobs.slice(begin, end);

        return this;
    }

    reverse() {
        this.jobs.reverse();

        return this;
    }

    get length() {
        return this.pending + this.jobs.length;
    }

    clearTimers () {
        Object.keys(this.timers).forEach(key => {
            const timeoutId = this.timers[key];
            
            delete this.timers[key];
            
            clearTimeout(timeoutId);
        });
    }
    
    callOnErrorOrEnd (cb) {
        this.once('error', err => this.end(err));
        
        this.once('end', err =>
            cb(err, this.results)
        );
    }
    
    done (err) {
        this.session++;
        this.running = false;
    
        this.emit('end', err);
    }

    start(cb) {
        if (cb) {
            this.callOnErrorOrEnd(cb);
        }

        this.running = true;

        if (this.pending === this.concurrency) {
            return;
        }

        if (this.jobs.length === 0) {
            if (this.pending === 0) {
                this.done();
            }

            return;
        }

        const job = this.jobs.shift();
        let once = true;
        const session = this.session;
        let timeoutId = null;
        let didTimeout = false;
        let resultIndex = null;

        const next = (...args) => {
            const [err, result] = args;

            if (once && this.session === session) {
                once = false
                this.pending--
                if (timeoutId !== null) {
                    delete this.timers[timeoutId]
                    clearTimeout(timeoutId)
                }

                if (err) {
                    this.emit('error', err, job)
                } else if (didTimeout === false) {
                    if (resultIndex !== null) {
                        console.log()

                        this.results[resultIndex] = args.slice(1);
                    }
                    this.emit('success', result, job)
                }

                if (this.session === session) {
                    if (this.pending === 0 && this.jobs.length === 0) {
                        this.done();
                    } else if (this.running) {
                        this.start()
                    }
                }
            }
        }

        if (this.timeout) {
            timeoutId = setTimeout(() => {
                didTimeout = true;
            
                if (this.listeners('timeout').length > 0) {
                    this.emit('timeout', next, job);
                } else {
                    next();
                }

            }, this.timeout);

            this.timers[timeoutId] = timeoutId;
        }

        if (this.results) {
            resultIndex = this.results.length;
            
            this.results[resultIndex] = null;
        }

        this.pending++;

        const promise = job(next);

        if (promise && promise.then && typeof promise.then === 'function') {
            promise
                .then(result => next(null, result))
                .catch(err => next(err || true));
        }

        if (this.running && this.jobs.length > 0) {
            this.start();
        }
    }

    stop() {
        this.running = false;
    }

    end(err) {
        this.clearTimers();
        
        this.jobs = [];
        this.pending = 0;
        
        this.done(err);
    }
}

const arrayMethods = [
    'pop',
    'shift',
    'indexOf',
    'lastIndexOf'
];

arrayMethods.forEach(method => {
    Queue.prototype[method] = function (...args) {
        return Array.prototype[method].apply(this.jobs, args);
    }
});

const arrayAddMethods = [
    'push',
    'unshift',
    'splice'
];

arrayAddMethods.forEach(method => {
    Queue.prototype[method] = function (...args) {
        const methodResult = Array.prototype[method].apply(this.jobs, args);
        
        if (this.autostart) {
            this.start();
        }
        
        return methodResult;
    }
});

module.exports = Queue;