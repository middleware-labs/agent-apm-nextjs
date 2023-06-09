'use strict';

export const track = (args = {}) => {
    return true;
};

const info = (message, attributes = {}) => {
    return true;
};

const warn = (message, attributes = {}) => {
    return true;
};

const debug = (message, attributes = {}) => {
    return true;
};

const error = (message, attributes = {}) => {
    return true;
};

const tracker = {
    track,
    info,
    error,
    warn,
    debug,
};

export default tracker;